import {
  type BriefField,
  type Completeness,
  emptyBrief,
  MANDATORY_FIELDS,
  type MandatoryField,
  type TravelBrief,
  USEFUL_FIELDS,
  type UsefulField,
} from "../../shared/brief";
import type { Awaiting, ServerEvent, Source, TurnUsage, UiBlock } from "../../shared/events";
import { cacheSavings, turnCost } from "../../shared/pricing";

/**
 * État du fil de conversation, dérivé des `ServerEvent` reçus par tour.
 * Pur et testable : `conversationReducer` ne fait aucun effet de bord.
 */

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `id-${idCounter}`;
}

export type MessagePart =
  | { kind: "text"; id: string; text: string }
  | { kind: "ui_block"; id: string; block: UiBlock }
  | { kind: "tool_activity"; id: string; tool: string; label: string }
  | { kind: "sources"; id: string; sources: Source[] }
  | { kind: "error"; id: string; message: string; retry: boolean };

export type TimelineEntry =
  | { type: "user"; id: string; text: string }
  | { type: "agent"; id: string; parts: MessagePart[] }
  | { type: "playbook"; id: string; label: string; reason: string };

export interface LoadedPlaybook {
  name: string;
  reason: string;
  origin: "spontaneous" | "nudged";
  turn: number;
}

export interface ConversationState {
  timeline: TimelineEntry[];
  brief: TravelBrief;
  completeness: Completeness;
  changedFields: BriefField[];
  awaiting: Awaiting;
  lastUsage: TurnUsage | null;
  /** Ce que la conversation a coûté depuis le début, en dollars, recherches web comprises. */
  coutCumule: number;
  /** Nombre de tours terminés : sert à lire le coût moyen par tour. */
  toursTermines: number;
  loadedPlaybooks: LoadedPlaybook[];
  /** Index dans `timeline` où commence le tour en cours : sert à effacer l'activité d'outil à `turn_end`. */
  turnStartIndex: number;
  /** Cumuls du cache sur la conversation : part de l'entrée relue, et dollars évités. */
  jetonsEntree: number;
  jetonsCache: number;
  economieCache: number;
  /** Ce que le serveur annonce : échéance de la conversation et tours encore possibles. */
  expiresAt: string | null;
  toursRestants: number | null;
}

export function createInitialState(): ConversationState {
  return {
    timeline: [],
    brief: emptyBrief(),
    completeness: { ready: false, mandatoryOk: 0, missing: [] },
    changedFields: [],
    awaiting: "text",
    lastUsage: null,
    coutCumule: 0,
    toursTermines: 0,
    loadedPlaybooks: [],
    turnStartIndex: 0,
    jetonsEntree: 0,
    jetonsCache: 0,
    economieCache: 0,
    expiresAt: null,
    toursRestants: null,
  };
}

export type ConversationAction =
  | {
      type: "hydrate";
      brief: TravelBrief;
      completeness: Completeness;
      welcomeText: string;
      expiresAt: string;
    }
  | { type: "user_message"; text: string }
  | { type: "server_event"; event: ServerEvent }
  | { type: "clear_changed_fields" }
  /**
   * Filet de sécurité côté client : la requête HTTP du tour s'est terminée (succès ou erreur),
   * qu'un `turn_end` ait été reçu ou non. Le flux SSE peut se fermer sans ce dernier événement
   * (écriture serveur en "fire and forget" sur une connexion qui se coupe) ; sans ce filet,
   * une ligne d'activité d'outil resterait affichée indéfiniment. Effacer deux fois ne coûte rien.
   */
  | { type: "turn_finished" }
  /** Reprise d'une conversation gardée par le navigateur après une actualisation. */
  | { type: "restore"; state: ConversationState; awaiting?: Awaiting };

/**
 * Les identifiants du fil sont un compteur qui repart de zéro à chaque chargement de page.
 * Après une reprise, le fil restauré porte déjà « id-1 », « id-2 »... : sans ce rattrapage, le
 * premier message écrit ensuite réutiliserait un identifiant existant, et React mélangerait
 * deux bulles qui portent la même clé.
 */
export function reprendreLesIdentifiants(state: ConversationState): void {
  let plusGrand = 0;
  const lire = (id: string) => {
    const numero = Number(id.slice("id-".length));
    if (Number.isFinite(numero) && numero > plusGrand) plusGrand = numero;
  };
  for (const entree of state.timeline) {
    lire(entree.id);
    if (entree.type === "agent") for (const part of entree.parts) lire(part.id);
  }
  idCounter = Math.max(idCounter, plusGrand);
}

function ensureAgentEntry(timeline: TimelineEntry[]): TimelineEntry[] {
  const last = timeline[timeline.length - 1];
  if (last && last.type === "agent") return timeline;
  return [...timeline, { type: "agent", id: nextId(), parts: [] }];
}

function updateLastAgentParts(
  timeline: TimelineEntry[],
  updater: (parts: MessagePart[]) => MessagePart[],
): TimelineEntry[] {
  const withAgent = ensureAgentEntry(timeline);
  const lastIndex = withAgent.length - 1;
  const last = withAgent[lastIndex];
  if (last?.type !== "agent") return withAgent;
  const updated: TimelineEntry = { ...last, parts: updater(last.parts) };
  return [...withAgent.slice(0, lastIndex), updated];
}

function appendTextDelta(parts: MessagePart[], text: string): MessagePart[] {
  const lastPart = parts[parts.length - 1];
  if (lastPart && lastPart.kind === "text") {
    return [...parts.slice(0, -1), { ...lastPart, text: lastPart.text + text }];
  }
  return [...parts, { kind: "text", id: nextId(), text }];
}

/**
 * Une seule ligne vivante à la fois : le dernier libellé reçu remplace le précédent au lieu de
 * s'empiler. Ces lignes sont de toute façon effacées du fil à `turn_end` (voir `stripToolActivity`).
 */
function appendToolActivity(parts: MessagePart[], tool: string, label: string): MessagePart[] {
  const lastPart = parts[parts.length - 1];
  if (lastPart && lastPart.kind === "tool_activity") {
    return [...parts.slice(0, -1), { ...lastPart, tool, label }];
  }
  return [...parts, { kind: "tool_activity", id: nextId(), tool, label }];
}

/**
 * Ponctuation qui ne peut pas commencer une phrase : sa présence en tête d'un morceau de texte
 * prouve que le morceau d'avant n'était pas fini.
 */
const PONCTUATION_ORPHELINE = /^[?!.,;:…»)\]]/;
/** En français, ces signes se précèdent d'une espace. */
const ESPACE_AVANT = /^[?!;:»]/;
/** Une phrase qui se termine ainsi n'attend pas de suite : rien à recoller derrière. */
const PHRASE_FINIE = /[.!?…»]["»)\s]*$/;

/**
 * L'agent écrit une phrase, appelle un outil, puis finit sa phrase. Une fois la ligne d'activité
 * effacée, les deux morceaux se retrouvent côte à côte et s'affichent en deux paragraphes : le
 * « ? » reste seul, plus bas. On recolle, mais seulement
 * quand le second morceau commence par une ponctuation : deux vraies phrases restent séparées.
 */
function recoller(parts: MessagePart[]): MessagePart[] {
  const recolles: MessagePart[] = [];
  for (const part of parts) {
    const precedent = recolles[recolles.length - 1];
    if (part.kind === "text" && precedent?.kind === "text") {
      const suite = part.text.trimStart();
      if (PONCTUATION_ORPHELINE.test(suite) && !PHRASE_FINIE.test(precedent.text.trimEnd())) {
        const debut = precedent.text.trimEnd();
        const liaison = ESPACE_AVANT.test(suite) ? " " : "";
        recolles[recolles.length - 1] = { ...precedent, text: `${debut}${liaison}${suite}` };
        continue;
      }
    }
    recolles.push(part);
  }
  return recolles;
}

/**
 * À la fin du tour, l'activité d'outil disparaît du fil : seules les sources (recherches web)
 * laissent une trace. Ne touche qu'aux entrées créées depuis le début du tour en cours.
 */
function stripToolActivity(timeline: TimelineEntry[], fromIndex: number): TimelineEntry[] {
  return timeline.map((entry, index) => {
    if (index < fromIndex || entry.type !== "agent") return entry;
    return {
      ...entry,
      parts: recoller(entry.parts.filter((part) => part.kind !== "tool_activity")),
    };
  });
}

const ALL_FIELDS: readonly BriefField[] = [...MANDATORY_FIELDS, ...USEFUL_FIELDS];

function computeChangedFields(previous: TravelBrief, next: TravelBrief): BriefField[] {
  const changed: BriefField[] = [];
  for (const field of ALL_FIELDS) {
    const isMandatory = (MANDATORY_FIELDS as readonly string[]).includes(field);
    const prevSlot = isMandatory
      ? previous.mandatory[field as MandatoryField]
      : previous.useful[field as UsefulField];
    const nextSlot = isMandatory
      ? next.mandatory[field as MandatoryField]
      : next.useful[field as UsefulField];
    if (JSON.stringify(prevSlot) !== JSON.stringify(nextSlot)) changed.push(field);
  }
  return changed;
}

export function conversationReducer(
  state: ConversationState,
  action: ConversationAction,
): ConversationState {
  if (action.type === "hydrate") {
    // Repart d'un état neuf : `hydrate` sert au premier chargement ET au « Préparer un autre
    // voyage », où il faut aussi oublier les playbooks chargés et le tour en attente.
    return {
      ...createInitialState(),
      brief: action.brief,
      completeness: action.completeness,
      expiresAt: action.expiresAt,
      timeline: [
        {
          type: "agent",
          id: nextId(),
          parts: [{ kind: "text", id: nextId(), text: action.welcomeText }],
        },
      ],
    };
  }
  if (action.type === "restore") {
    // Un onglet fermé en plein tour laisse une ligne « en train de... » que plus rien ne
    // refermera : aucun flux ne reviendra la clore. On nettoie tout le fil, pas le dernier tour.
    // Le bouton « Réessayer » d'une erreur restaurée ne peut plus aboutir : le tour qui l'a
    // produite est fini depuis longtemps. L'erreur sort du fil, comme l'activité d'outil.
    const timeline = stripToolActivity(action.state.timeline, 0).map((entree) =>
      entree.type === "agent"
        ? { ...entree, parts: entree.parts.filter((part) => part.kind !== "error") }
        : entree,
    );
    return {
      // Les valeurs de départ d'abord : ce que le navigateur a gardé hier peut venir d'une
      // version qui écrivait moins de champs, et une liste absente rend une page blanche.
      ...createInitialState(),
      ...action.state,
      timeline,
      turnStartIndex: timeline.length,
      changedFields: [],
      // Le serveur a le dernier mot sur l'état d'attente : un carnet validé pendant que le
      // navigateur était coupé ne doit pas se rouvrir avec ses boutons de validation.
      awaiting: action.awaiting ?? action.state.awaiting,
    };
  }
  if (action.type === "user_message") {
    const timeline = [
      ...state.timeline,
      { type: "user" as const, id: nextId(), text: action.text },
    ];
    return { ...state, timeline, turnStartIndex: timeline.length, changedFields: [] };
  }
  if (action.type === "clear_changed_fields") {
    return { ...state, changedFields: [] };
  }
  if (action.type === "turn_finished") {
    return { ...state, timeline: stripToolActivity(state.timeline, state.turnStartIndex) };
  }

  const event = action.event;
  switch (event.type) {
    case "text_delta":
      return {
        ...state,
        timeline: updateLastAgentParts(state.timeline, (parts) =>
          appendTextDelta(parts, event.text),
        ),
      };
    case "tool_activity":
      return {
        ...state,
        timeline: updateLastAgentParts(state.timeline, (parts) =>
          appendToolActivity(parts, event.tool, event.label),
        ),
      };
    case "sources":
      return {
        ...state,
        timeline: updateLastAgentParts(state.timeline, (parts) => [
          ...parts,
          { kind: "sources", id: nextId(), sources: event.sources },
        ]),
      };
    case "ui_block":
      return {
        ...state,
        timeline: updateLastAgentParts(state.timeline, (parts) => [
          ...parts,
          { kind: "ui_block", id: nextId(), block: event.block },
        ]),
      };
    case "brief_updated": {
      // Un tour appelle souvent plusieurs outils de brief à la suite (un `brief_updated` chacun) :
      // on cumule les champs touchés depuis le début du tour, pas seulement le dernier diff, sinon
      // seul le tout dernier champ mis à jour garde son surlignage à la fin du tour.
      const changed = computeChangedFields(state.brief, event.brief);
      const changedFields =
        changed.length === 0
          ? state.changedFields
          : Array.from(new Set([...state.changedFields, ...changed]));
      return {
        ...state,
        brief: event.brief,
        completeness: event.completeness,
        changedFields,
      };
    }
    case "playbook_loaded":
      return {
        ...state,
        timeline: [
          ...state.timeline,
          { type: "playbook", id: nextId(), label: event.label, reason: event.reason },
        ],
        loadedPlaybooks: [
          ...state.loadedPlaybooks,
          { name: event.name, reason: event.reason, origin: event.origin, turn: event.turn },
        ],
      };
    case "turn_end":
      return {
        ...state,
        timeline: stripToolActivity(state.timeline, state.turnStartIndex),
        awaiting: event.awaiting,
        lastUsage: event.usage,
        coutCumule: state.coutCumule + turnCost(event.usage),
        toursTermines: state.toursTermines + 1,
        jetonsEntree:
          state.jetonsEntree +
          event.usage.inputTokens +
          event.usage.cacheReadTokens +
          event.usage.cacheWriteTokens,
        jetonsCache: state.jetonsCache + event.usage.cacheReadTokens,
        economieCache: state.economieCache + cacheSavings(event.usage),
        expiresAt: event.expiresAt,
        toursRestants: event.turnsRemaining,
      };
    case "error":
      return {
        ...state,
        timeline: updateLastAgentParts(state.timeline, (parts) => [
          ...parts,
          { kind: "error", id: nextId(), message: event.message, retry: event.retry },
        ]),
      };
    default:
      return state;
  }
}

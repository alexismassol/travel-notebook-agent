import { randomUUID } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import type Anthropic from "@anthropic-ai/sdk";
import { emptyBrief, type TravelBrief } from "../shared/brief";
import type { Contact } from "../shared/contact";
import type { PlaybookName } from "./agent/playbooks";

/**
 * État d'une conversation, en mémoire. Suffisant pour la démonstration ; en production ce
 * serait une base (voir README, "prochaines étapes"). Les traces et les carnets validés sont
 * écrits dans `data/` (ignoré par git) pour pouvoir être relus.
 */

export interface PlaybookLoad {
  name: PlaybookName;
  turn: number;
  reason: string;
  /** spontaneous = l'agent l'a chargé seul ; nudged = après un rappel du serveur. */
  origin: "spontaneous" | "nudged";
}

/** Un outil terminal a arrêté le tour : on attend la réponse du voyageur pour le compléter. */
export interface PendingInteraction {
  toolUseId: string;
  kind: "choice" | "brief_confirmation";
  /** Résultats des autres outils du même appel, à renvoyer avec la réponse du voyageur. */
  otherResults: Anthropic.ToolResultBlockParam[];
  /** Libellés proposés par une question à choix : une réponse hors de cette liste est refusée. */
  options?: string[];
}

/** Au-delà, un tour de plus coûte sans rapprocher d'un brief : la conversation est close. */
export const MAX_TURNS_PER_CONVERSATION = 40;

/** Une conversation sans activité depuis 6 h est oubliée (mémoire bornée, démo en mémoire). */
export const CONVERSATION_TTL_MS = 6 * 60 * 60 * 1000;

export interface Conversation {
  id: string;
  createdAt: string;
  lastActiveAt: number;
  messages: Anthropic.MessageParam[];
  brief: TravelBrief;
  turn: number;
  busy: boolean;
  pending: PendingInteraction | null;
  /**
   * Questions à choix posées d'affilée. Sur une vraie conversation, le modèle a posé six
   * questions de suite, soit le formulaire déguisé que le produit refuse. Le serveur compte, le
   * modèle reçoit un rappel (`context.ts`).
   */
  consecutiveChoices: number;
  /** Nombre de fois où la question sur le départ et le budget a été posée. */
  usefulAsked: number;
  /**
   * Le récapitulatif a déjà été proposé au voyageur. Tant qu'il ne l'a pas été, le serveur le
   * redemande dès qu'un tour se termine sur un brief complet, sans question posée.
   */
  briefOffered: boolean;
  /** Défauts de ton du dernier tour, renvoyés au modèle au tour suivant. */
  lastReplyDefects: string[];
  /** Phrases de coulisses retirées par `createCoulissesFilter` : le modèle les écrit, le voyageur ne les voit pas. */
  coulissesRetirees: number;
  playbooks: PlaybookLoad[];
  /**
   * Rappels envoyés, avec la longueur de l'historique au moment du rappel. Le modèle ne voit le
   * rappel qu'à l'appel suivant : un chargement dans le même appel reste "spontaneous".
   */
  nudgedPlaybooks: Map<PlaybookName, number>;
  sentAt: string | null;
  /**
   * Prénom et adresse donnés au moment de valider le carnet, imprimés sur celui-ci. Ils vivent
   * hors du brief et hors de l'historique : le modèle ne les voit jamais.
   */
  contact: Contact | null;
}

/**
 * Échéance annoncée au voyageur. Elle part de la dernière activité, donc elle recule à chaque
 * message. Entre le début et la fin d'un tour elle ne bouge pas : la date affichée est un peu
 * plus tôt que la vraie, jamais plus tard, et on ne promet rien qu'on ne tienne.
 */
export function expiresAtOf(conversation: Conversation): string {
  return new Date(conversation.lastActiveAt + CONVERSATION_TTL_MS).toISOString();
}

const DATA_DIR = new URL("../../data/", import.meta.url);

export class ConversationStore {
  private readonly conversations = new Map<string, Conversation>();

  constructor(private readonly now: () => number = Date.now) {}

  create(): Conversation {
    this.evictExpired();
    const conversation: Conversation = {
      id: randomUUID(),
      createdAt: new Date(this.now()).toISOString(),
      lastActiveAt: this.now(),
      messages: [],
      brief: emptyBrief(),
      turn: 0,
      busy: false,
      pending: null,
      consecutiveChoices: 0,
      usefulAsked: 0,
      briefOffered: false,
      lastReplyDefects: [],
      coulissesRetirees: 0,
      playbooks: [],
      nudgedPlaybooks: new Map(),
      sentAt: null,
      contact: null,
    };
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }

  get(id: string): Conversation | undefined {
    const conversation = this.conversations.get(id);
    if (!conversation) return undefined;
    if (this.isExpired(conversation)) {
      this.conversations.delete(id);
      return undefined;
    }
    conversation.lastActiveAt = this.now();
    return conversation;
  }

  /**
   * Lecture passive : dit si la conversation existe encore, SANS repousser son échéance.
   * `get` la repousse à chaque appel, ce qui est juste pour un message mais faux pour une
   * relecture : une page laissée ouverte et rafraîchie toutes les heures garderait sinon une
   * conversation en mémoire indéfiniment.
   */
  peek(id: string): Conversation | undefined {
    const conversation = this.conversations.get(id);
    if (!conversation) return undefined;
    if (this.isExpired(conversation)) {
      this.conversations.delete(id);
      return undefined;
    }
    return conversation;
  }

  private isExpired(conversation: Conversation): boolean {
    return !conversation.busy && this.now() - conversation.lastActiveAt > CONVERSATION_TTL_MS;
  }

  /** Balayage à la création : pas de minuterie à gérer, coût proportionnel au nombre stocké. */
  private evictExpired(): void {
    for (const [id, conversation] of this.conversations) {
      if (this.isExpired(conversation)) this.conversations.delete(id);
    }
  }
}

export type TraceRecord = { conversationId: string; turn: number; at: string } & (
  | { kind: "tool_call"; tool: string; input: unknown; isError: boolean }
  | { kind: "playbook_loaded"; name: string; reason: string; origin: string }
  | { kind: "playbook_nudge"; name: string }
  | { kind: "turn_usage"; usage: unknown; stopReasons: string[] }
  | { kind: "text_leak" }
  | { kind: "coulisses_retirees"; count: number }
  /** État du brief après chaque mise à jour : rend calculables "atteint prêt" et "tours jusqu'à prêt". */
  | { kind: "brief_state"; version: number; mandatoryOk: number; ready: boolean }
  | { kind: "error"; message: string }
);

/**
 * File d'écriture par conversation : les appelants ne font pas `await` (une trace ne doit pas
 * ralentir un tour), donc sans elle deux `appendFile` concurrents peuvent s'inverser.
 */
const traceQueues = new Map<string, Promise<void>>();

/** Attend que toutes les traces déjà demandées pour une conversation soient écrites (tests, arrêt). */
export function flushTraces(conversationId: string): Promise<void> {
  return traceQueues.get(conversationId) ?? Promise.resolve();
}

/** Trace JSONL par conversation, dans l'ordre des appels. Un échec d'écriture ne casse jamais un tour. */
export function trace(record: TraceRecord): Promise<void> {
  const previous = traceQueues.get(record.conversationId) ?? Promise.resolve();
  const next = previous.then(() => writeTrace(record));
  traceQueues.set(record.conversationId, next);
  void next.then(() => {
    if (traceQueues.get(record.conversationId) === next) traceQueues.delete(record.conversationId);
  });
  return next;
}

async function writeTrace(record: TraceRecord): Promise<void> {
  try {
    const dir = new URL("traces/", DATA_DIR);
    await mkdir(dir, { recursive: true });
    await appendFile(new URL(`${record.conversationId}.jsonl`, dir), `${JSON.stringify(record)}\n`);
  } catch (error) {
    console.error("[trace] écriture impossible", error);
  }
}

/** Carnet validé : écrit dans data/briefs/ (ignoré par git) pour être relu. Rien ne quitte la machine. */
export async function persistSentBrief(conversation: Conversation, sentAt: string): Promise<void> {
  const dir = new URL("briefs/", DATA_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(
    new URL(`${conversation.id}.json`, dir),
    JSON.stringify({ sentAt, contact: conversation.contact, brief: conversation.brief }, null, 2),
  );
}

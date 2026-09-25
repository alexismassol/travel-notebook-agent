import { describe, expect, it } from "vitest";
import { emptyBrief } from "../../shared/brief";
import {
  type ConversationState,
  conversationReducer,
  createInitialState,
  type MessagePart,
} from "./conversation";

/**
 * Le bouton « Préparer un autre voyage » rejoue `hydrate` sur un état déjà vécu : sans ça, rien
 * ne permet de recommencer après un carnet validé.
 */
describe("recommencer une conversation", () => {
  it("efface le fil, les playbooks chargés et l'attente du tour précédent", () => {
    let state = conversationReducer(createInitialState(), {
      type: "hydrate",
      brief: emptyBrief(),
      completeness: { ready: false, mandatoryOk: 0, missing: [] },
      welcomeText: "Bonjour.",
      expiresAt: "2026-09-21T04:00:00.000Z",
    });
    state = conversationReducer(state, { type: "user_message", text: "Vietnam en novembre" });
    state = conversationReducer(state, {
      type: "server_event",
      event: {
        type: "playbook_loaded",
        name: "voyage-en-famille",
        label: "Conseils voyage en famille activés",
        reason: "en famille",
        origin: "spontaneous",
        turn: 1,
      },
    });
    expect(state.timeline.length).toBeGreaterThan(1);
    expect(state.loadedPlaybooks.length).toBe(1);

    const neuf = conversationReducer(state, {
      type: "hydrate",
      brief: emptyBrief(),
      completeness: { ready: false, mandatoryOk: 0, missing: [] },
      welcomeText: "Bonjour.",
      expiresAt: "2026-09-21T04:00:00.000Z",
    });
    expect(neuf.timeline).toHaveLength(1);
    expect(neuf.loadedPlaybooks).toEqual([]);
    expect(neuf.awaiting).toBe("text");
    expect(neuf.changedFields).toEqual([]);
  });
});

describe("ce que la conversation a coûté", () => {
  const finDeTour = (outputTokens: number, webSearches = 0) =>
    ({
      type: "server_event" as const,
      event: {
        type: "turn_end" as const,
        awaiting: "text" as const,
        expiresAt: "2026-09-21T04:00:00.000Z",
        turnsRemaining: 39,
        usage: {
          model: "claude-haiku-4-5",
          apiCalls: 1,
          inputTokens: 0,
          outputTokens,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          webSearches,
          firstTextMs: null,
          durationMs: 100,
        },
      },
    }) as const;

  it("le coût s'ajoute à chaque tour terminé, recherches web comprises", () => {
    let state = createInitialState();
    expect(state.coutCumule).toBe(0);
    state = conversationReducer(state, finDeTour(1_000_000));
    expect(state.coutCumule).toBeCloseTo(5, 6);
    state = conversationReducer(state, finDeTour(0, 3));
    expect(state.coutCumule).toBeCloseTo(5.03, 6);
    expect(state.toursTermines).toBe(2);
  });

  it("recommencer une conversation remet le compteur à zéro", () => {
    let state = conversationReducer(createInitialState(), finDeTour(1_000_000));
    state = conversationReducer(state, {
      type: "hydrate",
      brief: emptyBrief(),
      completeness: { ready: false, mandatoryOk: 0, missing: [] },
      welcomeText: "Bonjour.",
      expiresAt: "2026-09-21T04:00:00.000Z",
    });
    expect(state.coutCumule).toBe(0);
    expect(state.toursTermines).toBe(0);
  });
});

/**
 * Sur une vraie conversation, cela arrive deux fois : l'agent écrit une phrase, appelle un
 * outil, puis finit sa phrase par « ? ». La ligne d'activité s'efface à la fin du tour et laisse
 * deux morceaux de texte côte à côte : le point d'interrogation s'affiche seul, un paragraphe
 * plus bas. Ce n'est pas le filtre du texte, c'est le recollage qui manque.
 */
describe("texte coupé en deux par un appel d'outil", () => {
  const tour = (parts: MessagePart[]): MessagePart[] => {
    const etat: ConversationState = {
      ...createInitialState(),
      timeline: [{ type: "agent", id: "id-1", parts }],
    };
    const apres = conversationReducer(etat, { type: "turn_finished" });
    const entree = apres.timeline[0];
    return entree?.type === "agent" ? entree.parts : [];
  };

  it("une ponctuation restée seule se recolle à la phrase qui précède", () => {
    const parts = tour([
      { kind: "text", id: "a", text: "Avez-vous une idée du nombre de semaines" },
      { kind: "tool_activity", id: "b", tool: "note_dates", label: "Mise à jour de votre carnet" },
      { kind: "text", id: "c", text: "?" },
    ]);
    expect(parts).toEqual([
      { kind: "text", id: "a", text: "Avez-vous une idée du nombre de semaines ?" },
    ]);
  });

  it("deux vraies phrases restent deux paragraphes", () => {
    const parts = tour([
      { kind: "text", id: "a", text: "Fin octobre, bonne période." },
      { kind: "tool_activity", id: "b", tool: "note_dates", label: "Mise à jour de votre carnet" },
      { kind: "text", id: "c", text: "Votre projet est clair." },
    ]);
    expect(parts).toHaveLength(2);
  });

  it("un point ou une virgule se recollent sans espace avant", () => {
    const parts = tour([
      { kind: "text", id: "a", text: "C'est noté" },
      { kind: "tool_activity", id: "b", tool: "note_dates", label: "Mise à jour" },
      { kind: "text", id: "c", text: ". Voyons la suite." },
    ]);
    expect(parts).toEqual([{ kind: "text", id: "a", text: "C'est noté. Voyons la suite." }]);
  });
});

describe("le recollage ne touche pas une phrase déjà finie", () => {
  const tour = (parts: MessagePart[]): MessagePart[] => {
    const etat: ConversationState = {
      ...createInitialState(),
      timeline: [{ type: "agent", id: "id-1", parts }],
    };
    const apres = conversationReducer(etat, { type: "turn_finished" });
    const entree = apres.timeline[0];
    return entree?.type === "agent" ? entree.parts : [];
  };

  it("une phrase terminée par un point reste séparée de la suite", () => {
    const parts = tour([
      { kind: "text", id: "a", text: "Fin octobre, bonne période." },
      { kind: "tool_activity", id: "b", tool: "note_dates", label: "Mise à jour" },
      { kind: "text", id: "c", text: ", et voilà." },
    ]);
    expect(parts).toHaveLength(2);
  });
});

describe("reprise d'une conversation gardée par le navigateur", () => {
  /**
   * Ce que le navigateur a gardé hier n'a pas forcément tous les champs d'aujourd'hui : une
   * version antérieure de l'interface en écrivait moins. La reprise doit combler les trous, sinon
   * le premier composant qui lit une liste absente rend une page blanche.
   */
  const etatAncien = {
    timeline: [{ type: "user" as const, id: "id-1", text: "On part au Vietnam" }],
    brief: emptyBrief(),
    completeness: { ready: false, mandatoryOk: 0, missing: [] },
    awaiting: "text" as const,
    coutCumule: 0.03,
    toursTermines: 1,
  } as unknown as ConversationState;

  it("comble les champs absents avec leur valeur de départ", () => {
    const etat = conversationReducer(createInitialState(), {
      type: "restore",
      state: etatAncien,
    });
    expect(etat.loadedPlaybooks).toEqual([]);
    expect(etat.jetonsCache).toBe(0);
    expect(etat.lastUsage).toBeNull();
    expect(etat.expiresAt).toBeNull();
  });

  it("garde quand même ce que le voyageur avait dit", () => {
    const etat = conversationReducer(createInitialState(), {
      type: "restore",
      state: etatAncien,
    });
    expect(etat.timeline).toHaveLength(1);
    expect(etat.coutCumule).toBe(0.03);
  });
});

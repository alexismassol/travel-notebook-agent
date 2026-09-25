import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { ServerEvent } from "../../shared/events";
import { loadConfig } from "../config";
import { type Conversation, ConversationStore } from "../conversation";
import { buildUserContent } from "./context";
import { runTurn } from "./loop";

/**
 * Tests du DÉROULÉ de la boucle, avec un client qui rejoue des réponses écrites à l'avance.
 * Ils prouvent la gestion de l'historique et des invariants, pas le comportement du modèle
 * (celui-ci est couvert par tests/integration et docs/scenarios, sur l'API réelle).
 */

type Scripted = Anthropic.Message | Error;

function reply(content: unknown[], stopReason: string): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-haiku-4-5",
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  } as unknown as Anthropic.Message;
}

/** Une réponse du modèle qui a lancé une recherche web pendant cet appel. */
function replyAvecRecherche(content: unknown[]): Anthropic.Message {
  const message = reply(content, "tool_use") as Anthropic.Message & {
    usage: { server_tool_use?: { web_search_requests: number; web_fetch_requests: number } };
  };
  message.usage.server_tool_use = { web_search_requests: 1, web_fetch_requests: 0 };
  return message;
}

function scriptedClient(script: Scripted[]) {
  const requests: Anthropic.MessageCreateParams[] = [];
  const client = {
    messages: {
      stream(params: Anthropic.MessageCreateParams) {
        requests.push(structuredClone(params));
        const next = script.shift();
        const handlers: Record<string, (value: unknown) => void> = {};
        return {
          on(event: string, handler: (value: unknown) => void) {
            handlers[event] = handler;
            return this;
          },
          async finalMessage() {
            if (!next) throw new Error("script épuisé");
            if (next instanceof Error) throw next;
            for (const block of next.content) {
              // Comme le vrai flux : le texte arrive par l'événement "text", puis le bloc complet.
              if ((block as { type: string }).type === "text") {
                handlers.text?.((block as { text: string }).text);
              }
              handlers.contentBlock?.(block);
            }
            return next;
          },
        };
      },
    },
  } as unknown as Anthropic;
  return { client, requests };
}

/** Chaque tool_use doit avoir son tool_result dans le message suivant, sinon l'API répond 400. */
function danglingToolUses(conversation: Conversation): string[] {
  const dangling: string[] = [];
  conversation.messages.forEach((message, i) => {
    if (message.role !== "assistant" || typeof message.content === "string") return;
    const next = conversation.messages[i + 1];
    const answered = new Set(
      next && typeof next.content !== "string"
        ? next.content.flatMap((b) => (b.type === "tool_result" ? [b.tool_use_id] : []))
        : [],
    );
    for (const block of message.content) {
      if (block.type !== "tool_use") continue;
      if (!answered.has(block.id) && conversation.pending?.toolUseId !== block.id)
        dangling.push(block.id);
    }
  });
  return dangling;
}

const note = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input });
const duration = { status: "confirmed", min_nights: 10, max_nights: 10, quote: "10 jours" };
const travellers = {
  status: "confirmed",
  total_min: 3,
  total_max: 3,
  adults: 2,
  children_count: 1,
  children_ages: [4],
  label: "2 adultes, 1 enfant",
  quote: "notre fils de 4 ans",
};

async function turn(
  conversation: Conversation,
  script: Scripted[],
  maxModelCalls = 6,
  text = "bonjour",
) {
  const { client, requests } = scriptedClient(script);
  const events: ServerEvent[] = [];
  const awaiting = await runTurn(conversation, { kind: "text", text }, (e) => events.push(e), {
    client,
    config: { ...loadConfig({}), maxModelCalls },
  });
  return { awaiting, events, requests };
}

describe("runTurn - historique toujours valide pour l'API", () => {
  it("un appel d'outil coupé par max_tokens reçoit un résultat d'erreur, et le tour continue", async () => {
    const conversation = new ConversationStore().create();
    const { awaiting, requests } = await turn(conversation, [
      reply(
        [{ type: "text", text: "Je note" }, note("toolu_cut", "note_dates", { status: "vague" })],
        "max_tokens",
      ),
      reply([{ type: "text", text: "Pouvez-vous préciser la période ?" }], "end_turn"),
    ]);
    expect(danglingToolUses(conversation)).toEqual([]);
    expect(requests).toHaveLength(2);
    expect(awaiting).toBe("text");
    expect(conversation.brief.version).toBe(0);
  });

  it("un bloc de texte vide n'entre jamais dans l'historique", async () => {
    // Mesuré sur la campagne réelle : l'API a répondu 400 « text content blocks must be
    // non-empty » au tour suivant. Le modèle avait ouvert un bloc de texte sans rien écrire
    // avant son appel d'outil, et ce bloc repartait tel quel dans la requête.
    const conversation = new ConversationStore().create();
    await turn(conversation, [
      reply(
        [{ type: "text", text: "" }, note("toolu_vide", "note_duration", duration)],
        "tool_use",
      ),
      reply([{ type: "text", text: "Trois nuits, c'est noté." }], "end_turn"),
    ]);
    const vides = conversation.messages.flatMap((m) =>
      typeof m.content === "string"
        ? []
        : m.content.filter((b) => b.type === "text" && b.text.trim() === ""),
    );
    expect(vides).toEqual([]);
    expect(conversation.brief.version).toBe(1);
  });

  it("un refus qui contient un appel d'outil laisse aussi un historique valide", async () => {
    const conversation = new ConversationStore().create();
    await turn(conversation, [
      reply([note("toolu_refused", "note_duration", duration)], "refusal"),
    ]);
    expect(danglingToolUses(conversation)).toEqual([]);
    expect(conversation.brief.version).toBe(0);
  });

  it("outil terminal + note_* dans le même appel : attente, puis les deux résultats au tour suivant", async () => {
    const conversation = new ConversationStore().create();
    const { awaiting } = await turn(conversation, [
      reply(
        [
          note("toolu_note", "note_duration", duration),
          note("toolu_ask", "ask_choice", {
            question: "Plutôt quelle période ?",
            options: [{ label: "Février" }, { label: "Avril" }],
            multiSelect: false,
            allowFreeText: true,
          }),
        ],
        "tool_use",
      ),
    ]);
    expect(awaiting).toBe("choice");
    expect(conversation.pending?.toolUseId).toBe("toolu_ask");
    expect(conversation.brief.mandatory.duration.status).toBe("confirmed");

    const next = buildUserContent(
      conversation,
      { kind: "choice", toolUseId: "toolu_ask", selected: ["Février"] },
      new Date(),
    );
    const ids = next.flatMap((b) => (b.type === "tool_result" ? [b.tool_use_id] : []));
    expect(ids.sort()).toEqual(["toolu_ask", "toolu_note"]);
  });

  it("le dernier appel autorisé est forcé en texte", async () => {
    const conversation = new ConversationStore().create();
    const { requests } = await turn(
      conversation,
      [
        reply([note("toolu_1", "note_duration", duration)], "tool_use"),
        reply([{ type: "text", text: "Noté." }], "end_turn"),
      ],
      2,
    );
    expect(requests[0]?.tool_choice).toBeUndefined();
    expect(requests[1]?.tool_choice).toEqual({ type: "none" });
    expect(danglingToolUses(conversation)).toEqual([]);
  });
});

describe("runTurn - retour arrière complet sur erreur d'API", () => {
  it("messages, brief, tour, playbooks et rappels reviennent à l'état d'avant le tour", async () => {
    const conversation = new ConversationStore().create();
    const { awaiting, events } = await turn(conversation, [
      reply([note("toolu_kids", "note_travellers", travellers)], "tool_use"),
      new Error("529 overloaded"),
    ]);
    expect(awaiting).toBe("text");
    expect(conversation.messages).toHaveLength(0);
    expect(conversation.turn).toBe(0);
    expect(conversation.brief.version).toBe(0);
    expect(conversation.nudgedPlaybooks.size).toBe(0);
    expect(events.some((e) => e.type === "error")).toBe(true);
  });
});

describe("runTurn - libellés d'activité", () => {
  it("un libellé d'activité ne montre jamais une syntaxe d'outil fuitée par le modèle", async () => {
    const conversation = new ConversationStore().create();
    const leaked = '</antml parameter>\n<parameter name="country">Tanzanie';
    const { events } = await turn(conversation, [
      reply(
        [
          note("toolu_cards", "show_destination_cards", {
            cards: [{ name: leaked, country: "Tanzanie" }],
          }),
        ],
        "tool_use",
      ),
      reply([{ type: "text", text: "Voici." }], "end_turn"),
    ]);
    const labels = events.flatMap((e) => (e.type === "tool_activity" ? [e.label] : []));
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.join(" ")).not.toContain("<parameter");
  });
});

describe("runTurn - entrée d'outil de forme inattendue", () => {
  it("cards reçu en texte (observé sur Haiku) : le tour ne plante pas, l'outil renvoie une erreur", async () => {
    const conversation = new ConversationStore().create();
    const { awaiting, events } = await turn(conversation, [
      reply(
        [note("toolu_cards_str", "show_destination_cards", { cards: '[{"name":"Zanzibar"}]' })],
        "tool_use",
      ),
      reply([{ type: "text", text: "Je réessaie." }], "end_turn"),
    ]);
    expect(awaiting).toBe("text");
    expect(events.some((e) => e.type === "error")).toBe(false);
    expect(danglingToolUses(conversation)).toEqual([]);
  });
});

describe("runTurn - présentation du carnet décidée par le seuil", () => {
  const vietnam = [
    note("toolu_d", "note_destination", {
      status: "confirmed",
      mode: "fixed",
      places: ["Vietnam"],
      zone: "Vietnam",
      criteria: [],
      quote: "Vietnam",
    }),
    note("toolu_t", "note_dates", {
      status: "vague",
      earliest: "2027-11-01",
      latest: "2027-11-30",
      label: "novembre",
      quote: "en novembre",
    }),
    note("toolu_n", "note_duration", {
      status: "confirmed",
      min_nights: 21,
      max_nights: 21,
      quote: "3 semaines",
    }),
    note("toolu_v", "note_travellers", {
      status: "confirmed",
      total_min: 2,
      total_max: 2,
      adults: 2,
      children_count: 0,
      children_ages: [],
      label: "2 adultes",
      quote: "on est 2",
    }),
  ];

  const VIETNAM_SAID = "Vietnam, 3 semaines en novembre, on est 2, budget ~4000€";

  /** Le même projet, avec la ville de départ et le budget : plus rien d'utile ne manque. */
  const vietnamAvecUtiles = [
    ...vietnam,
    note("toolu_u", "note_preferences", {
      status: "confirmed",
      budget_max_eur: 4000,
      budget_per: "total",
      budget_status: "confirmed",
      departure_status: "confirmed",
      departure_city: "Paris",
      style: [],
      interests: [],
      constraints: [],
      nuances: [],
      quote: "on part de Paris, budget 4000 euros",
    }),
  ];

  it("brief devenu complet dans le tour sans récapitulatif : un appel forcé à present_brief suit", async () => {
    const conversation = new ConversationStore().create();
    const { awaiting, requests } = await turn(
      conversation,
      [
        reply(vietnamAvecUtiles, "tool_use"),
        reply([{ type: "text", text: "Parfait, je note tout ça." }], "end_turn"),
        reply(
          [
            note("toolu_p", "present_brief", {
              message: "Vietnam, 3 semaines en novembre, à deux.",
            }),
          ],
          "tool_use",
        ),
      ],
      6,
      VIETNAM_SAID,
    );
    expect(requests[2]?.tool_choice).toEqual({ type: "tool", name: "present_brief" });
    expect(awaiting).toBe("brief_confirmation");
    expect(conversation.pending?.toolUseId).toBe("toolu_p");
    expect(danglingToolUses(conversation)).toEqual([]);
  });

  it("brief devenu complet, mais l'agent a posé une question : pas d'appel forcé dans le même tour", async () => {
    const conversation = new ConversationStore().create();
    const { requests } = await turn(
      conversation,
      [
        reply(vietnam, "tool_use"),
        reply(
          [{ type: "text", text: "C'est noté. Avez-vous une fourchette de budget en tête ?" }],
          "end_turn",
        ),
      ],
      6,
      VIETNAM_SAID,
    );
    expect(requests).toHaveLength(2);
    expect(conversation.pending).toBeNull();
  });

  it("une question suivie d'une parenthèse compte encore comme une question", async () => {
    const conversation = new ConversationStore().create();
    const { requests } = await turn(
      conversation,
      [
        reply(vietnam, "tool_use"),
        reply([{ type: "text", text: "Combien de temps ? (pour affiner la saison)" }], "end_turn"),
      ],
      6,
      VIETNAM_SAID,
    );
    expect(requests).toHaveLength(2);
  });

  it("le récapitulatif reste proposé au tour suivant, une fois la question répondue", async () => {
    const conversation = new ConversationStore().create();
    await turn(
      conversation,
      [
        reply(vietnamAvecUtiles, "tool_use"),
        reply([{ type: "text", text: "C'est noté. Un budget en tête ?" }], "end_turn"),
      ],
      6,
      VIETNAM_SAID,
    );
    // Deuxième tour : le brief est déjà complet en entrant, et l'agent finit sans question.
    const { requests, awaiting } = await turn(
      conversation,
      [
        reply([{ type: "text", text: "Très bien, je note." }], "end_turn"),
        reply(
          [note("toolu_p3", "present_brief", { message: "Vietnam en novembre, à deux." })],
          "tool_use",
        ),
      ],
      6,
      "environ 4000 euros",
    );
    expect(requests).toHaveLength(2);
    expect(awaiting).toBe("brief_confirmation");
  });

  it("brief devenu complet dans le tour : une question à choix est refusée au profit du récapitulatif (cas réel Vietnam)", async () => {
    const conversation = new ConversationStore().create();
    const { awaiting, requests } = await turn(
      conversation,
      [
        reply(
          [
            ...vietnamAvecUtiles,
            note("toolu_q", "ask_choice", {
              question: "Qu'est-ce qui vous attire le plus ?",
              options: [{ label: "Les paysages" }, { label: "Les plages" }],
              multiSelect: false,
              allowFreeText: true,
            }),
          ],
          "tool_use",
        ),
        reply(
          [
            note("toolu_p2", "present_brief", {
              message: "Vietnam, 3 semaines en novembre, à deux.",
            }),
          ],
          "tool_use",
        ),
      ],
      6,
      VIETNAM_SAID,
    );
    const lastUser = requests[1]?.messages.at(-1);
    const refused = JSON.stringify(lastUser?.content);
    expect(refused).toContain("toolu_q");
    expect(refused).toContain("present_brief");
    expect(awaiting).toBe("brief_confirmation");
    expect(conversation.pending?.toolUseId).toBe("toolu_p2");
    expect(danglingToolUses(conversation)).toEqual([]);
  });

  it("brief déjà complet au début du tour : pas d'appel forcé (le voyageur a pu demander à modifier)", async () => {
    const conversation = new ConversationStore().create();
    await turn(
      conversation,
      [
        reply(vietnam, "tool_use"),
        reply([{ type: "text", text: "ok" }], "end_turn"),
        reply([note("toolu_p1", "present_brief", { message: "Récapitulatif." })], "tool_use"),
      ],
      6,
      VIETNAM_SAID,
    );
    conversation.pending = null;
    const { requests } = await turn(
      conversation,
      [reply([{ type: "text", text: "Bien noté." }], "end_turn")],
      6,
      VIETNAM_SAID,
    );
    expect(requests).toHaveLength(1);
  });
  /**
   * Vu à l'écran sur le scénario Vietnam : « Votre projet est complet » écrit deux fois de suite,
   * une fois pour demander la ville de départ, une fois pour présenter le carnet. Le serveur
   * demandait les deux choses dans le même tour.
   */
  describe("le manque se dit dans le récapitulatif, il ne bloque pas le carnet", () => {
    it("sans ville de départ, le carnet se présente quand même, en le signalant", async () => {
      const conversation = new ConversationStore().create();
      const { awaiting, requests } = await turn(
        conversation,
        [
          reply(vietnam, "tool_use"),
          reply(
            [note("toolu_pb", "present_brief", { message: "Vietnam, 3 semaines, à deux." })],
            "tool_use",
          ),
        ],
        6,
        VIETNAM_SAID,
      );
      // La consigne dit de présenter ET de signaler ce qui manque, dans le même message.
      const consigne = JSON.stringify(requests[1]?.messages.at(-1)?.content);
      expect(consigne).toMatch(/appelle present_brief maintenant/);
      expect(consigne).toMatch(/ville de départ/);
      expect(awaiting).toBe("brief_confirmation");
    });
  });
});

describe("runTurn - erreurs d'outil invisibles pour le voyageur", () => {
  it("tout résultat d'outil en erreur demande de ne pas en parler au voyageur (vu : « le serveur préfère... »)", async () => {
    const conversation = new ConversationStore().create();
    const { requests } = await turn(conversation, [
      reply([note("toolu_unknown", "outil_inexistant", {})], "tool_use"),
      reply([{ type: "text", text: "Voici." }], "end_turn"),
    ]);
    const results = JSON.stringify(requests[1]?.messages.at(-1)?.content);
    expect(results).toContain("Ne mentionne pas");
  });
});

describe("runTurn - texte affiché pendant un tour à plusieurs appels", () => {
  const visible = (events: ServerEvent[]) =>
    events.flatMap((e) => (e.type === "text_delta" ? [e.text] : [])).join("");

  it("vu à l'écran (scénario famille) : l'annonce qui précède des fiches ne s'empile plus", async () => {
    const conversation = new ConversationStore().create();
    const { events } = await turn(conversation, [
      reply(
        [
          { type: "text", text: "Des vacances de février, c'est noté. " },
          note("toolu_1", "note_duration", duration),
        ],
        "tool_use",
      ),
      reply(
        [
          { type: "text", text: "Laissez-moi vous montrer trois destinations. " },
          note("toolu_2", "show_destination_cards", { cards: [] }),
        ],
        "tool_use",
      ),
      reply([{ type: "text", text: "Laquelle vous tente ?" }], "end_turn"),
    ]);
    const text = visible(events);
    expect(text).toContain("Des vacances de février, c'est noté.");
    expect(text).toContain("Laquelle vous tente\u202f?");
    expect(text).not.toContain("Laissez-moi");
    // Le modèle garde son propre texte dans l'historique : seul l'affichage change.
    expect(JSON.stringify(conversation.messages)).toContain("Laissez-moi");
  });

  it("une réponse suivie seulement d'une note reste affichée", async () => {
    const conversation = new ConversationStore().create();
    const { events } = await turn(conversation, [
      reply(
        [{ type: "text", text: "Je regarde. " }, note("toolu_1", "note_duration", duration)],
        "tool_use",
      ),
      reply(
        [
          { type: "text", text: "Un visa n'est pas nécessaire pour les Français au Maroc. " },
          note("toolu_2", "note_duration", duration),
        ],
        "tool_use",
      ),
      reply([{ type: "text", text: "Qui part avec vous ?" }], "end_turn"),
    ]);
    expect(visible(events)).toContain("Un visa n'est pas nécessaire");
  });

  it("un appel intermédiaire qui finit par une question à choix garde son texte (réponse au visa, puis question)", async () => {
    const conversation = new ConversationStore().create();
    const { events } = await turn(conversation, [
      reply(
        [{ type: "text", text: "Je regarde. " }, note("toolu_1", "note_duration", duration)],
        "tool_use",
      ),
      reply(
        [
          { type: "text", text: "Oui, un visa est obligatoire pour la Tanzanie." },
          note("toolu_q", "ask_choice", {
            question: "Qui part avec vous ?",
            options: [{ label: "En couple" }, { label: "En famille" }],
            multiSelect: false,
            allowFreeText: true,
          }),
        ],
        "tool_use",
      ),
    ]);
    expect(visible(events)).toContain("un visa est obligatoire");
  });
});

describe("runTurn - une seule consigne de question suivante par appel", () => {
  it("deux note_* dans le même appel ne donnent pas deux consignes contradictoires", async () => {
    const conversation = new ConversationStore().create();
    const b = conversation.brief.mandatory;
    b.destination = {
      status: "confirmed",
      value: { mode: "fixed", places: ["Vietnam"], zone: "Vietnam", criteria: [] },
      alternatives: [],
      evidence: [{ quote: "Vietnam", turn: 0 }],
    };
    b.duration = {
      status: "confirmed",
      value: { minNights: 21, maxNights: 21 },
      alternatives: [],
      evidence: [{ quote: "3 semaines", turn: 0 }],
    };
    const { requests } = await turn(
      conversation,
      [
        reply(
          [
            note("toolu_t", "note_travellers", {
              status: "confirmed",
              total_min: 2,
              total_max: 2,
              adults: 2,
              children_count: 0,
              children_ages: [],
              label: "2 adultes",
              quote: "on est 2",
            }),
            note("toolu_d", "note_dates", {
              status: "vague",
              earliest: "2099-11-01",
              latest: "2099-11-30",
              label: "novembre",
              quote: "en novembre",
            }),
          ],
          "tool_use",
        ),
        reply(
          [note("toolu_p", "present_brief", { message: "Vietnam en novembre, à deux." })],
          "tool_use",
        ),
      ],
      6,
      "En novembre, on est 2.",
    );
    const sent = JSON.stringify(requests[1]?.messages.at(-1));
    const guidance =
      sent.match(/Question suivante|Le brief est complet : appelle present_brief/g) ?? [];
    // Une seule consigne. Ici c'est celle qui présente le carnet : les quatre essentiels sont là.
    // Elle demande de signaler dans le même message ce qui manque encore au carnet.
    expect(guidance).toEqual(["Le brief est complet : appelle present_brief"]);
    expect(sent).toMatch(/ville de départ/);
  });
});

describe("runTurn - question à choix en attente", () => {
  it("les options proposées sont gardées pour vérifier la réponse du voyageur", async () => {
    const conversation = new ConversationStore().create();
    await turn(conversation, [
      reply(
        [
          note("toolu_q", "ask_choice", {
            question: "Combien serez-vous ?",
            options: [{ label: "4 personnes" }, { label: "6 personnes" }],
            multiSelect: false,
            allowFreeText: true,
          }),
        ],
        "tool_use",
      ),
    ]);
    expect(conversation.pending?.options).toEqual(["4 personnes", "6 personnes"]);
  });
});

describe("le voyageur coupe la réponse", () => {
  it("un tour déjà coupé n'appelle pas le modèle et laisse la conversation intacte", async () => {
    const { client, requests } = scriptedClient([
      reply([{ type: "text", text: "Bonjour" }], "end_turn"),
    ]);
    const conversation = new ConversationStore().create();
    const avant = conversation.messages.length;
    const controleur = new AbortController();
    controleur.abort();
    const events: ServerEvent[] = [];
    await runTurn(conversation, { kind: "text", text: "bonjour" }, (e) => events.push(e), {
      client,
      config: loadConfig({}),
      signal: controleur.signal,
    });
    expect(requests).toHaveLength(0);
    expect(conversation.messages).toHaveLength(avant);
    expect(events.some((e) => e.type === "turn_end")).toBe(true);
  });
});

/**
 * La mesure du ton ne sert à rien si elle n'arrive pas au tour suivant. On vérifie la chaîne
 * entière : le texte lu par le voyageur, le défaut nommé, puis le rappel dans la requête d'après.
 */
describe("le défaut de ton du tour précédent revient au modèle", () => {
  it("une narration au tour 1 est citée au tour 2", async () => {
    const conversation = new ConversationStore().create();
    await turn(conversation, [
      reply([{ type: "text", text: "Laissez-moi enregistrer votre projet." }], "end_turn"),
    ]);
    expect(conversation.lastReplyDefects.join(" ")).toMatch(/raconté ton travail/);

    const { requests } = await turn(conversation, [
      reply([{ type: "text", text: "Le Vietnam en novembre est une bonne période." }], "end_turn"),
    ]);
    expect(JSON.stringify(requests[0]?.messages)).toMatch(/Dans ton message précédent/);
    expect(conversation.lastReplyDefects).toEqual([]);
  });
});

/**
 * Le cadrage produit demande une recommandation visuelle quand la destination est ouverte. Mesuré sur le
 * scénario « dépaysant sans les foules » : l'agent cherche, puis pose une question au lieu de
 * montrer les fiches. Il a pourtant tout ce qu'il faut pour recommander.
 */
describe("après une recherche, on montre des lieux, on ne questionne pas", () => {
  const avecPeriode = (conversation: Conversation) => {
    conversation.brief.mandatory.dates = {
      status: "vague",
      value: { earliest: "2027-05-01", latest: "2027-05-31", label: "mai" },
      alternatives: [],
      evidence: [{ quote: "en mai", turn: 1 }],
    };
  };

  it("une question à choix après une recherche est refusée, fiches demandées", async () => {
    const conversation = new ConversationStore().create();
    avecPeriode(conversation);
    const { requests } = await turn(
      conversation,
      [
        replyAvecRecherche([
          note("toolu_c", "ask_choice", {
            question: "Montagne ou mer ?",
            options: [{ label: "Montagne" }, { label: "Mer" }],
            multiSelect: false,
            allowFreeText: true,
          }),
        ]),
        reply([{ type: "text", text: "Voici trois idées." }], "end_turn"),
      ],
      6,
      "Un truc dépaysant sans les foules.",
    );
    expect(JSON.stringify(requests[1]?.messages.at(-1)?.content)).toMatch(/show_destination_cards/);
    expect(conversation.pending).toBeNull();
  });

  it("sans recherche dans le tour, la question reste permise", async () => {
    const conversation = new ConversationStore().create();
    avecPeriode(conversation);
    const { awaiting } = await turn(
      conversation,
      [
        reply(
          [
            note("toolu_c2", "ask_choice", {
              question: "Montagne ou mer ?",
              options: [{ label: "Montagne" }, { label: "Mer" }],
              multiSelect: false,
              allowFreeText: true,
            }),
          ],
          "tool_use",
        ),
      ],
      6,
      "Un truc dépaysant sans les foules.",
    );
    expect(awaiting).toBe("choice");
  });
});

describe("phrases de coulisses", () => {
  it("ne s'affichent pas, ne restent pas dans l'historique, et sont comptées", async () => {
    const conversation = new ConversationStore().create();
    const { events } = await turn(conversation, [
      reply(
        [
          {
            type: "text",
            text: "Je vais noter votre projet et charger les instructions. Le Vietnam en novembre est une bonne période.",
          },
        ],
        "end_turn",
      ),
    ]);
    const vu = events.flatMap((e) => (e.type === "text_delta" ? [e.text] : [])).join("");
    expect(vu).toBe("Le Vietnam en novembre est une bonne période.");
    expect(JSON.stringify(conversation.messages.at(-1))).not.toMatch(/Je vais noter/);
    expect(conversation.coulissesRetirees).toBe(1);
    // Le défaut reste signalé au modèle pour le tour suivant.
    expect(conversation.lastReplyDefects.join(" ")).toMatch(/raconté ton travail/);
  });
});

import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { emptyBrief } from "../shared/brief";
import { createApp } from "./app";
import { loadConfig } from "./config";
import {
  CONVERSATION_TTL_MS,
  ConversationStore,
  expiresAtOf,
  MAX_TURNS_PER_CONVERSATION,
} from "./conversation";

/**
 * Tests des routes HTTP sans appel au modèle : ils couvrent les refus qui se décident AVANT
 * la boucle (404, 400, 409). Le client Anthropic n'est jamais appelé dans ces cas ; s'il l'était,
 * le test échouerait sur l'exception levée.
 */
const unusedClient = new Proxy(
  {},
  {
    get() {
      throw new Error("le modèle ne doit pas être appelé dans ce test");
    },
  },
) as Anthropic;

function setup() {
  const store = new ConversationStore();
  const app = createApp({ client: unusedClient, config: loadConfig({}), store });
  const post = (path: string, body?: unknown) =>
    app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const get = (path: string) => app.request(path);
  return { store, post, get };
}

describe("routes", () => {
  it("crée une conversation avec un brief vide", async () => {
    const { post } = setup();
    const res = await post("/api/conversations");
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; completeness: { ready: boolean } };
    expect(body.id).toMatch(/[0-9a-f-]{36}/);
    expect(body.completeness.ready).toBe(false);
  });

  it("404 sur une conversation inconnue", async () => {
    const { post } = setup();
    const res = await post("/api/conversations/inconnue/turns", { kind: "text", text: "salut" });
    expect(res.status).toBe(404);
  });

  it("400 sur un corps invalide ou un texte vide", async () => {
    const { store, post } = setup();
    const { id } = store.create();
    expect(
      (await post(`/api/conversations/${id}/turns`, { kind: "text", text: "   " })).status,
    ).toBe(400);
    expect((await post(`/api/conversations/${id}/turns`, { nope: 1 })).status).toBe(400);
  });

  it("400 sur une réponse à choix sans question en attente, sans rien modifier", async () => {
    const { store, post } = setup();
    const conversation = store.create();
    const res = await post(`/api/conversations/${conversation.id}/turns`, {
      kind: "choice",
      toolUseId: "toolu_x",
      selected: ["Plage"],
    });
    expect(res.status).toBe(400);
    expect(conversation.turn).toBe(0);
    expect(conversation.busy).toBe(false);
  });

  it("409 si un tour est déjà en cours (deux requêtes simultanées)", async () => {
    const { store, post } = setup();
    const conversation = store.create();
    conversation.busy = true;
    const res = await post(`/api/conversations/${conversation.id}/turns`, {
      kind: "text",
      text: "salut",
    });
    expect(res.status).toBe(409);
  });

  it("garde le contact donné à la validation, et l'écrit à côté du brief", async () => {
    const store = new ConversationStore();
    let ecrit: { contact: unknown } | null = null;
    const app = createApp({
      client: unusedClient,
      config: loadConfig({}),
      store,
      persist: async (conversation) => {
        ecrit = { contact: conversation.contact };
      },
    });
    const conversation = store.create();
    conversation.brief = readyBrief();
    const res = await app.request(`/api/conversations/${conversation.id}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact: { firstName: " Alexis ", email: "Alexis@PM.ME" } }),
    });
    expect(res.status).toBe(200);
    expect(conversation.contact).toEqual({ firstName: "Alexis", email: "alexis@pm.me" });
    expect(ecrit).toEqual({ contact: { firstName: "Alexis", email: "alexis@pm.me" } });
  });

  it("ne retient aucun contact quand la validation est refusée", async () => {
    const { store, post } = setup();
    const occupee = store.create();
    occupee.brief = readyBrief();
    occupee.busy = true;
    const refusBusy = await post(`/api/conversations/${occupee.id}/send`, {
      contact: { firstName: "Alexis", email: "alexis@pm.me" },
    });
    expect(refusBusy.status).toBe(409);
    expect(occupee.contact).toBeNull();

    const incomplete = store.create();
    const refusIncomplet = await post(`/api/conversations/${incomplete.id}/send`, {
      contact: { firstName: "Alexis", email: "alexis@pm.me" },
    });
    expect(refusIncomplet.status).toBe(409);
    expect(incomplete.contact).toBeNull();
  });

  it("la première validation fait foi : une seconde ne change pas le contact", async () => {
    const store = new ConversationStore();
    const ecrits: (string | null)[] = [];
    const app = createApp({
      client: unusedClient,
      config: loadConfig({}),
      store,
      persist: async (conversation) => {
        ecrits.push(conversation.contact?.email ?? null);
      },
    });
    const conversation = store.create();
    conversation.brief = readyBrief();
    const envoi = (email: string) =>
      app.request(`/api/conversations/${conversation.id}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contact: { firstName: "Alexis", email } }),
      });
    expect((await envoi("alexis@pm.me")).status).toBe(200);
    expect((await envoi("quelqun.autre@pm.me")).status).toBe(200);
    // Une seule écriture, et la mémoire du serveur dit la même chose que le fichier parti.
    expect(ecrits).toEqual(["alexis@pm.me"]);
    expect(conversation.contact?.email).toBe("alexis@pm.me");
  });

  it("400 sur une adresse e-mail mal formée, et rien n'est validé", async () => {
    const { store, post } = setup();
    const conversation = store.create();
    conversation.brief = readyBrief();
    const res = await post(`/api/conversations/${conversation.id}/send`, {
      contact: { firstName: "Alexis", email: "alexis.pm.me" },
    });
    expect(res.status).toBe(400);
    expect(conversation.sentAt).toBeNull();
    expect(conversation.contact).toBeNull();
  });

  it("accepte encore une validation sans contact du tout", async () => {
    const store = new ConversationStore();
    // Un persist injecté : sans lui, ce test écrirait un vrai fichier dans data/briefs.
    const app = createApp({
      client: unusedClient,
      config: loadConfig({}),
      store,
      persist: async () => {},
    });
    const post = (path: string) => app.request(path, { method: "POST" });
    const conversation = store.create();
    conversation.brief = readyBrief();
    const res = await post(`/api/conversations/${conversation.id}/send`);
    expect(res.status).toBe(200);
    expect(conversation.contact).toBeNull();
  });

  it("409 à la validation d'un brief incomplet, et rien n'est marqué validé", async () => {
    const { store, post } = setup();
    const conversation = store.create();
    const res = await post(`/api/conversations/${conversation.id}/send`);
    expect(res.status).toBe(409);
    expect(conversation.sentAt).toBeNull();
  });
});

describe("limites de ressources", () => {
  it("413 sur un corps trop gros, avant tout parsing", async () => {
    const { store, post } = setup();
    const { id } = store.create();
    const res = await post(`/api/conversations/${id}/turns`, {
      kind: "text",
      text: "x".repeat(40_000),
    });
    expect(res.status).toBe(413);
  });

  it("413 aussi sur la création de conversation (route déclarée avant la limite)", async () => {
    const { post } = setup();
    const res = await post("/api/conversations", { text: "x".repeat(40_000) });
    expect(res.status).toBe(413);
  });

  it("409 sur la validation pendant qu'un tour est en cours", async () => {
    const { store, post } = setup();
    const conversation = store.create();
    conversation.brief = readyBrief();
    conversation.busy = true;
    const res = await post(`/api/conversations/${conversation.id}/send`);
    expect(res.status).toBe(409);
    expect(conversation.sentAt).toBeNull();
  });

  it("429 quand la conversation a atteint le nombre maximum de tours", async () => {
    const { store, post } = setup();
    const conversation = store.create();
    conversation.turn = MAX_TURNS_PER_CONVERSATION;
    const res = await post(`/api/conversations/${conversation.id}/turns`, {
      kind: "text",
      text: "encore",
    });
    expect(res.status).toBe(429);
  });
});

/**
 * Actualiser la page ne doit plus tout perdre. Le navigateur garde le fil visible ; le serveur
 * dit seulement s'il a encore la conversation, et jusqu'à quand.
 */
describe("reprendre une conversation après une actualisation", () => {
  it("la lecture dit jusqu'à quand la conversation vit et combien de tours restent", async () => {
    const { post, get } = setup();
    const cree = (await (await post("/api/conversations")).json()) as {
      id: string;
      expiresAt: string;
    };
    const res = await get(`/api/conversations/${cree.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      expiresAt: string;
      turnsRemaining: number;
      sentAt: string | null;
    };
    expect(body.id).toBe(cree.id);
    expect(body.sentAt).toBeNull();
    expect(body.turnsRemaining).toBe(MAX_TURNS_PER_CONVERSATION);
    expect(Date.parse(body.expiresAt)).toBe(Date.parse(cree.expiresAt));
  });

  it("404 sur une conversation que le serveur ne connaît pas", async () => {
    const { get } = setup();
    const res = await get("/api/conversations/11111111-2222-3333-4444-555555555555");
    expect(res.status).toBe(404);
  });

  it("relire une conversation ne prolonge pas sa vie", () => {
    let now = 0;
    const store = new ConversationStore(() => now);
    const conversation = store.create();
    now = CONVERSATION_TTL_MS - 1;
    expect(store.peek(conversation.id)).toBeDefined();
    now = CONVERSATION_TTL_MS + 1;
    // `get` aurait repoussé l'échéance à chaque lecture : une page laissée ouverte, rafraîchie
    // toutes les heures, aurait gardé une conversation en mémoire indéfiniment.
    expect(store.peek(conversation.id)).toBeUndefined();
  });

  it("l'échéance annoncée est celle de la dernière activité, plus le délai", () => {
    let now = 1_000;
    const store = new ConversationStore(() => now);
    const conversation = store.create();
    expect(Date.parse(expiresAtOf(conversation))).toBe(1_000 + CONVERSATION_TTL_MS);
    now = 60_000;
    store.get(conversation.id);
    expect(Date.parse(expiresAtOf(conversation))).toBe(60_000 + CONVERSATION_TTL_MS);
  });
});

describe("durée de vie des conversations", () => {
  it("une conversation inactive au-delà du délai est oubliée", () => {
    let now = 0;
    const store = new ConversationStore(() => now);
    const old = store.create();
    now = CONVERSATION_TTL_MS + 1;
    store.create();
    expect(store.get(old.id)).toBeUndefined();
  });

  it("une conversation active reste disponible", () => {
    let now = 0;
    const store = new ConversationStore(() => now);
    const active = store.create();
    now = CONVERSATION_TTL_MS - 1;
    expect(store.get(active.id)?.id).toBe(active.id);
    now = CONVERSATION_TTL_MS + 10;
    store.create();
    expect(store.get(active.id)?.id).toBe(active.id);
  });
});

describe("validation et persistance", () => {
  it("si l'écriture du carnet échoue, il n'est pas marqué validé", async () => {
    const store = new ConversationStore();
    const app = createApp({
      client: unusedClient,
      config: loadConfig({}),
      store,
      persist: async () => {
        throw new Error("disque plein");
      },
    });
    const conversation = store.create();
    conversation.brief = readyBrief();
    const res = await app.request(`/api/conversations/${conversation.id}/send`, { method: "POST" });
    expect(res.status).toBe(500);
    expect(conversation.sentAt).toBeNull();
  });
});

function readyBrief() {
  const brief = emptyBrief();
  const evidence = [{ quote: "test", turn: 1 }];
  brief.mandatory.destination = {
    status: "confirmed",
    value: { mode: "fixed", places: ["Vietnam"], zone: "Vietnam", criteria: [] },
    alternatives: [],
    evidence,
  };
  brief.mandatory.dates = {
    status: "vague",
    value: { earliest: "2027-11-01", latest: "2027-11-30", label: "novembre" },
    alternatives: [],
    evidence,
  };
  brief.mandatory.duration = {
    status: "confirmed",
    value: { minNights: 21, maxNights: 21 },
    alternatives: [],
    evidence,
  };
  brief.mandatory.travellers = {
    status: "confirmed",
    value: { total: { min: 2, max: 2 }, adults: 2, children: [], label: "2 adultes" },
    alternatives: [],
    evidence,
  };
  return brief;
}

describe("flux SSE d'un tour", () => {
  it("le dernier événement reçu est toujours turn_end, même quand le tour finit instantanément", async () => {
    const reply = {
      id: "msg_sse",
      type: "message",
      role: "assistant",
      model: "claude-haiku-4-5",
      content: [{ type: "text", text: "Bonjour." }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    };
    const instantClient = {
      messages: {
        stream() {
          const handlers: Record<string, (x: unknown) => void> = {};
          return {
            on(event: string, handler: (x: unknown) => void) {
              handlers[event] = handler;
              return this;
            },
            async finalMessage() {
              handlers.text?.("Bonjour.");
              return reply;
            },
          };
        },
      },
    } as unknown as Anthropic;
    for (let attempt = 0; attempt < 20; attempt++) {
      const store = new ConversationStore();
      const app = createApp({ client: instantClient, config: loadConfig({}), store });
      const { id } = store.create();
      const res = await app.request(`/api/conversations/${id}/turns`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "text", text: "salut" }),
      });
      const types = (await res.text())
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => (JSON.parse(line.slice(6)) as { type: string }).type);
      expect(types.at(-1)).toBe("turn_end");
      expect(types).toContain("text_delta");
    }
  });
});

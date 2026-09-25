import type Anthropic from "@anthropic-ai/sdk";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import {
  API_ERRORS,
  type ConversationStatusResponse,
  type CreateConversationResponse,
  type SendBriefResponse,
} from "../shared/api";
import { Contact } from "../shared/contact";
import type { ServerEvent } from "../shared/events";
import { computeCompleteness } from "./agent/brief/completeness";
import { buildUserContent, TurnRequestError } from "./agent/context";
import { runTurn } from "./agent/loop";
import type { AgentConfig } from "./config";
import {
  type Conversation,
  ConversationStore,
  expiresAtOf,
  MAX_TURNS_PER_CONVERSATION,
  persistSentBrief,
} from "./conversation";

/** Un message fait au plus 2 000 caractères : 16 Ko laissent de la marge sans bufferiser l'inutile. */
const MAX_BODY_BYTES = 16 * 1024;

const TurnRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().trim().min(1).max(2000) }),
  z.object({
    kind: z.literal("choice"),
    toolUseId: z.string().min(1),
    selected: z.array(z.string().max(200)).max(6),
    freeText: z.string().max(500).optional(),
  }),
  z.object({
    kind: z.literal("brief_confirmation"),
    toolUseId: z.string().min(1),
    decision: z.enum(["send", "edit"]),
    comment: z.string().max(500).optional(),
    contact: Contact.optional(),
  }),
]);

export function createApp(deps: {
  /** Écriture du carnet validé ; injectable pour tester un échec disque. */
  persist?: (conversation: Conversation, sentAt: string) => Promise<void>;
  client: Anthropic;
  config: AgentConfig;
  store?: ConversationStore;
}) {
  const store = deps.store ?? new ConversationStore();
  const persist = deps.persist ?? persistSentBrief;
  const app = new Hono();

  // Déclaré avant toute route : un middleware Hono ne s'applique qu'aux routes enregistrées
  // après lui. Sans cet ordre, la création de conversation acceptait des requêtes de 40 Ko.
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ error: API_ERRORS.tooLarge }, 413),
    }),
  );

  app.post("/api/conversations", (c) => {
    const conversation = store.create();
    const body: CreateConversationResponse = {
      id: conversation.id,
      brief: conversation.brief,
      completeness: computeCompleteness(conversation.brief),
      expiresAt: expiresAtOf(conversation),
    };
    return c.json(body, 201);
  });

  /**
   * Reprise après une actualisation. Le navigateur a gardé le fil ; il demande ici si le
   * serveur a encore l'état du modèle. Lecture passive : elle ne repousse pas l'échéance.
   */
  app.get("/api/conversations/:id", (c) => {
    const conversation = store.peek(c.req.param("id"));
    if (!conversation) return c.json({ error: API_ERRORS.notFound }, 404);
    const body: ConversationStatusResponse = {
      id: conversation.id,
      expiresAt: expiresAtOf(conversation),
      turnsRemaining: Math.max(0, MAX_TURNS_PER_CONVERSATION - conversation.turn),
      sentAt: conversation.sentAt,
    };
    return c.json(body);
  });

  app.post("/api/conversations/:id/turns", async (c) => {
    const conversation = store.get(c.req.param("id"));
    if (!conversation) return c.json({ error: API_ERRORS.notFound }, 404);

    const parsed = TurnRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: API_ERRORS.invalid }, 400);
    const request = parsed.data;

    if (conversation.sentAt) return c.json({ error: API_ERRORS.alreadySent }, 409);
    if (conversation.turn >= MAX_TURNS_PER_CONVERSATION) {
      return c.json({ error: API_ERRORS.tooManyTurns }, 429);
    }
    // Vérifié et posé sans await entre les deux : deux requêtes simultanées ne peuvent pas
    // lancer deux tours sur la même conversation.
    if (conversation.busy) return c.json({ error: API_ERRORS.busy }, 409);

    // La réponse doit correspondre à l'interaction en attente. Vérifié AVANT tout changement
    // d'état (buildUserContent est pure) : une requête incohérente ne marque rien comme validé.
    try {
      buildUserContent(conversation, request, new Date());
    } catch (error) {
      if (error instanceof TurnRequestError) return c.json({ error: API_ERRORS.invalid }, 400);
      throw error;
    }
    if (request.kind === "brief_confirmation" && request.decision === "send") {
      const completeness = computeCompleteness(conversation.brief);
      if (!completeness.ready) return c.json({ error: API_ERRORS.notReady }, 409);
      // Posé avant l'écriture du carnet : sans lui, le carnet validé ne porte pas le nom de son
      // voyageur. Il ne rejoint ni le brief ni l'historique envoyé au modèle.
      if (request.contact) conversation.contact = request.contact;
    }
    conversation.busy = true;

    return streamSSE(c, async (stream) => {
      // Écritures en file, attendue avant la fin du flux : sans elle, le flux se fermait avant que
      // turn_end soit écrit, ce qui affichait des activités fantômes à l'écran.
      // Le voyageur peut fermer l'onglet : une écriture qui échoue n'arrête pas le tour.
      let writes: Promise<void> = Promise.resolve();
      const emit = (event: ServerEvent) => {
        writes = writes
          .then(() => stream.writeSSE({ data: JSON.stringify(event) }))
          .catch(() => {});
      };
      try {
        if (request.kind === "brief_confirmation" && request.decision === "send") {
          // Marquée validée seulement après l'écriture réussie du carnet.
          const sentAt = new Date().toISOString();
          await persist(conversation, sentAt);
          conversation.sentAt = sentAt;
        }
        await runTurn(conversation, request, emit, {
          client: deps.client,
          config: deps.config,
          // Le navigateur qui coupe le flux abandonne la requête : le tour s'arrête avec elle.
          signal: c.req.raw.signal,
        });
      } catch (error) {
        console.error("[turn] erreur inattendue", error);
        emit({ type: "error", message: API_ERRORS.unexpected, retry: true, cause: "serveur" });
        emit({
          type: "turn_end",
          awaiting: conversation.pending?.kind ?? "text",
          usage: {
            model: deps.config.model,
            apiCalls: 0,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            webSearches: 0,
            firstTextMs: null,
            durationMs: 0,
          },
          expiresAt: expiresAtOf(conversation),
          turnsRemaining: Math.max(0, MAX_TURNS_PER_CONVERSATION - conversation.turn),
        });
      } finally {
        await writes;
        conversation.busy = false;
      }
    });
  });

  app.post("/api/conversations/:id/send", async (c) => {
    const conversation = store.get(c.req.param("id"));
    if (!conversation) return c.json({ error: API_ERRORS.notFound }, 404);
    // Le corps est facultatif : un carnet sans contact reste possible, un contact mal formé non.
    const corps = await c.req.json().catch(() => ({}));
    const contact = Contact.optional().safeParse((corps as { contact?: unknown }).contact);
    if (!contact.success) return c.json({ error: API_ERRORS.contactInvalid }, 400);
    // Sans ce contrôle, une validation pouvait courir en même temps qu'un tour.
    if (conversation.busy) return c.json({ error: API_ERRORS.busy }, 409);
    const completeness = computeCompleteness(conversation.brief);
    if (!completeness.ready) {
      const body: SendBriefResponse = { ok: false, error: API_ERRORS.notReady, completeness };
      return c.json(body, 409);
    }
    // Idempotent : une seconde validation renvoie la date de la première, et ne change plus le
    // contact. Le contact se pose ici, après tous les refus : une requête rejetée ne doit
    // rien laisser derrière elle, et la mémoire du serveur doit dire ce que le fichier dit.
    if (!conversation.sentAt) {
      if (contact.data) conversation.contact = contact.data;
      const sentAt = new Date().toISOString();
      try {
        await persist(conversation, sentAt);
      } catch (error) {
        console.error("[send] écriture du carnet impossible", error);
        return c.json({ error: API_ERRORS.unexpected }, 500);
      }
      conversation.sentAt = sentAt;
    }
    const body: SendBriefResponse = { ok: true, sentAt: conversation.sentAt };
    return c.json(body);
  });

  return app;
}

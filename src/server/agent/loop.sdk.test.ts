import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { ServerEvent } from "../../shared/events";
import { loadConfig } from "../config";
import { ConversationStore } from "../conversation";
import { runTurn } from "./loop";

/**
 * Ce test passe par le VRAI SDK Anthropic (`client.messages.stream`), avec un faux réseau qui
 * rejoue un flux SSE. Seul le transport HTTP est remplacé : le décodage du flux, l'accumulation
 * des blocs et la gestion d'erreur sont ceux du SDK. Un client scripté qui lève une SyntaxError
 * nue laisse passer un correctif que le vrai SDK ne déclenche jamais : il enveloppe l'erreur
 * dans une AnthropicError, cause = SyntaxError.
 */

const sse = (events: object[]) =>
  events
    .map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`)
    .join("");

const start = {
  type: "message_start",
  message: {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-haiku-4-5",
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 1 },
  },
};

/** Appel 1 : un note_duration valide, puis un ask_choice dont le JSON est invalide (échappement \z). */
const brokenCall = sse([
  start,
  {
    type: "content_block_start",
    index: 0,
    content_block: { type: "tool_use", id: "toolu_ok", name: "note_duration", input: {} },
  },
  {
    type: "content_block_delta",
    index: 0,
    delta: {
      type: "input_json_delta",
      partial_json: JSON.stringify({
        status: "confirmed",
        min_nights: 9,
        max_nights: 9,
        quote: "10 jours",
      }),
    },
  },
  { type: "content_block_stop", index: 0 },
  {
    type: "content_block_start",
    index: 1,
    content_block: { type: "tool_use", id: "toolu_bad", name: "ask_choice", input: {} },
  },
  {
    type: "content_block_delta",
    index: 1,
    delta: { type: "input_json_delta", partial_json: '{"question": "\\z"}' },
  },
  { type: "content_block_stop", index: 1 },
  {
    type: "message_delta",
    delta: { stop_reason: "tool_use", stop_sequence: null },
    usage: { output_tokens: 40 },
  },
  { type: "message_stop" },
]);

/** Appel 2 : le modèle répond normalement. */
const answerCall = sse([
  start,
  { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text: "Quel âge ont les enfants ?" },
  },
  { type: "content_block_stop", index: 0 },
  {
    type: "message_delta",
    delta: { stop_reason: "end_turn", stop_sequence: null },
    usage: { output_tokens: 8 },
  },
  { type: "message_stop" },
]);

describe("runTurn avec le vrai SDK - JSON d'entrée d'outil invalide", () => {
  it("le tour continue : l'appel valide est gardé, l'appel cassé reçoit une erreur d'outil", async () => {
    const bodies = [brokenCall, answerCall];
    const sent: string[] = [];
    const client = new Anthropic({
      apiKey: "test-sans-reseau",
      maxRetries: 0,
      fetch: async (_url, init) => {
        sent.push(String(init?.body ?? ""));
        const body = bodies.shift();
        if (!body) throw new Error("plus de réponse prévue");
        return new Response(body, { headers: { "content-type": "text/event-stream" } });
      },
    });
    const conversation = new ConversationStore().create();
    const events: ServerEvent[] = [];
    const awaiting = await runTurn(
      conversation,
      { kind: "text", text: "On part 10 jours, avec les enfants." },
      (e) => events.push(e),
      { client, config: loadConfig({}) },
    );

    expect(events.some((e) => e.type === "error")).toBe(false);
    expect(awaiting).toBe("text");
    expect(conversation.brief.mandatory.duration.status).toBe("confirmed");
    expect(sent[1]).toContain("illisible");
    expect(() => JSON.stringify(conversation.messages)).not.toThrow();
  });
});

import Anthropic from "@anthropic-ai/sdk";
import { buildRequest, buildUserContent } from "../src/server/agent/context";
import { loadConfig } from "../src/server/config";
import { ConversationStore } from "../src/server/conversation";

/**
 * Un seul appel au modèle, sans exécuter les outils : montre la décision brute du premier appel
 * pour un message (quels outils, quelles entrées), la latence et l'usage. Outil de diagnostic.
 * Usage : npx tsx --env-file=.env scripts/probe.ts "message du voyageur" ["autre message"...]
 */
const client = new Anthropic();
const config = loadConfig();
for (const text of process.argv.slice(2)) {
  const conversation = new ConversationStore().create();
  conversation.turn = 1;
  conversation.messages.push({
    role: "user",
    content: buildUserContent(conversation, { kind: "text", text }, new Date()),
  });
  const startedAt = Date.now();
  try {
    const message = await client.messages.create(buildRequest(conversation, config));
    const decisions = message.content.map((b) =>
      b.type === "tool_use" ? { tool: b.name, input: b.input } : b.type,
    );
    console.log(
      JSON.stringify(
        {
          text,
          ms: Date.now() - startedAt,
          stop: message.stop_reason,
          usage: message.usage,
          decisions,
        },
        null,
        1,
      ),
    );
  } catch (error) {
    console.log(
      "ERREUR",
      text,
      error instanceof Anthropic.APIError ? `${error.status} ${error.message}` : error,
    );
  }
}

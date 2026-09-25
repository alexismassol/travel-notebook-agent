import Anthropic from "@anthropic-ai/sdk";
import { runTurn } from "../src/server/agent/loop";
import { loadConfig } from "../src/server/config";
import { ConversationStore } from "../src/server/conversation";

/**
 * Diagnostic : joue un tour réel et affiche chaque message de l'historique, bloc par bloc
 * (types, stop des outils, longueur du texte). Usage : npx tsx --env-file=.env scripts/debug-turn.ts "message"
 */
async function main() {
  const conversation = new ConversationStore().create();
  const events: string[] = [];
  await runTurn(
    conversation,
    { kind: "text", text: process.argv[2] ?? "Bonjour" },
    (e) => {
      if (e.type !== "text_delta")
        events.push(e.type === "turn_end" ? `turn_end ${JSON.stringify(e.usage)}` : e.type);
    },
    { client: new Anthropic(), config: loadConfig() },
  );
  for (const [i, m] of conversation.messages.entries()) {
    const blocks =
      typeof m.content === "string"
        ? [m.content]
        : m.content.map((b) =>
            b.type === "text"
              ? `text(${b.text.length}): ${b.text.slice(0, 120).replace(/\n/g, " ")}`
              : b.type === "tool_use"
                ? `tool_use ${b.name}`
                : b.type === "tool_result"
                  ? `tool_result${b.is_error ? " ERROR" : ""}: ${String(b.content).slice(0, 160).replace(/\n/g, " ")}`
                  : b.type,
          );
    console.log(`#${i} ${m.role}`, JSON.stringify(blocks, null, 1));
  }
  console.log(events.join("\n"));
}
void main();

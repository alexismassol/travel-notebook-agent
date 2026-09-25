import type Anthropic from "@anthropic-ai/sdk";

/**
 * Formats partagés entre `context.ts`, qui écrit le message du tour, et `travellerText`, qui
 * relit ce que le voyageur a dit. Module sans dépendance : les outils l'importent sans boucle.
 */
export const SERVER_CONTEXT_OPEN = "<contexte_serveur>";
/** Préfixe d'une réponse à une question à choix. */
export const CHOICE_ANSWER = "Réponse du voyageur : ";
/** Préfixe d'un message libre écrit à la place d'un bloc ; ses mots sont entre « ». */
export const TRAVELLER_WROTE = "Le voyageur ";

/**
 * Tout ce que le voyageur a écrit ou cliqué dans la conversation, et rien d'autre : ni l'état
 * serveur (qui contient le brief, donc les valeurs à vérifier), ni les résultats d'outils, ni
 * le texte de l'agent. Sert à vérifier qu'une valeur « confirmée » a bien été dite (`fidelity.ts`).
 */
export function travellerText(messages: Anthropic.MessageParam[]): string {
  const said: string[] = [];
  for (const message of messages) {
    if (message.role !== "user") continue;
    if (typeof message.content === "string") {
      said.push(message.content);
      continue;
    }
    for (const block of message.content) {
      if (block.type === "text" && !block.text.startsWith(SERVER_CONTEXT_OPEN)) {
        said.push(block.text);
      } else if (block.type === "tool_result" && typeof block.content === "string") {
        if (block.content.startsWith(CHOICE_ANSWER)) {
          said.push(block.content.slice(CHOICE_ANSWER.length));
        } else if (block.content.startsWith(TRAVELLER_WROTE)) {
          said.push(...[...block.content.matchAll(/« (.*?) »/gs)].map((m) => m[1] ?? ""));
        }
      }
    }
  }
  return said.join("\n");
}

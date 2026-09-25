import type Anthropic from "@anthropic-ai/sdk";
import type { AgentConfig } from "../config";
import { ConversationStore } from "../conversation";
import { buildRequest } from "./context";

/**
 * Préchauffe au démarrage. Le premier appel après un changement de schéma d'outils stricts
 * prend 67,5 s (compilation de la grammaire côté API, gardée 24 h), l'appel suivant 6 s. Sans
 * préchauffe, c'est le premier voyageur après un déploiement qui attend. Coût : un appel avec
 * la vraie liste d'outils et 1 token de sortie.
 */
export async function warmUp(client: Anthropic, config: AgentConfig): Promise<void> {
  const conversation = new ConversationStore().create();
  conversation.messages.push({ role: "user", content: "Bonjour" });
  const startedAt = Date.now();
  try {
    await client.messages.create({ ...buildRequest(conversation, config), max_tokens: 1 });
    console.log(`[warm-up] schémas d'outils prêts en ${Date.now() - startedAt} ms`);
  } catch (error) {
    console.error("[warm-up] échec, le premier tour sera plus lent", error);
  }
}

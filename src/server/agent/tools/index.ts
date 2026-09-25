import type Anthropic from "@anthropic-ai/sdk";
import { askChoiceTool } from "./ask-choice";
import { briefTools } from "./brief-tools";
import { loadPlaybookTool } from "./load-playbook";
import { presentBriefTool } from "./present-brief";
import { showDestinationCardsTool } from "./show-destination-cards";
import type { AgentTool } from "./types";

/**
 * Registre des outils exécutés par notre serveur. L'ordre est fixe : la liste d'outils fait
 * partie du préfixe mis en cache, la réordonner invaliderait le cache.
 */
const CLIENT_TOOLS: AgentTool[] = [
  ...briefTools,
  loadPlaybookTool,
  askChoiceTool,
  showDestinationCardsTool,
  presentBriefTool,
];

export const TOOLS_BY_NAME = new Map(CLIENT_TOOLS.map((t) => [t.definition.name, t]));

/**
 * Recherche web : outil serveur d'Anthropic, exécuté chez eux dans le même appel.
 * Haiku 4.5 n'accepte que la version de base ; les modèles récents ont la version avec
 * filtrage dynamique.
 */
export function webSearchTool(model: string, maxUses: number): Anthropic.ToolUnion {
  if (model.startsWith("claude-haiku")) {
    return { type: "web_search_20250305", name: "web_search", max_uses: maxUses };
  }
  return { type: "web_search_20260209", name: "web_search", max_uses: maxUses };
}

export function toolDefinitions(model: string, webSearchMaxUses: number): Anthropic.ToolUnion[] {
  return [...CLIENT_TOOLS.map((t) => t.definition), webSearchTool(model, webSearchMaxUses)];
}

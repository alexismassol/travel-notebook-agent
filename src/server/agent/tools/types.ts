import type Anthropic from "@anthropic-ai/sdk";
import type { Awaiting, ServerEvent } from "../../../shared/events";
import type { Conversation } from "../../conversation";

export interface ToolContext {
  conversation: Conversation;
  /** Identifiant de l'appel : les blocs d'interface le portent pour relier la réponse. */
  toolUseId: string;
  emit: (event: ServerEvent) => void;
}

export type ToolOutcome =
  /** Résultat renvoyé au modèle, qui continue le tour. */
  | { kind: "result"; content: string; isError?: boolean }
  /** Le tour s'arrête : l'interface attend le voyageur. Sa réponse deviendra le tool_result. */
  | {
      kind: "terminal";
      awaiting: Extract<Awaiting, "choice" | "brief_confirmation">;
      /** Libellés d'une question à choix, gardés pour vérifier la réponse. */
      options?: string[];
    };

export interface AgentTool {
  definition: Anthropic.Tool;
  /** Libellé court affiché dans l'interface pendant l'exécution. */
  activityLabel: (input: unknown) => string;
  run: (input: unknown, ctx: ToolContext) => Promise<ToolOutcome>;
}

/** Message d'erreur renvoyé au modèle quand son entrée ne passe pas la validation. */
export function invalidInput(issues: { path: PropertyKey[]; message: string }[]): ToolOutcome {
  const details = issues.map((i) => `${i.path.map(String).join(".") || "(racine)"} : ${i.message}`);
  return {
    kind: "result",
    isError: true,
    content: `Entrée invalide, corrige et rappelle l'outil.\n${details.join("\n")}`,
  };
}

/**
 * Fuite de syntaxe d'appel d'outil dans une valeur texte, observée sur Haiku 4.5 même en mode
 * strict (le mode strict garantit la forme JSON, pas le contenu des chaînes) :
 * `"zone": "</antml parameter>\n<parameter name=\"criteria\">[...]"`. Une telle valeur ne doit
 * jamais entrer dans le brief.
 */
const LEAKED_TOOL_SYNTAX = /<\/?(antml|parameter|invoke|function_calls)\b|<\/?antml:/;
/**
 * Accent écrit en syntaxe TeX au lieu du caractère, sur Haiku 4.5 en mode strict :
 * `"Cor\"{e du Sud"` pour « Corée du Sud ». Sans ce contrôle, le nom s'affiche tel quel dans le carnet.
 */
const BROKEN_ACCENT = /["'`^~]\{[a-z]|\\["'`^~][{a-z]/i;
/**
 * Antislash en plein mot. Le modèle réécrit parfois une valeur qu'il avait pourtant bien
 * écrite : « belles décorations » est revenu en « belles d\teau9orations » au tour suivant, et
 * le voyageur l'a lu sur son récapitulatif. Aucune valeur de voyage ne porte d'antislash, donc
 * la présence du caractère suffit à refuser l'entrée.
 */
const ANTISLASH = /\\/;

export function findLeakedSyntax(value: unknown, path = ""): string | null {
  if (typeof value === "string") {
    return LEAKED_TOOL_SYNTAX.test(value) || BROKEN_ACCENT.test(value) || ANTISLASH.test(value)
      ? path || "(racine)"
      : null;
  }
  if (Array.isArray(value)) {
    for (const [i, item] of value.entries()) {
      const found = findLeakedSyntax(item, `${path}[${i}]`);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const found = findLeakedSyntax(item, path ? `${path}.${key}` : key);
      if (found) return found;
    }
  }
  return null;
}

export function malformedInput(path: string): ToolOutcome {
  return {
    kind: "result",
    isError: true,
    content: `Entrée malformée : le champ ${path} contient de la syntaxe d'appel d'outil ou un accent mal écrit. Rappelle l'outil avec des valeurs simples, un champ JSON par paramètre, et les accents écrits directement (é, è, à).`,
  };
}

export function unreadableInput(): ToolOutcome {
  return {
    kind: "result",
    isError: true,
    content:
      "Entrée illisible : le JSON de cet appel est invalide (souvent un guillemet non échappé dans un texte). Rappelle l'outil avec un JSON valide.",
  };
}

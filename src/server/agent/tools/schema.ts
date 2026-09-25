import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * Le schéma Zod est la source unique : il valide l'entrée côté serveur ET produit le JSON
 * Schema envoyé au modèle.
 *
 * Les outils sont déclarés `strict: true` : l'API contraint la génération au schéma. Sans
 * strict, Haiku 4.5 produit sur 6 scénarios plusieurs entrées `update_brief` malformées
 * (`"interests": "\n<parameter name=\"status\">inferred"`), toutes rejetées par Zod, et le
 * brief reste vide.
 *
 * Le mode strict refuse certaines contraintes (bornes numériques, longueurs, bornes de
 * tableaux, motifs) et exige `additionalProperties: false`. On les retire du schéma ENVOYÉ ;
 * Zod les vérifie toujours à la réception.
 */

const UNSUPPORTED_KEYS = new Set([
  "$schema",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "pattern",
]);

function toStrict(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toStrict);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (UNSUPPORTED_KEYS.has(key)) continue;
    out[key] = toStrict(value);
  }
  if (out.type === "object") out.additionalProperties = false;
  return out;
}

export function toInputSchema(schema: z.ZodType): Anthropic.Tool.InputSchema {
  return toStrict(z.toJSONSchema(schema, { io: "input" })) as Anthropic.Tool.InputSchema;
}

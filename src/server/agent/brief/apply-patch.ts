import { z } from "zod";
import {
  BudgetValue,
  DatesValue,
  DepartureValue,
  DestinationValue,
  DurationValue,
  MANDATORY_FIELDS,
  type SlotStatus,
  TagsValue,
  type TravelBrief,
  TravellersValue,
  USEFUL_FIELDS,
} from "../../../shared/brief";

/**
 * Patch interne produit par les outils `note_*`. Le modèle n'écrit jamais le brief entier : il envoie des
 * modifications de slots, que le serveur valide, fusionne et versionne.
 */

/**
 * Statuts qu'un patch peut poser. Pas "unknown" : l'agent n'efface pas une information dite.
 * Conséquence technique voulue : `value` n'est jamais null, ce qui garde le schéma strict sous
 * la limite de l'API (16 paramètres à type union maximum, erreur 400 mesurée à 17).
 */
const PatchStatus = z.enum(["vague", "inferred", "confirmed", "conflicting"]);

/** Explication des statuts, donnée une seule fois dans la description de l'outil. */
export const STATUS_HELP =
  "vague = le voyageur est flou ou flexible (garder un intervalle) ; " +
  "inferred = tu le déduis sans qu'il l'ait dit ; confirmed = dit clairement ou validé par lui ; " +
  "conflicting = deux réponses différentes (mettre l'autre dans alternatives)";

function slotPatch<T extends z.ZodType>(value: T, valueHelp: string) {
  return z
    .object({
      status: PatchStatus,
      value: value.describe(valueHelp),
      alternatives: z
        .array(value)
        .optional()
        .describe("Seulement si status = conflicting : les autres valeurs données"),
      // Vide quand la phrase de l'appel ne parle pas de cette valeur (voir `citationParleDe`).
      quote: z.string().describe("Les mots exacts du voyageur qui justifient cette mise à jour"),
    })
    .superRefine((raw, ctx) => {
      const p = raw as unknown as { status: SlotStatus; alternatives?: unknown[] };
      if (p.status === "conflicting" && (p.alternatives?.length ?? 0) === 0) {
        ctx.addIssue({
          code: "custom",
          message: "status conflicting : alternatives doit contenir l'autre valeur",
        });
      }
    });
}

export const BriefPatch = z
  .object({
    destination: slotPatch(
      DestinationValue,
      "mode open = pas de lieu (mettre les envies dans criteria) ; shortlist = quelques lieux ; " +
        "fixed = un lieu. zone = le pays ou la région où se déroule le voyage, null si " +
        "les lieux sont dans plusieurs pays",
    ).optional(),
    dates: slotPatch(
      DatesValue,
      "Fenêtre de départ possible. 'cet été' = 06-01 à 08-31 de l'année concernée ; 'novembre' = " +
        "11-01 à 11-30. label = les mots du voyageur reformulés court",
    ).optional(),
    duration: slotPatch(
      DurationValue,
      "En nuits. 'deux semaines à peu près' = 12 à 16 ; '3 semaines' = 21 à 21",
    ).optional(),
    travellers: slotPatch(
      TravellersValue,
      "total = intervalle du nombre de personnes ; children = un élément par enfant, age null " +
        "si inconnu ; label = résumé court",
    ).optional(),
    budget: slotPatch(BudgetValue, "En euros ; per = person ou total").optional(),
    departure: slotPatch(
      DepartureValue,
      "Ville ou aéroport de départ, tel que le voyageur l'a dit : 'Paris', 'Lyon', 'Bruxelles'",
    ).optional(),
    style: slotPatch(TagsValue, "Ex. 'slow travel', 'aventure', 'confort'").optional(),
    interests: slotPatch(TagsValue, "Ex. 'plongée', 'cuisine locale', 'randonnée'").optional(),
    constraints: slotPatch(
      TagsValue,
      "Ex. 'mobilité réduite', 'pas de vol de nuit', 'visa'",
    ).optional(),
    nuances: z
      .array(z.string().min(1).max(300))
      .max(5)
      .optional()
      .describe(
        "Phrases du voyageur utiles pour son voyage qui n'entrent dans aucun champ, mot pour mot",
      ),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), "le patch est vide");
export type BriefPatch = z.infer<typeof BriefPatch>;

/** Au-delà, le carnet ne se lit plus : les premières phrases confiées sont les plus parlantes. */
export const MAX_NUANCES = 20;

interface AnySlot {
  status: SlotStatus;
  value: unknown;
  alternatives: unknown[];
  evidence: { quote: string; turn: number }[];
}

const STATUS_LABEL: Record<SlotStatus, string> = {
  unknown: "à définir",
  vague: "à préciser",
  inferred: "à confirmer",
  confirmed: "confirmé",
  conflicting: "à trancher",
};

function describeValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.label === "string") return v.label;
    if (Array.isArray(v.places) && v.places.length > 0) return v.places.join(", ");
    if (Array.isArray(v.criteria)) return `ouverte : ${v.criteria.join(", ")}`;
    if (typeof v.minNights === "number") {
      return v.minNights === v.maxNights
        ? `${v.minNights} nuits`
        : `${v.minNights} à ${v.maxNights} nuits`;
    }
    if (typeof v.max === "number") return `jusqu'à ${v.max} €`;
  }
  return String(value);
}

/** Fusion pure : renvoie un nouveau brief, ne modifie jamais celui reçu. */
export function applyPatch(
  current: TravelBrief,
  patch: BriefPatch,
  turn: number,
): { brief: TravelBrief; changes: string[] } {
  const brief: TravelBrief = structuredClone(current);
  const changes: string[] = [];

  const groups = [
    ["mandatory", MANDATORY_FIELDS],
    ["useful", USEFUL_FIELDS],
  ] as const;

  for (const [group, fields] of groups) {
    for (const field of fields) {
      const p = patch[field];
      if (!p) continue;
      const slots = brief[group] as unknown as Record<string, AnySlot>;
      const previous = slots[field];
      if (!previous) continue;
      // La citation gardée doit justifier la valeur affichée. Un tour qui renvoie la même
      // valeur avec une phrase sans rapport écrasait la bonne citation : une contrainte
      // « voyage avec un bébé de 4 mois » s'est retrouvée attribuée au mot « tout ».
      const inchange =
        previous.status === p.status && JSON.stringify(previous.value) === JSON.stringify(p.value);
      const connue = previous.evidence.some((e) => e.quote === p.quote);
      // Sans citation qui parle d'elle, une nouvelle valeur s'affiche sans « vous avez dit »,
      // plutôt qu'avec la phrase qui justifiait l'ancienne.
      const citee = p.quote.trim() !== "";
      const evidence =
        inchange || connue
          ? previous.evidence
          : citee
            ? [...previous.evidence, { quote: p.quote, turn }]
            : [];
      slots[field] = {
        status: p.status,
        value: p.value,
        alternatives: p.alternatives ?? [],
        evidence,
      };
      const described = describeValue(p.value);
      changes.push(
        `${field} : ${STATUS_LABEL[previous.status]} -> ${STATUS_LABEL[p.status]}` +
          (described ? ` (${described})` : ""),
      );
    }
  }

  for (const quote of patch.nuances ?? []) {
    if (brief.nuances.length >= MAX_NUANCES) break;
    if (brief.nuances.some((n) => n.quote === quote)) continue;
    brief.nuances.push({ quote, turn });
    changes.push("nuance ajoutée");
  }

  if (changes.length > 0) {
    brief.version += 1;
    brief.changelog.push({ version: brief.version, turn, changes });
  }
  return { brief, changes };
}

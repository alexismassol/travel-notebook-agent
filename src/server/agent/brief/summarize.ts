import {
  type Completeness,
  MANDATORY_FIELDS,
  type TravelBrief,
  USEFUL_FIELDS,
} from "../../../shared/brief";

/**
 * Résumé textuel compact du brief, pour le modèle. Une ligne par champ : un modèle lit mieux
 * "dates [vague] cet été" qu'un JSON imbriqué, et ça coûte moins de tokens (non mesuré).
 */

function valueText(value: unknown): string {
  if (value === null) return "-";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(", ");
  const v = value as Record<string, unknown>;
  if (typeof v.label === "string") return v.label;
  if ("mode" in v) {
    const places = (v.places as string[]).join(", ");
    const criteria = (v.criteria as string[]).join(", ");
    return [
      `mode ${v.mode}`,
      places && `lieux : ${places}`,
      v.zone ? `zone : ${v.zone}` : "zone : aucune",
      criteria && `envies : ${criteria}`,
    ]
      .filter(Boolean)
      .join(" ; ");
  }
  if (typeof v.minNights === "number") {
    // « une semaine » enregistrée 6 à 6 donne « 6 à 6 nuits », que le modèle reprend tel quel
    // dans sa réponse.
    if (v.minNights === v.maxNights) return `${v.maxNights} nuit${v.maxNights > 1 ? "s" : ""}`;
    return `${v.minNights} à ${v.maxNights} nuits`;
  }
  if (typeof v.max === "number") {
    return `${v.min ?? "?"} à ${v.max} EUR par ${v.per === "person" ? "personne" : "voyage"}`;
  }
  return JSON.stringify(value);
}

export function summarizeBrief(brief: TravelBrief, completeness: Completeness): string {
  const missing = new Map(completeness.missing.map((m) => [m.field, m.reason]));
  const lines = [
    `Brief v${brief.version} - obligatoires suffisants : ${completeness.mandatoryOk}/4`,
  ];
  for (const field of MANDATORY_FIELDS) {
    const slot = brief.mandatory[field];
    const reason = missing.get(field);
    const alternatives =
      slot.alternatives.length > 0
        ? ` (en conflit avec : ${slot.alternatives.map(valueText).join(" / ")})`
        : "";
    lines.push(
      `- ${field} [${slot.status}] ${valueText(slot.value)}${alternatives}${reason ? ` -> manque : ${reason}` : ""}`,
    );
  }
  const useful = USEFUL_FIELDS.map(
    (f) => `${f} [${brief.useful[f].status}] ${valueText(brief.useful[f].value)}`,
  );
  lines.push(`Utiles : ${useful.join(" | ")}`);
  lines.push(`Nuances notées : ${brief.nuances.length}`);
  lines.push(completeness.ready ? "Le brief est complet." : "Le brief n'est pas complet.");
  return lines.join("\n");
}

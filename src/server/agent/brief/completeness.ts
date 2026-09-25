import {
  type Completeness,
  MANDATORY_FIELDS,
  type MandatoryField,
  type SlotStatus,
  type TravelBrief,
} from "../../../shared/brief";

/**
 * Seuil "ce brief fait un carnet de voyage complet".
 *
 * Décision produit, calculée en code pour être testable, réglable sans toucher au prompt et
 * identique d'une conversation à l'autre. Le modèle voit le résultat, il ne le décide pas.
 * Les valeurs ci-dessous sont des hypothèses produit (voir docs/produit.md), pas des données.
 */

/** Au-delà d'un mois et demi, la saison reste inconnue, donc le climat et les prix aussi. */
export const MAX_DATE_WINDOW_DAYS = 45;

/** Une semaine d'écart change l'itinéraire mais pas sa structure : le voyage s'organise déjà. */
export const MAX_DURATION_SPREAD_NIGHTS = 7;

/** "4 ou 5" s'organise avec une variante ; "4 ou 6" change les chambres et les véhicules. */
export const MAX_TRAVELLERS_SPREAD = 1;

/**
 * "vague" est accepté : c'est le voyageur qui a exprimé sa flexibilité, et l'intervalle passe
 * les seuils ci-dessus. "inferred" ne l'est pas : c'est l'agent qui a déduit, le voyageur doit
 * valider. "conflicting" et "unknown" ne le sont jamais.
 */
const SENDABLE_STATUSES: ReadonlySet<SlotStatus> = new Set(["confirmed", "vague"]);

const STATUS_REASON: Record<SlotStatus, string> = {
  unknown: "pas encore évoqué",
  inferred: "déduit de vos messages : à confirmer",
  conflicting: "deux réponses différentes : laquelle garder ?",
  vague: "",
  confirmed: "",
};

const MS_PER_DAY = 86_400_000;

function windowDays(earliest: string, latest: string): number {
  return Math.round((Date.parse(latest) - Date.parse(earliest)) / MS_PER_DAY) + 1;
}

function checkField(brief: TravelBrief, field: MandatoryField, today: string): string | null {
  const slot = brief.mandatory[field];
  if (!SENDABLE_STATUSES.has(slot.status) || slot.value === null) {
    return STATUS_REASON[slot.status] || "pas encore évoqué";
  }

  switch (field) {
    case "destination": {
      const d = brief.mandatory.destination.value;
      if (!d || d.mode === "open") return "destination encore ouverte";
      if (d.zone === null) return "plusieurs pays possibles : choisissez un pays ou une région";
      return null;
    }
    case "dates": {
      const d = brief.mandatory.dates.value;
      if (!d) return "pas encore évoqué";
      const days = windowDays(d.earliest, d.latest);
      // Défense en profondeur : le schéma refuse déjà une date inexistante.
      if (Number.isNaN(days)) return "date à préciser";
      // Une fenêtre confirmée mais totalement passée, comme juin quand on est déjà en septembre,
      // vient d'une année devinée et non d'une date dite par le voyageur. Le brief ne doit pas
      // être marqué complet dans ce cas, tant que l'année n'est pas précisée.
      if (d.latest < today) return "période déjà passée : précisez l'année";
      if (days > MAX_DATE_WINDOW_DAYS) {
        return `période de ${days} jours : à resserrer à ${MAX_DATE_WINDOW_DAYS} jours au plus`;
      }
      return null;
    }
    case "duration": {
      const d = brief.mandatory.duration.value;
      if (!d) return "pas encore évoqué";
      if (d.maxNights - d.minNights > MAX_DURATION_SPREAD_NIGHTS) {
        return `entre ${d.minNights} et ${d.maxNights} nuits : à resserrer (${MAX_DURATION_SPREAD_NIGHTS} nuits d'écart au plus)`;
      }
      const dates = brief.mandatory.dates.value;
      if (dates && d.minNights > windowDays(dates.earliest, dates.latest)) {
        return "la durée dépasse la période choisie";
      }
      return null;
    }
    case "travellers": {
      const t = brief.mandatory.travellers.value;
      if (!t) return "pas encore évoqué";
      if (t.total.max - t.total.min > MAX_TRAVELLERS_SPREAD) {
        return `nombre de voyageurs entre ${t.total.min} et ${t.total.max}, à préciser`;
      }
      if (t.children.some((c) => c.age === null)) return "âge de chaque enfant à préciser";
      return null;
    }
  }
}

/** `today` au format AAAA-MM-JJ ; par défaut la date du jour (injectable pour les tests). */
export function computeCompleteness(
  brief: TravelBrief,
  today: string = new Date().toISOString().slice(0, 10),
): Completeness {
  const missing = MANDATORY_FIELDS.flatMap((field) => {
    const reason = checkField(brief, field, today);
    return reason === null ? [] : [{ field, reason }];
  });
  return {
    ready: missing.length === 0,
    mandatoryOk: MANDATORY_FIELDS.length - missing.length,
    missing,
  };
}

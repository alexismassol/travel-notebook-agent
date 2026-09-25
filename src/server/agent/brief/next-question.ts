import type { Completeness, MandatoryField, TravelBrief } from "../../../shared/brief";

/**
 * Consigne de question suivante, ajoutée au résultat des outils note_* : elle est calculée APRÈS
 * l'enregistrement du message, donc sur l'état à jour du brief.
 *
 * Pourquoi pas dans le rappel de début de tour : calculée avant l'enregistrement, la consigne
 * fait poser « Qui part en voyage ? » à un voyageur qui vient d'écrire « on est 2 ».
 * Pourquoi une consigne nommée plutôt qu'une règle générale : avec la règle seule, la question
 * à choix n'est posée que 0 à 1 fois sur 3 (docs/scenarios).
 */
export function nextQuestionHint(brief: TravelBrief, completeness: Completeness): string | null {
  if (completeness.ready) return null;
  const { destination, dates, duration, travellers } = brief.mandatory;
  const places = destination.value?.places ?? [];
  const open = destination.status === "unknown" || destination.value?.mode === "open";
  if (open && dates.status !== "unknown") {
    return "destination encore ouverte et période connue : choisis 2 ou 3 lieux, lance une recherche qui nomme ces lieux avec la période (par exemple « Guadeloupe Sri Lanka Maroc climat février »), puis montre-les avec show_destination_cards.";
  }
  if (destination.value?.mode === "shortlist" && places.length >= 2) {
    return `le voyageur hésite entre ${places.join(", ")} : donne un repère utile pour trancher, puis pose la question avec ask_choice (un lieu par option).`;
  }
  if (travellers.status === "inferred") {
    return `fais confirmer les voyageurs (${travellers.value?.label ?? "composition déduite"}) avec ask_choice.`;
  }
  if (travellers.status === "unknown") {
    return "il manque qui part : pose la question avec ask_choice (en couple, en famille, entre amis, seul).";
  }
  if (dates.status === "unknown") {
    return "il manque la période : pose la question avec ask_choice (mois ou saisons).";
  }
  if (duration.status === "unknown") {
    return "il manque la durée : pose la question avec ask_choice (une semaine, deux semaines, trois semaines ou plus).";
  }
  // Tout autre manque calculé par le seuil (« 4 ou 6 personnes », année à préciser...) : sans
  // cette ligne, « on sera 4 ou 6 » ne reçoit aucune consigne de question.
  const first = completeness.missing[0];
  if (first) {
    return `il reste à préciser ${FIELD_LABEL[first.field]} (${first.reason}) : pose la question avec ask_choice.`;
  }
  return null;
}

const FIELD_LABEL: Record<MandatoryField, string> = {
  destination: "la destination",
  dates: "la période",
  duration: "la durée",
  travellers: "les voyageurs",
};

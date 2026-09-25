/**
 * Défauts de ton d'une réponse visible, comptés par des expressions régulières plutôt que par
 * une relecture : une relecture ne se rejoue pas sur 21 passages, un compteur si.
 *
 * Chaque motif vient d'un défaut relevé dans des transcriptions réelles. Superlatif dans 6
 * transcriptions sur 7, narration « Laissez-moi corriger cela » dans 2 sur 7, « Votre brief est
 * complet » dans 1 sur 7. Un compteur à zéro ne prouve pas que le ton est bon ; il prouve que
 * ces défauts-là sont absents.
 */

/** Un mot entier : pas de lettre avant ni après (\b ignore les lettres accentuées). */
const word = (alternatives: string) =>
  new RegExp(`(^|[^\\p{L}])(${alternatives})(?=[^\\p{L}]|$)`, "giu");

const SUPERLATIVE = word(
  "parfait|parfaite|parfaits|parfaites|excellent|excellente|excellents|excellentes|idéal|idéale|idéaux|idéales|magnifique|magnifiques|incroyable|incroyables|inoubliable|inoubliables|génial|géniale|merveilleux|merveilleuse|exceptionnel|exceptionnelle|super",
);
// Mesuré sur les transcriptions : la phrase d'attente raconte souvent le travail de l'agent
// au lieu de parler du voyage. « Permettez-moi d'enregistrer », « Enregistré », « C'est noté ».
const NARRATION = word(
  "laissez-moi (?:corriger|enregistrer|noter|ajouter|mettre à jour)|permettez-moi d'(?:enregistrer|ajouter|noter|mettre à jour)|une dernière correction|je corrige|je vais (?:enregistrer|noter|mettre à jour|corriger|charger)|j'enregistre|je note|je mets à jour|je charge|enregistré|enregistrons|c'est noté|je viens de (?:noter|mettre à jour)|est enregistré|je dois (?:d'abord )?(?:clarifier|comprendre)|charger les instructions|les instructions spécialisées",
);
const JARGON = word("brief|briefs");
const INFORMAL = word("tu|te|toi|ton|ta|tes|t'");

const count = (pattern: RegExp, text: string) => [...text.matchAll(pattern)].length;

export interface ReplyMetrics {
  superlatives: number;
  narration: number;
  jargon: number;
  informal: number;
  words: number;
  /** Points d'interrogation de la réponse. Le prompt en promet un seul par tour. */
  questions: number;
}

export function replyMetrics(text: string): ReplyMetrics {
  return {
    superlatives: count(SUPERLATIVE, text),
    narration: count(NARRATION, text),
    jargon: count(JARGON, text),
    informal: count(INFORMAL, text),
    words: text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length,
    // « Une seule question par tour » était une promesse jamais comptée. Sur une vraie
    // conversation, l'agent a demandé la période et la durée dans la même phrase.
    questions: count(/\?/g, text),
  };
}

/**
 * Les défauts de ton du tour qui vient de passer, nommés pour être renvoyés au modèle. Un
 * rappel générique se dilue au fil de la conversation ; son propre défaut, cité, tient mieux.
 * Rien n'est renvoyé quand la réponse est bonne : le contexte reste court.
 */
export function defautsDeTon(texte: string): string[] {
  const m = replyMetrics(texte);
  const defauts: string[] = [];
  if (m.narration > 0) {
    defauts.push(
      "tu as raconté ton travail (« laissez-moi enregistrer », « c'est noté ») au lieu de parler du voyage",
    );
  }
  if (m.questions > 1) defauts.push("tu as posé plusieurs questions dans le même message");
  if (m.informal > 0) defauts.push("tu as tutoyé le voyageur");
  if (m.jargon > 0) defauts.push("tu as dit « brief » au voyageur");
  if (m.words > 80) defauts.push(`ta réponse faisait ${m.words} mots, la limite est 80`);
  return defauts;
}

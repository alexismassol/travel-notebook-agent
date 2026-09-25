import type { DurationValue, TravellersValue } from "../../../shared/brief";

/**
 * Fidélité du brief : une valeur « confirmée » doit venir de ce que le voyageur a dit.
 *
 * Risque clé de docs/produit.md sur Haiku 4.5 : le modèle confirme parfois un nombre de
 * voyageurs ou une durée qui ne vient pas de ce que le voyageur a dit.
 *
 * Exemples réels : « 2 adultes » confirmé alors que seul l'âge des enfants est donné,
 * « 2 adultes » pour « on est trois », « 9 nuits » confirmé pour « une dizaine de jours ».
 * Les consignes d'outil ne suffisent pas : ce contrôle en code ramène la valeur à un statut
 * incertain, et l'agent doit la faire préciser.
 *
 * Volontairement étroit : il ne juge que le nombre de voyageurs et la durée, les deux défauts
 * mesurés. Il agit seulement quand la preuve se lit dans le texte : un nombre, un mot comme
 * « adultes », « ma femme » ou « une dizaine de ».
 */

const NUMBER_WORDS: Record<string, number> = {
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  // Anglais : le seul autre cas mesuré, « we are two retired Canadians ».
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};
const NUMBER = `(\\d{1,2}|${Object.keys(NUMBER_WORDS).join("|")})`;
/** « on part 3 semaines », « il a 7 ans » : un nombre suivi d'une unité ne compte pas les gens. */
const NOT_A_UNIT = "(?!\\s*(?:ans?|mois|jours?|semaines?|nuits?|heures?|h\\b|euros?|€|km|%))";
const COUNT_BEFORE = new RegExp(
  `\\b(?:on (?:est|sera|part|voyage)|nous (?:sommes|serons|partons|voyageons)|nous|tous les|a_|groupe de|we are|we re|we will be|there are|there will be)\\s+${NUMBER}\\b${NOT_A_UNIT}`,
  "g",
);
const COUNT_AFTER = new RegExp(
  `\\b${NUMBER}\\s+(?:personnes?|voyageurs?|adultes?|amis?|copains?|copines?|potes?|people|persons|adults?|travellers?|travelers?|friends)\\b`,
  "g",
);
/** Mots qui disent qui sont les adultes, même sans nombre. */
const ADULT_WORDS =
  /\b(adultes?|couple|duo|parents|mari|femme|epoux|epouse|conjointe?|compagnon|compagne|copain|copine|partenaire|seule?|solo|amoureux|noces|lune de miel|adults?|wife|husband|partner|honeymoon|two of us)\b/;

function normalize(text: string): string {
  return (
    text
      // « à 4 » compte, « elle a 3 chats » non : la préposition est marquée avant de retirer
      // les accents, qui la confondraient avec le verbe.
      .replace(/(^|[^\p{L}])[àÀ](?=\s)/gu, "$1a_")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/['’]/g, " ")
  );
}

function toNumber(token: string): number {
  return NUMBER_WORDS[token] ?? Number(token);
}

function mentionedCounts(text: string): Set<number> {
  const counts = new Set<number>();
  for (const pattern of [COUNT_BEFORE, COUNT_AFTER]) {
    for (const match of text.matchAll(pattern)) {
      if (match[1]) counts.add(toNumber(match[1]));
    }
  }
  return counts;
}

/**
 * Raison de douter d'un nombre de voyageurs marqué « confirmé », ou null s'il est appuyé par
 * les mots du voyageur (`said` : tout ce qu'il a écrit ou cliqué dans la conversation).
 */
/**
 * Mots qui disent qu'un enfant voyage. « Parents » n'en fait pas partie : un adulte qui part avec
 * ses parents reste un adulte. Sans cette distinction, « moi et mes parents » est enregistré
 * « 2 adultes et 1 enfant », le serveur pousse les conseils famille, et l'agent demande
 * l'âge d'un enfant qui n'existe pas.
 */
const CHILD_WORDS =
  /\b(enfants?|bebes?|nourrissons?|nouveau-nes?|petits?|gamins?|gosses?|ados?|adolescents?|fils|filles?|garcons?|jumeaux|jumelles|mineurs?|children|child|kids?|baby|babies|toddlers?|teens?)\b/;
/** Un âge dit en clair vaut déclaration d'enfant : « il a 4 ans », « 6 mois ». */
const CHILD_AGE = /\b\d{1,2}\s*(ans?|mois|years?|months?)\b/;

/**
 * Des enfants sont notés alors que le voyageur n'en a mentionné aucun ? Renvoie la raison, sinon
 * `null`. On ne réécrit pas ses mots : on baisse la certitude et on fait poser la question.
 */
export function childrenDoubt(value: TravellersValue, said: string): string | null {
  if (value.children.length === 0) return null;
  const text = normalize(said);
  if (CHILD_WORDS.test(text) || CHILD_AGE.test(text)) return null;
  return "aucun enfant n'est nommé dans ce que le voyageur a dit ; « mes parents » sont des adultes";
}

export function travellersDoubt(value: TravellersValue, said: string): string | null {
  if (value.adults !== null) {
    const counted = value.adults + value.children.length;
    if (counted < value.total.min || counted > value.total.max) {
      return `adultes et enfants notés (${counted}) ne font pas le total dit (${value.total.min === value.total.max ? value.total.min : `${value.total.min} à ${value.total.max}`})`;
    }
  }
  const text = normalize(said);
  if (ADULT_WORDS.test(text)) return null;
  const counts = mentionedCounts(text);
  const expected = [value.total.min, value.total.max, value.adults].filter(
    (n): n is number => n !== null,
  );
  if (expected.some((n) => counts.has(n))) return null;
  return "le voyageur n'a dit ni combien de personnes partent, ni combien d'adultes";
}

/** « une semaine » compte ici, alors qu'on ne compte pas « une personne » comme un total. */
const DURATION_WORDS: Record<string, number> = {
  ...NUMBER_WORDS,
  un: 1,
  une: 1,
  one: 1,
  quinze: 15,
};
/** Les plus longs d'abord : sinon « un » gagnerait sur « une » et le reste ne suivrait pas. */
const DURATION_NUMBER = `(\\d{1,3}|${Object.keys(DURATION_WORDS)
  .sort((a, b) => b.length - a.length)
  .join("|")})`;
const NIGHTS_PER_UNIT: Record<string, number> = {
  jour: 1,
  day: 1,
  nuit: 1,
  night: 1,
  semaine: 7,
  week: 7,
  mois: 30,
  month: 30,
};
const DURATION_UNIT = "(jours?|nuits?|semaines?|mois|days?|nights?|weeks?|months?)";
/** Un nombre de nuits dit tel quel : « 3 semaines », « 9 nuits », « 10 jours ». */
const EXACT_DURATION = new RegExp(`\\b${DURATION_NUMBER}\\s*${DURATION_UNIT}\\b`, "g");
/** Une durée dite de façon approximative : « une dizaine de jours », « around 3 weeks ». */
/** `a_` : `normalize` marque la préposition « à », donc « à peu près » s'écrit ici « a_ peu pres ». */
const ABOUT =
  "environ|approximativement|a_? peu pres|autour de|dans les|pres de|grosso modo|plus ou moins|peut etre|peut-etre";
/** Une borne dit ce qu'on ne dépassera pas, pas la durée du voyage : « 10 jours max ». */
const BOUND =
  "maximum|max|minimum|mini|au (?:plus|moins)(?! tard| tot)|pas plus de|at most|at least|jusqu a_?";
const ABOUT_DURATION = new RegExp(
  `\\b(?:${ABOUT}|${BOUND}|une? (?:dizaine|quinzaine|douzaine) de|about|around|roughly|approximately)` +
    `\\s+(?:\\S+\\s+){0,2}${DURATION_UNIT}\\b|` +
    `\\b${DURATION_NUMBER}?\\s*${DURATION_UNIT}\\s+(?:${ABOUT}|${BOUND}|ou deux|ou trois|or so|give or take)\\b`,
  "g",
);

function unitNights(unit: string): number {
  const singular = unit.replace(/s$/, "");
  return NIGHTS_PER_UNIT[singular === "moi" ? "mois" : singular] ?? 1;
}

/**
 * Raison de douter d'une durée marquée « confirmée », ou null si le voyageur a donné un nombre.
 *
 * « une dizaine de jours » est parfois enregistré `confirmed` 9 à 9 nuits, ou `confirmed`
 * 9 à 10 nuits selon les essais. Le carnet affiche alors un nombre exact là où le voyageur donne
 * un ordre de grandeur. C'est donc le statut qu'on corrige, pas les bornes : « à préciser »
 * garde le carnet complet (completeness.ts), il dit seulement que le nombre vient du voyageur en gros,
 * pas au détail.
 */
export function durationDoubt(value: DurationValue, said: string): string | null {
  const text = normalize(said);

  const approximate = [...text.matchAll(ABOUT_DURATION)];
  const first = approximate[0];
  if (!first) return null;
  const inApproximation = (index: number) =>
    approximate.some((m) => index >= m.index && index < m.index + m[0].length);

  for (const match of text.matchAll(EXACT_DURATION)) {
    const [, count, unit] = match;
    if (!count || !unit || inApproximation(match.index)) continue;
    const nights = (DURATION_WORDS[count] ?? Number(count)) * unitNights(unit);
    // « 10 jours » vaut 9 nuits, mais un voyageur dit aussi « 10 jours » pour 10 nuits.
    const bornes = [value.minNights, value.maxNights];
    if (bornes.some((n) => n === nights || n === nights - 1)) return null;
  }
  return `le voyageur a dit « ${first[0].trim()} », pas un nombre de nuits`;
}

/** Mois et saisons, sous les formes qu'un voyageur écrit vraiment. */
const MOIS =
  /\b(janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre|printemps|ete|été|automne|hiver|vacances|noel|noël|paques|pâques|toussaint|january|february|march|april|may|june|july|august|september|october|november|december|spring|summer|autumn|winter)\b/i;
/**
 * Une date écrite en chiffres : « 15/06 », « 2027 ». Volontairement étroit : une première
 * version acceptait n'importe quel nombre, et « 4 adultes » passait pour une date.
 */
const DATE_CHIFFREE = /\b(\d{1,2}[/.-]\d{1,2}|20\d{2})\b/;

/**
 * Une période nommée alors que le voyageur n'a jamais dit ni mois, ni saison, ni date. Vu en
 * usage réel : « je suis flexible sur les dates » enregistré comme « octobre 2026 », déduit.
 * Le carnet affichait alors « à confirmer », et l'agent redemandait la période tour après tour.
 * Une flexibilité n'est pas une date : c'est une absence de contrainte, et elle se garde telle
 * quelle plutôt que remplie par un mois inventé.
 */
export function datesDoubt(label: string, said: string): string | null {
  const texte = normalize(said);
  if (texte.trim() === "") return null;
  if (MOIS.test(texte) || DATE_CHIFFREE.test(texte)) return null;
  if (!MOIS.test(normalize(label))) return null;
  return "aucun mois, aucune saison et aucune date ne sont dits ; « je suis flexible » est une absence de contrainte, pas une période";
}

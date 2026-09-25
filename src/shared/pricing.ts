import type { TurnUsage } from "./events";

/**
 * Ce qu'un tour coûte vraiment, en dollars. Le chiffre s'affiche au voyageur curieux dans
 * « Détails techniques », et sert au rejeu des scénarios : une seule table de prix pour les deux,
 * sinon les deux chiffres divergent au premier changement de tarif.
 *
 * Tarifs Haiku 4.5 par million de jetons, relevés dans la table de prix Anthropic. La
 * recherche web est facturée à l'unité, pas au jeton.
 */
export const PRICE_PER_MTOK = { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 };
export const PRICE_PER_SEARCH = 0.01;

/** Coût des jetons d'un tour, hors recherches web. */
export function tokenCost(usage: TurnUsage): number {
  return (
    (usage.inputTokens * PRICE_PER_MTOK.input +
      usage.outputTokens * PRICE_PER_MTOK.output +
      usage.cacheWriteTokens * PRICE_PER_MTOK.cacheWrite +
      usage.cacheReadTokens * PRICE_PER_MTOK.cacheRead) /
    1_000_000
  );
}

/** Coût complet d'un tour : jetons et recherches web. */
export function turnCost(usage: TurnUsage): number {
  return tokenCost(usage) + usage.webSearches * PRICE_PER_SEARCH;
}

/**
 * Part de l'entrée d'un tour servie par le cache. C'est le chiffre qui dit si le préfixe figé
 * tient : un prompt système qui bouge d'un octet le fait tomber d'un coup.
 */
export function cacheHitRate(luDansLeCache: number, entreeTotale: number): number {
  return entreeTotale === 0 ? 0 : luDansLeCache / entreeTotale;
}

/** Tous les jetons d'entrée d'un tour, cache compris : le dénominateur du taux ci-dessus. */
export function entreeTotale(usage: TurnUsage): number {
  return usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
}

/**
 * Ce que le cache a évité de payer. Sans lui, ces jetons seraient facturés au prix d'entrée.
 * Les relire coûte dix fois moins, les écrire coûte un quart de plus : c'est le net qui compte.
 * Comparaison avec un monde sans cache, donc un calcul, pas une mesure.
 */
export function cacheSavings(usage: TurnUsage): number {
  const gagne = usage.cacheReadTokens * (PRICE_PER_MTOK.input - PRICE_PER_MTOK.cacheRead);
  const paye = usage.cacheWriteTokens * (PRICE_PER_MTOK.cacheWrite - PRICE_PER_MTOK.input);
  return (gagne - paye) / 1_000_000;
}

/** Pourcentage arrondi, pour l'affichage. */
export function formatShare(part: number): string {
  return `${Math.round(part * 100)} %`;
}

/**
 * Affichage court. Sous un dixième de centime, « < 0,001 $ » vaut mieux que « 0,000 $ », qui
 * laisse croire à la gratuité.
 */
export function formatCost(dollars: number): string {
  if (dollars === 0) return "0 $";
  if (dollars < 0.001) return "< 0,001 $";
  return `${dollars.toFixed(3).replace(".", ",")} $`;
}

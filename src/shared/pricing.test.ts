import { describe, expect, it } from "vitest";
import type { TurnUsage } from "./events";
import {
  cacheHitRate,
  cacheSavings,
  entreeTotale,
  formatCost,
  tokenCost,
  turnCost,
} from "./pricing";

/**
 * Le coût affiché au voyageur et celui du rejeu des scénarios sortent de la même fonction. Un
 * écart entre les deux ferait douter des deux.
 */
const usage = (change: Partial<TurnUsage> = {}): TurnUsage => ({
  model: "claude-haiku-4-5",
  apiCalls: 1,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  webSearches: 0,
  firstTextMs: null,
  durationMs: 0,
  ...change,
});

describe("coût d'un tour", () => {
  it("un million de jetons d'entrée coûte un dollar", () => {
    expect(tokenCost(usage({ inputTokens: 1_000_000 }))).toBeCloseTo(1, 6);
  });

  it("la sortie coûte cinq fois l'entrée, le cache lu dix fois moins", () => {
    expect(tokenCost(usage({ outputTokens: 1_000_000 }))).toBeCloseTo(5, 6);
    expect(tokenCost(usage({ cacheReadTokens: 1_000_000 }))).toBeCloseTo(0.1, 6);
  });

  it("une recherche web s'ajoute aux jetons, elle n'est pas comptée dedans", () => {
    const u = usage({ inputTokens: 1_000_000, webSearches: 2 });
    expect(tokenCost(u)).toBeCloseTo(1, 6);
    expect(turnCost(u)).toBeCloseTo(1.02, 6);
  });

  it("un vrai tour tient sous le centime", () => {
    // Tour 1 du scénario « le voyageur pose les questions » : cache lu 8968, écrit 9743, sortie 539.
    const reel = usage({
      inputTokens: 10,
      outputTokens: 539,
      cacheReadTokens: 8968,
      cacheWriteTokens: 9743,
    });
    expect(turnCost(reel)).toBeLessThan(0.02);
  });

  it("un coût minuscule ne s'affiche jamais comme zéro", () => {
    expect(formatCost(0.0004)).toBe("< 0,001 $");
    expect(formatCost(0)).toBe("0 $");
    expect(formatCost(0.0235)).toBe("0,024 $");
  });
});

/**
 * Le cache est le premier levier de coût de cette application : le préfixe figé (prompt système
 * et outils) repart à chaque appel, et l'historique grossit à chaque tour. Les chiffres ci-dessous
 * viennent d'une conversation réelle de 10 tours, lue dans sa trace.
 */
describe("ce que le cache rapporte", () => {
  it("sans cache, le taux est nul et l'économie aussi", () => {
    const u = usage({ inputTokens: 1000 });
    expect(cacheHitRate(u.cacheReadTokens, entreeTotale(u))).toBe(0);
    expect(cacheSavings(u)).toBe(0);
  });

  it("un tour mesuré : presque toute l'entrée vient du cache", () => {
    // Tour 9 de la conversation réelle : 8 jetons neufs, 73 303 relus, 1 399 écrits.
    const u = usage({ inputTokens: 8, cacheReadTokens: 73_303, cacheWriteTokens: 1_399 });
    expect(cacheHitRate(u.cacheReadTokens, entreeTotale(u))).toBeCloseTo(0.981, 3);
    expect(cacheSavings(u)).toBeCloseTo(0.0656, 4);
  });

  it("écrire dans le cache se paie : une écriture seule coûte de l'argent", () => {
    expect(cacheSavings(usage({ cacheWriteTokens: 1_000_000 }))).toBeCloseTo(-0.25, 6);
  });

  it("la conversation entière : 87 % lus depuis le cache, 0,46 $ évités", () => {
    // Somme des 10 tours : 138 jetons neufs, 537 189 relus, 78 147 écrits.
    const u = usage({ inputTokens: 138, cacheReadTokens: 537_189, cacheWriteTokens: 78_147 });
    expect(cacheHitRate(u.cacheReadTokens, entreeTotale(u))).toBeCloseTo(0.873, 3);
    expect(cacheSavings(u)).toBeCloseTo(0.464, 3);
  });
});

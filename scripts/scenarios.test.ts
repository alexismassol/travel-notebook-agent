import { describe, expect, it } from "vitest";
import { estimerCout, estReference } from "./scenarios";

/**
 * Le rejeu des scénarios appelle le vrai modèle : c'est la seule commande du dépôt qui dépense de
 * l'argent. L'estimation existe pour qu'on sache combien avant, pas après.
 */
describe("estimation du coût avant de dépenser", () => {
  it("un seul scénario reste sous le seuil qui demande un feu vert", () => {
    expect(estimerCout(1, 1)).toBeLessThan(0.1);
  });

  it("les huit scénarios en trois passages dépassent largement le seuil", () => {
    // Ce même volume coûte 0,63 $ de jetons, plus 22 recherches web.
    expect(estimerCout(8, 3)).toBeGreaterThan(0.6);
  });

  it("un nombre de passages absurde ne descend jamais sous un passage", () => {
    expect(estimerCout(8, 0)).toEqual(estimerCout(8, 1));
  });
});

describe("protection du tableau de référence", () => {
  it("un passage unique n'est pas une mesure de référence", () => {
    expect(estReference({ only: undefined, fichier: undefined, repeat: 1 })).toBe(false);
  });

  it("un sous-ensemble n'est pas une mesure de référence, même répété", () => {
    expect(estReference({ only: "3-", fichier: undefined, repeat: 3 })).toBe(false);
    expect(estReference({ only: undefined, fichier: "essai.json", repeat: 3 })).toBe(false);
  });

  it("la liste complète jouée trois fois, oui", () => {
    expect(estReference({ only: undefined, fichier: undefined, repeat: 3 })).toBe(true);
  });
});

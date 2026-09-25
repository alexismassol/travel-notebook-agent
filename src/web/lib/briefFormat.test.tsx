import { describe, expect, it } from "vitest";
import { emptyBrief, type TravelBrief } from "../../shared/brief";
import { FIELD_LABELS, formatAlternatives, formatFieldValue, STATUS_LABELS } from "./briefFormat";

/**
 * Rendu des valeurs du brief, testé sur les fonctions pures. Sans ces tests, un changement de
 * formatage dans `src/web/` passerait sans filet.
 */
const brief = (change: (b: TravelBrief) => void): TravelBrief => {
  const b = emptyBrief();
  change(b);
  return b;
};

describe("ce que lit le voyageur dans son carnet", () => {
  it("chaque champ du brief a un libellé en français", () => {
    for (const label of Object.values(FIELD_LABELS)) {
      expect(label).toMatch(/^[A-ZÀ-Ü]/);
    }
    expect(FIELD_LABELS.departure).toBe("Ville de départ");
  });

  it("un statut incertain porte un mot, « confirmé » n'en porte aucun (c'est la coche)", () => {
    expect(STATUS_LABELS.vague).toBe("à préciser");
    expect(STATUS_LABELS.inferred).toBe("à confirmer");
    expect(STATUS_LABELS.conflicting).toBe("à trancher");
    expect(STATUS_LABELS.confirmed).toBeNull();
  });

  it("la ville de départ s'affiche telle que le voyageur l'a dite", () => {
    const b = brief((x) => {
      x.useful.departure = {
        status: "confirmed",
        value: "Clermont-Ferrand",
        alternatives: [],
        evidence: [],
      };
    });
    expect(formatFieldValue("departure", b)).toBe("Clermont-Ferrand");
  });

  it("une durée d'une seule nuit ne s'écrit pas au pluriel", () => {
    const une = brief((x) => {
      x.mandatory.duration = {
        status: "confirmed",
        value: { minNights: 1, maxNights: 1 },
        alternatives: [],
        evidence: [],
      };
    });
    expect(formatFieldValue("duration", une)).toBe("1 nuit");
  });

  it("une fourchette de nuits garde ses deux bornes", () => {
    const b = brief((x) => {
      x.mandatory.duration = {
        status: "vague",
        value: { minNights: 9, maxNights: 10 },
        alternatives: [],
        evidence: [],
      };
    });
    expect(formatFieldValue("duration", b)).toBe("9 à 10 nuits");
  });

  it("un champ jamais évoqué n'affiche rien plutôt qu'une valeur inventée", () => {
    const vide = emptyBrief();
    expect(formatFieldValue("departure", vide)).toBeNull();
    expect(formatFieldValue("budget", vide)).toBeNull();
    expect(formatFieldValue("destination", vide)).toBeNull();
  });

  it("une destination ouverte montre les envies, pas un lieu inventé", () => {
    const b = brief((x) => {
      x.mandatory.destination = {
        status: "vague",
        value: { mode: "open", places: [], zone: null, criteria: ["soleil", "sans les foules"] },
        alternatives: [],
        evidence: [],
      };
    });
    expect(formatFieldValue("destination", b)).toBe("soleil, sans les foules");
  });

  it("deux valeurs en conflit restent lisibles toutes les deux", () => {
    expect(
      formatAlternatives("duration", [
        { minNights: 21, maxNights: 21 },
        { minNights: 9, maxNights: 9 },
      ]),
    ).toEqual(["21 nuits", "9 nuits"]);
    expect(formatAlternatives("departure", ["Lyon"])).toEqual(["Lyon"]);
  });
});

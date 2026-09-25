import { describe, expect, it } from "vitest";
import { citationParleDe } from "./citation";

describe("citationParleDe : une citation parle-t-elle de cette valeur ?", () => {
  it("reconnaît les mots de la valeur, sans tenir compte des accents ni de la casse", () => {
    expect(citationParleDe(["cuisine de rue"], "On aime la CUISINE de rue")).toBe(true);
    expect(citationParleDe(["Baie d'Halong"], "la baie d'halong")).toBe(true);
    expect(citationParleDe(["belles décorations"], "belle décos")).toBe(true);
  });

  it("refuse une phrase qui parle d'autre chose", () => {
    expect(citationParleDe(["cuisine de rue"], "départ de Paris, budget autour de 4000 €")).toBe(
      false,
    );
  });

  it("reconnaît un montant écrit avec des espaces ou en milliers", () => {
    expect(citationParleDe(["4000"], "budget autour de 4 000 €")).toBe(true);
    expect(citationParleDe(["5000"], "on a 5k en tout")).toBe(true);
    expect(citationParleDe(["5000"], "on part de Paris")).toBe(false);
  });
});

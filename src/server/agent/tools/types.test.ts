import { describe, expect, it } from "vitest";
import { findLeakedSyntax } from "./types";

describe("findLeakedSyntax", () => {
  it("détecte la fuite réellement observée sur Haiku 4.5", () => {
    const observed = {
      status: "vague",
      zone: '</antml parameter>\n<parameter name="criteria">["soleil"]',
    };
    expect(findLeakedSyntax(observed)).toBe("zone");
  });

  it("détecte la fuite dans une liste", () => {
    expect(findLeakedSyntax({ places: ["Bali", '<parameter name="x">'] })).toBe("places[1]");
  });

  it('détecte un accent écrit en syntaxe TeX, réellement observé (« Cor"{e du Sud »)', () => {
    expect(findLeakedSyntax({ places: ["Japon", 'Cor"{e du Sud'] })).toBe("places[1]");
    expect(findLeakedSyntax({ label: "caf\\'e" })).toBe("label");
  });

  it("détecte l'accent cassé en plein mot, vu sur une vraie conversation", () => {
    // Le modèle avait d'abord écrit « belles décorations », puis l'a réécrit ainsi au tour
    // suivant. Le voyageur l'a lu sur son récapitulatif.
    expect(findLeakedSyntax({ interests: ["Halloween festif", "belles d\\teau9oratives"] })).toBe(
      "interests[1]",
    );
    expect(findLeakedSyntax({ constraints: ["voyage avec un b\\teau9e de 6 mois"] })).toBe(
      "constraints[0]",
    );
  });

  it("laisse passer un texte normal, y compris avec < et guillemets", () => {
    expect(
      findLeakedSyntax({ label: 'moins de <3 h de vol, "calme"', places: ["Hội An"] }),
    ).toBeNull();
    expect(findLeakedSyntax({ quote: "on part 24h/24, budget 2 000 €" })).toBeNull();
  });
});

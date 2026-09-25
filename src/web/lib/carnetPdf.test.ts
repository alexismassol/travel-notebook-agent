import { describe, expect, it } from "vitest";
import { pourPdf } from "./carnetPdf";

/**
 * Le texte dessiné dans le PDF n'est pas tout à fait celui de l'interface : les espaces fines du
 * français et le dessin du signe euro se comportent autrement une fois la page rendue.
 */
describe("texte préparé pour le PDF", () => {
  it("ramène les espaces insécables à une espace ordinaire", () => {
    expect(pourPdf("1 500  €")).toBe("1 500  €");
  });

  it("rend l'espace que le signe euro avale", () => {
    expect(pourPdf("jusqu'à 4 000 € au total")).toBe("jusqu'à 4 000 €  au total");
  });

  it("ne touche pas à un euro en fin de phrase", () => {
    expect(pourPdf("budget 4 000 €")).toBe("budget 4 000 €");
  });
});

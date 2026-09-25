// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Conversations } from "./Conversations";

/**
 * Sur téléphone, le bouton n'affiche plus qu'une icône. Son nom doit rester « Mes conversations »
 * pour un lecteur d'écran, et pour `scripts/visual-check.ts` qui le cherche par ce nom.
 */
afterEach(cleanup);

describe("bouton des conversations", () => {
  it("garde son nom quand seule l'icône est visible", () => {
    render(
      <Conversations
        courante={null}
        onOuvrir={() => {}}
        onSupprimer={() => {}}
        onNouvelle={() => {}}
      />,
    );
    const bouton = screen.getByRole("button", { name: "Mes conversations" });
    expect(bouton.querySelector("svg")).not.toBeNull();
    expect(bouton.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});

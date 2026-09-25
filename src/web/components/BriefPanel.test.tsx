// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { emptyBrief, type TravelBrief } from "../../shared/brief";
import { BriefPanel } from "./BriefPanel";

/**
 * Invariant numéro cinq du projet : une valeur incertaine ne s'affiche JAMAIS comme confirmée.
 * Ce test le vérifie sur le rendu réel, pas sur une fonction de formatage.
 */
afterEach(cleanup);

const brief = (change: (b: TravelBrief) => void): TravelBrief => {
  const b = emptyBrief();
  // Le panneau affiche son état vide tant que le carnet n'a jamais changé (version 0).
  b.version = 1;
  change(b);
  return b;
};

const rendre = (b: TravelBrief, missing: { field: "travellers"; reason: string }[] = []) =>
  render(
    <BriefPanel
      brief={b}
      completeness={{ ready: false, mandatoryOk: 0, missing }}
      changedFields={[]}
    />,
  );

describe("carnet de voyage", () => {
  it("une valeur déduite porte « à confirmer », jamais la coche", () => {
    const b = brief((x) => {
      x.mandatory.travellers = {
        status: "inferred",
        value: { total: { min: 4, max: 4 }, adults: 2, children: [{ age: 4 }], label: "2 adultes" },
        alternatives: [],
        evidence: [],
      };
    });
    rendre(b, [{ field: "travellers", reason: "déduit de vos messages : à confirmer" }]);
    expect(screen.getByText("à confirmer")).toBeTruthy();
    expect(screen.queryByLabelText("confirmé")).toBeNull();
    expect(screen.getByText("déduit de vos messages : à confirmer")).toBeTruthy();
  });

  it("une valeur dite par le voyageur porte la coche « confirmé »", () => {
    const b = brief((x) => {
      x.mandatory.destination = {
        status: "confirmed",
        value: { mode: "fixed", places: ["Vietnam"], zone: "Vietnam", criteria: [] },
        alternatives: [],
        evidence: [],
      };
    });
    rendre(b);
    expect(screen.getAllByLabelText("confirmé").length).toBeGreaterThan(0);
    expect(screen.getByText("Vietnam")).toBeTruthy();
  });

  it("deux réponses différentes affichent « à trancher » et les deux valeurs", () => {
    const b = brief((x) => {
      x.mandatory.duration = {
        status: "conflicting",
        value: { minNights: 21, maxNights: 21 },
        alternatives: [{ minNights: 9, maxNights: 9 }],
        evidence: [],
      };
    });
    rendre(b);
    expect(screen.getByText("à trancher")).toBeTruthy();
    expect(screen.getByText("9 nuits")).toBeTruthy();
  });

  it("la ville de départ apparaît dans « Vos préférences »", () => {
    const b = brief((x) => {
      x.useful.departure = {
        status: "confirmed",
        value: "Clermont-Ferrand",
        alternatives: [],
        evidence: [],
      };
    });
    rendre(b);
    expect(screen.getByText("Vos préférences")).toBeTruthy();
    expect(screen.getByText("Ville de départ")).toBeTruthy();
    expect(screen.getByText("Clermont-Ferrand")).toBeTruthy();
  });

  it("un carnet vide invite à parler, sans inventer de valeur", () => {
    rendre(emptyBrief());
    expect(screen.getByText(/se dessine ici/)).toBeTruthy();
    expect(screen.queryByLabelText("confirmé")).toBeNull();
  });
});

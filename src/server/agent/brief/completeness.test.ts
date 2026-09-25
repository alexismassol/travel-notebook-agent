import { describe, expect, it } from "vitest";
import { emptyBrief, type TravelBrief } from "../../../shared/brief";
import { computeCompleteness } from "./completeness";

const ev = [{ quote: "test", turn: 1 }];

/** Brief "Vietnam, 3 semaines en novembre, on est 2" : l'exemple complet du cadrage produit. */
function vietnamBrief(): TravelBrief {
  const b = emptyBrief();
  b.mandatory.destination = {
    status: "confirmed",
    value: { mode: "fixed", places: ["Vietnam"], zone: "Vietnam", criteria: [] },
    alternatives: [],
    evidence: ev,
  };
  b.mandatory.dates = {
    status: "vague",
    value: { earliest: "2027-11-01", latest: "2027-11-30", label: "novembre 2026" },
    alternatives: [],
    evidence: ev,
  };
  b.mandatory.duration = {
    status: "confirmed",
    value: { minNights: 21, maxNights: 21 },
    alternatives: [],
    evidence: ev,
  };
  b.mandatory.travellers = {
    status: "confirmed",
    value: { total: { min: 2, max: 2 }, adults: 2, children: [], label: "2 adultes" },
    alternatives: [],
    evidence: ev,
  };
  return b;
}

describe("computeCompleteness", () => {
  it("un brief vide n'est pas prêt et liste les 4 obligatoires", () => {
    const c = computeCompleteness(emptyBrief());
    expect(c.ready).toBe(false);
    expect(c.mandatoryOk).toBe(0);
    expect(c.missing.map((m) => m.field)).toEqual([
      "destination",
      "dates",
      "duration",
      "travellers",
    ]);
  });

  it("l'exemple complet du cadrage produit est prêt sans question supplémentaire", () => {
    const c = computeCompleteness(vietnamBrief());
    expect(c).toEqual({ ready: true, mandatoryOk: 4, missing: [] });
  });

  it("'cet été' (fenêtre de 3 mois) est gardé mais pas suffisant", () => {
    const b = vietnamBrief();
    b.mandatory.dates = {
      status: "vague",
      value: { earliest: "2027-06-01", latest: "2027-08-31", label: "cet été" },
      alternatives: [],
      evidence: ev,
    };
    const c = computeCompleteness(b);
    expect(c.ready).toBe(false);
    expect(c.missing).toHaveLength(1);
    expect(c.missing[0]?.field).toBe("dates");
  });

  it("'on sera 4 ou 6' n'est pas suffisant, '4 ou 5' l'est", () => {
    const b = vietnamBrief();
    b.mandatory.travellers = {
      status: "vague",
      value: { total: { min: 4, max: 6 }, adults: null, children: [], label: "4 ou 6" },
      alternatives: [],
      evidence: ev,
    };
    expect(computeCompleteness(b).ready).toBe(false);
    b.mandatory.travellers.value = {
      total: { min: 4, max: 5 },
      adults: null,
      children: [],
      label: "4 ou 5",
    };
    expect(computeCompleteness(b).ready).toBe(true);
  });

  it("un enfant sans âge empêche le carnet complet", () => {
    const b = vietnamBrief();
    b.mandatory.travellers = {
      status: "confirmed",
      value: {
        total: { min: 3, max: 3 },
        adults: 2,
        children: [{ age: null }],
        label: "2 adultes, 1 enfant",
      },
      alternatives: [],
      evidence: ev,
    };
    const c = computeCompleteness(b);
    expect(c.ready).toBe(false);
    expect(c.missing[0]?.reason).toMatch(/âge/);
  });

  it("une valeur inférée non validée empêche le carnet complet", () => {
    const b = vietnamBrief();
    b.mandatory.travellers.status = "inferred";
    expect(computeCompleteness(b).ready).toBe(false);
  });

  it("une contradiction empêche le carnet complet", () => {
    const b = vietnamBrief();
    b.mandatory.duration.status = "conflicting";
    b.mandatory.duration.alternatives = [{ minNights: 10, maxNights: 10 }];
    const c = computeCompleteness(b);
    expect(c.ready).toBe(false);
    expect(c.missing[0]?.field).toBe("duration");
  });

  it("une destination ouverte ou sur plusieurs pays empêche le carnet complet", () => {
    const b = vietnamBrief();
    b.mandatory.destination.value = { mode: "open", places: [], zone: null, criteria: ["soleil"] };
    expect(computeCompleteness(b).ready).toBe(false);
    b.mandatory.destination.value = {
      mode: "shortlist",
      places: ["Vietnam", "Thaïlande"],
      zone: null,
      criteria: [],
    };
    expect(computeCompleteness(b).ready).toBe(false);
  });

  it("une durée plus longue que la fenêtre de dates est une incohérence", () => {
    const b = vietnamBrief();
    b.mandatory.dates.value = {
      earliest: "2027-11-01",
      latest: "2027-11-10",
      label: "début novembre",
    };
    const c = computeCompleteness(b);
    expect(c.ready).toBe(false);
    expect(c.missing.map((m) => m.field)).toContain("duration");
  });

  it("les champs utiles ne bloquent jamais", () => {
    const b = vietnamBrief();
    b.useful.budget.status = "conflicting";
    expect(computeCompleteness(b).ready).toBe(true);
  });
});

describe("dates invalides", () => {
  it("une date inexistante est refusée par le schéma du brief", async () => {
    const { DatesValue } = await import("../../../shared/brief");
    expect(
      DatesValue.safeParse({ earliest: "2027-13-45", latest: "2027-12-31", label: "x" }).success,
    ).toBe(false);
    expect(
      DatesValue.safeParse({ earliest: "2027-02-30", latest: "2027-03-10", label: "x" }).success,
    ).toBe(false);
    expect(
      DatesValue.safeParse({ earliest: "2028-02-29", latest: "2028-03-10", label: "x" }).success,
    ).toBe(true);
  });

  it("défense en profondeur : une date illisible ne rend jamais le brief prêt", () => {
    const b = vietnamBrief();
    b.mandatory.dates.value = { earliest: "2027-13-45", latest: "2027-12-31", label: "x" };
    const c = computeCompleteness(b);
    expect(c.ready).toBe(false);
    expect(c.missing.map((m) => m.field)).toContain("dates");
  });
});

describe("dates déjà passées", () => {
  it("une fenêtre de dates entièrement passée ne fait pas un carnet complet (cas réel : « juin 2026 » en septembre 2026)", () => {
    const b = vietnamBrief();
    b.mandatory.dates.value = { earliest: "2026-06-01", latest: "2026-06-30", label: "juin 2026" };
    const c = computeCompleteness(b, "2026-09-16");
    expect(c.ready).toBe(false);
    expect(c.missing.find((m) => m.field === "dates")?.reason).toMatch(/passée/);
  });

  it("une fenêtre qui n'est pas encore finie reste valable", () => {
    const b = vietnamBrief();
    b.mandatory.dates.value = { earliest: "2026-09-01", latest: "2026-09-30", label: "septembre" };
    expect(computeCompleteness(b, "2026-09-16").ready).toBe(true);
  });
});

describe("raisons affichées sous chaque case du carnet", () => {
  /** Toutes les raisons que le carnet peut afficher, provoquées une à une. */
  function allReasons(): string[] {
    const cases: ((b: TravelBrief) => void)[] = [
      (b) => {
        b.mandatory.travellers.status = "inferred";
      },
      (b) => {
        b.mandatory.duration.status = "conflicting";
        b.mandatory.duration.alternatives = [{ minNights: 9, maxNights: 9 }];
      },
      (b) => {
        b.mandatory.dates.value = { earliest: "2026-06-01", latest: "2026-06-30", label: "juin" };
      },
      (b) => {
        b.mandatory.dates.value = { earliest: "2027-13-45", latest: "2027-14-01", label: "?" };
      },
      (b) => {
        b.mandatory.travellers.value = {
          total: { min: 3, max: 3 },
          adults: 2,
          children: [{ age: null }],
          label: "2 adultes, 1 enfant",
        };
      },
      (b) => {
        b.mandatory.destination.value = {
          mode: "shortlist",
          places: ["Japon", "Corée du Sud"],
          zone: null,
          criteria: [],
        };
      },
    ];
    return cases.flatMap((mutate) => {
      const b = vietnamBrief();
      mutate(b);
      return computeCompleteness(b, "2026-09-17").missing.map((m) => m.reason);
    });
  }

  it("parlent au voyageur : ni « le voyageur », ni « l'agent », ni « brief », ni consigne interne", () => {
    const reasons = allReasons();
    expect(reasons.length).toBeGreaterThanOrEqual(6);
    for (const reason of reasons) {
      expect(reason).not.toMatch(/voyageur|l'agent|brief|demander/i);
    }
  });
});

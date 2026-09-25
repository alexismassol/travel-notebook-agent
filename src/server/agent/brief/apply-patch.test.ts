import { describe, expect, it } from "vitest";
import { emptyBrief } from "../../../shared/brief";
import { applyPatch, BriefPatch, MAX_NUANCES } from "./apply-patch";

describe("BriefPatch (validation de l'entrée de l'outil update_brief)", () => {
  it("refuse le statut unknown : l'agent n'efface pas une information dite", () => {
    const r = BriefPatch.safeParse({
      duration: { status: "unknown", value: { minNights: 7, maxNights: 7 }, quote: "une semaine" },
    });
    expect(r.success).toBe(false);
  });

  it("refuse une valeur nulle", () => {
    const r = BriefPatch.safeParse({ duration: { status: "vague", value: null, quote: "x" } });
    expect(r.success).toBe(false);
  });

  it("refuse un conflit sans alternative", () => {
    const r = BriefPatch.safeParse({
      duration: {
        status: "conflicting",
        value: { minNights: 21, maxNights: 21 },
        quote: "3 semaines",
      },
    });
    expect(r.success).toBe(false);
  });

  it("refuse un patch vide", () => {
    expect(BriefPatch.safeParse({}).success).toBe(false);
  });

  it("refuse une fenêtre de dates inversée", () => {
    const r = BriefPatch.safeParse({
      dates: {
        status: "vague",
        value: { earliest: "2026-12-01", latest: "2026-11-01", label: "x" },
        quote: "x",
      },
    });
    expect(r.success).toBe(false);
  });
});

describe("applyPatch", () => {
  it("applique, versionne, garde la citation et décrit le changement", () => {
    const patch = BriefPatch.parse({
      dates: {
        status: "vague",
        value: { earliest: "2027-06-01", latest: "2027-08-31", label: "cet été" },
        quote: "cet été, deux semaines à peu près",
      },
      nuances: ["on ne veut pas trop de route"],
    });
    const { brief, changes } = applyPatch(emptyBrief(), patch, 1);
    expect(brief.version).toBe(1);
    expect(brief.mandatory.dates.status).toBe("vague");
    expect(brief.mandatory.dates.evidence).toEqual([
      { quote: "cet été, deux semaines à peu près", turn: 1 },
    ]);
    expect(brief.nuances).toEqual([{ quote: "on ne veut pas trop de route", turn: 1 }]);
    expect(changes).toEqual(["dates : à définir -> à préciser (cet été)", "nuance ajoutée"]);
    expect(brief.changelog).toEqual([{ version: 1, turn: 1, changes }]);
  });

  it("n'altère pas le brief d'origine (immutabilité)", () => {
    const original = emptyBrief();
    applyPatch(
      original,
      BriefPatch.parse({ style: { status: "confirmed", value: ["slow travel"], quote: "slow" } }),
      2,
    );
    expect(original.version).toBe(0);
    expect(original.useful.style.status).toBe("unknown");
  });

  it("ne duplique pas une citation déjà enregistrée", () => {
    const patch = BriefPatch.parse({
      interests: { status: "confirmed", value: ["plongée"], quote: "on adore plonger" },
    });
    const once = applyPatch(emptyBrief(), patch, 1).brief;
    const twice = applyPatch(once, patch, 1).brief;
    expect(twice.useful.interests.evidence).toHaveLength(1);
  });
});

describe("plafond des nuances", () => {
  it("ne garde pas plus de MAX_NUANCES citations", () => {
    let brief = emptyBrief();
    for (let i = 0; i < MAX_NUANCES + 5; i++) {
      brief = applyPatch(brief, BriefPatch.parse({ nuances: [`nuance ${i}`] }), i).brief;
    }
    expect(brief.nuances).toHaveLength(MAX_NUANCES);
  });
});

/**
 * La citation montrée sous une information doit être celle qui la justifie. Sur une vraie
 * demande, la contrainte « voyage avec un bébé de 4 mois » était attribuée au mot « tout », dit
 * plusieurs tours plus tard pour répondre à une question de budget.
 */
describe("la citation suit la valeur, pas le dernier message", () => {
  const contrainte = (valeur: string[], quote: string) => ({
    constraints: { status: "confirmed" as const, value: valeur, quote },
  });

  it("une valeur renvoyée à l'identique ne change pas sa citation", () => {
    const un = applyPatch(
      emptyBrief(),
      contrainte(["bébé de 4 mois"], "on part avec notre bébé de 4 mois"),
      2,
    );
    const deux = applyPatch(un.brief, contrainte(["bébé de 4 mois"], "tout"), 5);
    expect(deux.brief.useful.constraints.evidence.map((e) => e.quote)).toEqual([
      "on part avec notre bébé de 4 mois",
    ]);
  });

  it("une valeur qui change garde la phrase qui l'a fait changer", () => {
    const un = applyPatch(emptyBrief(), contrainte(["bébé de 4 mois"], "notre bébé"), 2);
    const deux = applyPatch(
      un.brief,
      contrainte(["bébé de 4 mois", "pas de vol de nuit"], "et surtout pas de vol de nuit"),
      6,
    );
    const citations = deux.brief.useful.constraints.evidence.map((e) => e.quote);
    expect(citations[citations.length - 1]).toBe("et surtout pas de vol de nuit");
  });

  it("un statut qui se confirme garde la phrase qui l'a confirmé", () => {
    const un = applyPatch(
      emptyBrief(),
      {
        duration: {
          status: "vague",
          value: { minNights: 7, maxNights: 9 },
          quote: "une semaine ou deux",
        },
      },
      1,
    );
    const deux = applyPatch(
      un.brief,
      {
        duration: {
          status: "confirmed",
          value: { minNights: 7, maxNights: 9 },
          quote: "disons 7 à 9 nuits",
        },
      },
      3,
    );
    const citations = deux.brief.mandatory.duration.evidence.map((e) => e.quote);
    expect(citations[citations.length - 1]).toBe("disons 7 à 9 nuits");
  });
});

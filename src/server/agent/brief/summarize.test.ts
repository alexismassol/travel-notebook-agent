import { describe, expect, it } from "vitest";
import { emptyBrief } from "../../../shared/brief";
import { computeCompleteness } from "./completeness";
import { summarizeBrief } from "./summarize";

/**
 * Ce résumé n'est pas un détail d'affichage : c'est le texte que le modèle relit à chaque tour,
 * et celui qu'il reprend à l'oral. Une tournure bancale ici ressort dans la conversation.
 */
describe("résumé du carnet", () => {
  it("une durée dont les bornes sont égales se lit « 6 nuits », pas « 6 à 6 nuits »", () => {
    const brief = emptyBrief();
    brief.mandatory.duration = {
      status: "confirmed",
      value: { minNights: 6, maxNights: 6 },
      evidence: [{ quote: "une semaine", turn: 1 }],
      alternatives: [],
    };
    const texte = summarizeBrief(brief, computeCompleteness(brief));
    expect(texte).toContain("6 nuits");
    expect(texte).not.toContain("6 à 6");
  });

  it("une fourchette garde ses deux bornes", () => {
    const brief = emptyBrief();
    brief.mandatory.duration = {
      status: "vague",
      value: { minNights: 12, maxNights: 16 },
      evidence: [{ quote: "deux semaines à peu près", turn: 1 }],
      alternatives: [],
    };
    expect(summarizeBrief(brief, computeCompleteness(brief))).toContain("12 à 16 nuits");
  });
});

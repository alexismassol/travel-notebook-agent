import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { travellerText } from "./traveller-text";

describe("travellerText : seuls les mots du voyageur", () => {
  it("garde le message et les réponses aux blocs, jamais l'état serveur ni les résultats d'outils", () => {
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "Les enfants ont 4 et 7 ans." },
          {
            type: "text",
            text: "<contexte_serveur>\ntravellers [inferred] 2 adultes\n</contexte_serveur>",
          },
        ],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "Vous partez à 2 adultes ?" }],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "a",
            content: "Changements : travellers (2 adultes)",
          },
          {
            type: "tool_result",
            tool_use_id: "b",
            content: "Réponse du voyageur : 2 adultes. Réponse libre : « et le chien »",
          },
          {
            type: "tool_result",
            tool_use_id: "c",
            content: "Le voyageur n'a pas utilisé l'interface proposée. Il a écrit : « plutôt 3 »",
          },
        ],
      },
    ];
    const text = travellerText(messages);
    expect(text).toContain("Les enfants ont 4 et 7 ans.");
    expect(text).toContain("2 adultes");
    expect(text).toContain("et le chien");
    expect(text).toContain("plutôt 3");
    expect(text).not.toContain("Changements");
    expect(text).not.toContain("contexte_serveur");
    expect(text).not.toContain("Vous partez");
  });
});

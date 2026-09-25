import { describe, expect, it } from "vitest";
import { ConversationStore } from "../../conversation";
import { presentBriefTool } from "./present-brief";

/**
 * Deuxième couche du même défaut : même si le modèle rappelle `present_brief` après la
 * validation, le serveur refuse, et aucun second récapitulatif ne s'affiche.
 */
describe("present_brief sur un carnet déjà validé", () => {
  it("refuse, sans rien afficher", async () => {
    const conversation = new ConversationStore().create();
    conversation.sentAt = "2026-09-25T12:00:00.000Z";
    const emis: unknown[] = [];
    const outcome = await presentBriefTool.run(
      { message: "Votre carnet de voyage est prêt." },
      { conversation, toolUseId: "t", emit: (e) => emis.push(e) },
    );
    expect(outcome.kind === "result" && outcome.isError).toBe(true);
    expect(outcome.kind === "result" && outcome.content).toMatch(/déjà validé/);
    expect(emis).toEqual([]);
  });
});

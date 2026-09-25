import { describe, expect, it } from "vitest";
import type { ServerEvent } from "../../../shared/events";
import { ConversationStore } from "../../conversation";
import { askChoiceTool } from "./ask-choice";

/**
 * La question et ses options s'affichent telles quelles chez le voyageur. Le modèle écrit parfois
 * l'échappement d'un accent au lieu de l'accent, et « dépaysement » devient « dépaysement »
 * à l'écran, un cas vu en usage réel. Le filtre du texte en flux ne voit pas ces blocs.
 */
async function poser(input: unknown) {
  const events: ServerEvent[] = [];
  const conversation = new ConversationStore().create();
  await askChoiceTool.run(input, {
    emit: (e: ServerEvent) => events.push(e),
    toolUseId: "toolu_1",
    conversation,
    turn: 1,
    config: undefined as never,
    client: undefined as never,
    messages: [],
  } as never);
  const bloc = events.find((e) => e.type === "ui_block");
  return bloc?.type === "ui_block" && bloc.block.kind === "choice" ? bloc.block : null;
}

describe("question à choix affichée au voyageur", () => {
  it("un accent écrit en échappement redevient un accent, dans la question et les options", async () => {
    const bloc = await poser({
      question: "Quel type de d\\u00e9paysement vous attire ?",
      options: [
        { label: "Plages et cocotiers" },
        { label: "Montagne", description: "Air frais et randonn\\u00e9es" },
      ],
      multiSelect: false,
      allowFreeText: true,
    });
    expect(bloc?.question).toBe("Quel type de dépaysement vous attire\u202f?");
    expect(bloc?.options[1]?.description).toBe("Air frais et randonnées");
  });

  it("une question normale n'est pas touchée", async () => {
    const bloc = await poser({
      question: "Combien de nuits ?",
      options: [{ label: "Une semaine" }, { label: "Deux semaines" }],
      multiSelect: false,
      allowFreeText: false,
    });
    expect(bloc?.question).toBe("Combien de nuits\u202f?");
  });
});

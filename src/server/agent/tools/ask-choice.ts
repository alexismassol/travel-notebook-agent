import { z } from "zod";
import { nettoyerTexteVisible } from "../text-guard";
import { toInputSchema } from "./schema";
import { type AgentTool, invalidInput } from "./types";

const AskChoiceInput = z.object({
  question: z.string().min(3).max(200),
  options: z
    .array(
      z.object({
        label: z.string().min(1).max(60),
        description: z.string().max(120).optional(),
      }),
    )
    .min(2)
    .max(6),
  multiSelect: z.boolean().describe("true si plusieurs réponses peuvent être vraies ensemble"),
  allowFreeText: z.boolean().describe("true pour laisser une réponse libre « Autre »"),
});

export const askChoiceTool: AgentTool = {
  definition: {
    name: "ask_choice",
    description:
      "Pose UNE question au voyageur avec des choix cliquables. À utiliser quand les réponses " +
      "possibles sont peu nombreuses et prévisibles : c'est plus rapide qu'une question ouverte. " +
      "Les options doivent tenir compte de ce que le voyageur a déjà dit. Cet outil termine ton " +
      "tour : écris au plus une phrase avant, la réponse arrivera comme résultat de l'outil.",
    input_schema: toInputSchema(AskChoiceInput),
  },
  activityLabel: () => "Préparation d'une question",
  async run(input, { emit, toolUseId }) {
    const parsed = AskChoiceInput.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error.issues);
    // Le modèle écrit parfois l'échappement d'un accent au lieu de l'accent. Le filtre du texte
    // en flux le répare déjà, mais ces blocs ne passent pas par lui.
    const data = {
      ...parsed.data,
      question: nettoyerTexteVisible(parsed.data.question),
      options: parsed.data.options.map((o) => ({
        label: nettoyerTexteVisible(o.label),
        ...(o.description ? { description: nettoyerTexteVisible(o.description) } : {}),
      })),
    };
    emit({ type: "ui_block", block: { kind: "choice", toolUseId, ...data } });
    return {
      kind: "terminal",
      awaiting: "choice",
      options: data.options.map((o) => o.label),
    };
  },
};

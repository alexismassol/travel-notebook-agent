import { z } from "zod";
import { computeCompleteness } from "../brief/completeness";
import { nettoyerTexteVisible } from "../text-guard";
import { toInputSchema } from "./schema";
import { type AgentTool, invalidInput } from "./types";

const PresentBriefInput = z.object({
  message: z
    .string()
    .min(3)
    .max(400)
    .describe(
      "Une ou deux phrases : ce que tu as compris du projet, et l'invitation à télécharger le carnet",
    ),
});

export const presentBriefTool: AgentTool = {
  definition: {
    name: "present_brief",
    description:
      "Présente le carnet de voyage complet : le récapitulatif du brief, puis le bouton qui " +
      "permet au voyageur de télécharger son carnet. À appeler dès que le serveur indique que le " +
      "brief est complet, y compris quand le voyageur a tout donné d'un coup. Ne l'appelle pas " +
      "tant qu'une information obligatoire manque : le serveur refuse. Cet outil termine ton tour.",
    input_schema: toInputSchema(PresentBriefInput),
  },
  activityLabel: () => "Préparation du récapitulatif",
  async run(input, { conversation, emit, toolUseId }) {
    const parsed = PresentBriefInput.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error.issues);

    // Un carnet validé ne se représente pas : le voyageur l'a déjà téléchargé.
    if (conversation.sentAt) {
      return {
        kind: "result",
        isError: true,
        content:
          "Refusé : le carnet est déjà validé et téléchargé. Ne le présente pas à nouveau : réponds simplement au voyageur.",
      };
    }

    // Invariant tenu par le code : le modèle ne peut pas présenter un carnet incomplet.
    const completeness = computeCompleteness(conversation.brief);
    if (!completeness.ready) {
      const missing = completeness.missing.map((m) => `${m.field} : ${m.reason}`).join(" ; ");
      return {
        kind: "result",
        isError: true,
        content: `Refusé : le brief n'est pas complet (${missing}). Continue le dialogue sur ce qui manque, une question à la fois.`,
      };
    }

    emit({
      type: "ui_block",
      block: {
        kind: "brief_summary",
        toolUseId,
        message: nettoyerTexteVisible(parsed.data.message),
        brief: conversation.brief,
        completeness,
      },
    });
    return { kind: "terminal", awaiting: "brief_confirmation" };
  },
};

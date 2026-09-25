import { z } from "zod";
import { trace } from "../../conversation";
import { PLAYBOOK_NAMES, PLAYBOOKS, readPlaybook } from "../playbooks";
import { toInputSchema } from "./schema";
import { type AgentTool, invalidInput } from "./types";

const LoadPlaybookInput = z.object({
  name: z.enum(PLAYBOOK_NAMES),
  reason: z
    .string()
    .min(3)
    .max(300)
    .describe("Ce qui, dans la conversation, t'a fait détecter la situation (mots du voyageur)"),
});

const catalogue = Object.entries(PLAYBOOKS)
  .map(([name, p]) => `- ${name} : à charger ${p.whenToLoad}.`)
  .join("\n");

/**
 * Le rappel est dans les résultats d'outils de l'appel où il a été émis : le modèle ne le lit
 * qu'une fois ces résultats ajoutés à l'historique. Même longueur d'historique = même appel.
 */
function nudgeSeenByModel(nudgedAt: number | undefined, historyLength: number): boolean {
  return nudgedAt !== undefined && historyLength > nudgedAt;
}

export const loadPlaybookTool: AgentTool = {
  definition: {
    name: "load_playbook",
    description:
      "Charge un jeu d'instructions spécialisées, au moment où la situation apparaît. Appelle-le " +
      "sans l'annoncer au voyageur : un bandeau le lui montre déjà. Les instructions chargées " +
      "s'appliquent jusqu'à la fin de la conversation. Playbooks " +
      `disponibles :\n${catalogue}`,
    input_schema: toInputSchema(LoadPlaybookInput),
  },
  activityLabel: () => "Chargement de conseils spécialisés",
  async run(input, { conversation, emit }) {
    const parsed = LoadPlaybookInput.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error.issues);
    const { name, reason } = parsed.data;

    // Idempotent : le texte est déjà dans l'historique, ne pas le payer une seconde fois.
    const previous = conversation.playbooks.find((p) => p.name === name);
    if (previous) {
      return {
        kind: "result",
        content: `Le playbook ${name} est déjà chargé depuis le tour ${previous.turn}. Ses instructions s'appliquent toujours.`,
      };
    }

    const content = readPlaybook(name);
    const load = {
      name,
      reason,
      turn: conversation.turn,
      origin: nudgeSeenByModel(conversation.nudgedPlaybooks.get(name), conversation.messages.length)
        ? ("nudged" as const)
        : ("spontaneous" as const),
    };
    conversation.playbooks.push(load);
    emit({ type: "playbook_loaded", ...load, label: PLAYBOOKS[name].label });
    void trace({
      conversationId: conversation.id,
      turn: conversation.turn,
      at: new Date().toISOString(),
      kind: "playbook_loaded",
      name,
      reason,
      origin: load.origin,
    });
    return { kind: "result", content };
  },
};

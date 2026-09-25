import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { computeCompleteness } from "../../src/server/agent/brief/completeness";
import { runTurn } from "../../src/server/agent/loop";
import { loadConfig } from "../../src/server/config";
import { ConversationStore } from "../../src/server/conversation";
import type { ServerEvent } from "../../src/shared/events";

/**
 * Vrais appels à l'API Anthropic, avec le modèle configuré (Haiku 4.5 par défaut).
 * Ces tests coûtent des tokens et dépendent d'un modèle non déterministe : ils vérifient des
 * comportements structurels (quel outil, quel état), pas un texte exact.
 * Lancement : `npm run test:integration` (clé dans .env).
 */

// Pas de clé = échec explicite, jamais un vert obtenu en sautant les tests.
if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error(
    "ANTHROPIC_API_KEY manquante : ces tests appellent l'API réelle (voir .env.example).",
  );
}
const config = loadConfig();
const client = new Anthropic();

async function oneTurn(text: string) {
  const conversation = new ConversationStore().create();
  const events: ServerEvent[] = [];
  const awaiting = await runTurn(conversation, { kind: "text", text }, (e) => events.push(e), {
    client,
    config,
  });
  const toolCalls = events
    .filter((e): e is Extract<ServerEvent, { type: "tool_activity" }> => e.type === "tool_activity")
    .map((e) => e.tool);
  const usage = events.find((e) => e.type === "turn_end");
  const reply = events
    .filter((e): e is Extract<ServerEvent, { type: "text_delta" }> => e.type === "text_delta")
    .map((e) => e.text)
    .join("");
  console.log(
    JSON.stringify(
      { text, awaiting, toolCalls, usage: usage?.type === "turn_end" ? usage.usage : null, reply },
      null,
      2,
    ),
  );
  return { conversation, events, awaiting, toolCalls };
}

describe(`agent réel (${config.model})`, () => {
  it("famille détectée : l'agent charge lui-même le playbook voyage-en-famille", async () => {
    const { conversation } = await oneTurn(
      "Bonjour, on voudrait partir au soleil cet hiver avec nos deux enfants de 4 et 7 ans, mais on ne sait pas du tout où.",
    );
    expect(conversation.playbooks.map((p) => p.name)).toContain("voyage-en-famille");
    console.log("chargement :", JSON.stringify(conversation.playbooks));
  });

  it("envie de surprise : l'agent charge lui-même le playbook voyage-surprise, sur au moins 2 essais sur 3", async () => {
    // Formulation libre, sans le mot « surprise » : l'agent doit reconnaître la situation seul.
    const tries = 3;
    let loaded = 0;
    for (let i = 0; i < tries; i++) {
      const { conversation } = await oneTurn(
        "On a deux semaines en octobre, à deux. Emmenez-nous quelque part d'inattendu, on veut vivre un truc qu'on n'oubliera jamais.",
      );
      const surprise = conversation.playbooks.find((p) => p.name === "voyage-surprise");
      if (surprise?.origin === "spontaneous") loaded += 1;
    }
    console.log(`playbook voyage-surprise chargé seul sur ${loaded}/${tries} essais`);
    expect(loaded).toBeGreaterThanOrEqual(2);
  }, 400_000);

  it("infos complètes : brief prêt dès le premier tour, sans question à choix", async () => {
    const { conversation, awaiting, toolCalls } = await oneTurn(
      "Vietnam, 3 semaines en novembre, on est 2, budget ~4000€",
    );
    const completeness = computeCompleteness(conversation.brief);
    console.log("complétude :", JSON.stringify(completeness));
    expect(toolCalls.some((t) => t.startsWith("note_"))).toBe(true);
    expect(toolCalls).not.toContain("ask_choice");
    expect(completeness.mandatoryOk).toBeGreaterThanOrEqual(3);
    expect(["brief_confirmation", "text"]).toContain(awaiting);
  });

  it("demande de conseil : l'agent cherche avant d'affirmer, sur au moins 2 essais sur 3", async () => {
    // Comportement non déterministe (mesuré : 0 recherche sur un passage, 1 sur le suivant) :
    // on vérifie un TAUX, pas un succès unique. Le taux mesuré est affiché.
    const tries = 3;
    let searched = 0;
    for (let i = 0; i < tries; i++) {
      const { toolCalls } = await oneTurn("Le trek au Népal en juillet, c'est jouable ?");
      if (toolCalls.includes("web_search")) searched += 1;
    }
    console.log(`recherche web faite sur ${searched}/${tries} essais`);
    expect(searched).toBeGreaterThanOrEqual(2);
  });

  it("composition variable : l'agent pose une question à choix, sur au moins 1 essai sur 3", async () => {
    // Taux, pas succès unique. Seuil bas assumé : mesure la capacité, pas sa fréquence idéale.
    const tries = 3;
    let asked = 0;
    for (let i = 0; i < tries; i++) {
      const { events } = await oneTurn(
        "On part à Bali, 10 jours en juin, mais on sera 4 ou 6 personnes, ça dépend des amis.",
      );
      if (events.some((e) => e.type === "ui_block" && e.block.kind === "choice")) asked += 1;
    }
    console.log(`question à choix posée sur ${asked}/${tries} essais`);
    expect(asked).toBeGreaterThanOrEqual(1);
  });
});

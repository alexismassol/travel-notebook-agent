import { readFile, rm } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { briefTools } from "./agent/tools/brief-tools";
import { ConversationStore, flushTraces, trace } from "./conversation";

describe("trace", () => {
  it("écrit les lignes dans l'ordre des appels, même lancés sans attendre", async () => {
    const conversationId = `test-ordre-${Date.now()}`;
    const calls = Array.from({ length: 30 }, (_, i) =>
      trace({ conversationId, turn: i, at: new Date().toISOString(), kind: "text_leak" }),
    );
    await Promise.all(calls);
    const file = new URL(`../../data/traces/${conversationId}.jsonl`, import.meta.url);
    const turns = (await readFile(file, "utf8"))
      .trim()
      .split("\n")
      .map((line) => (JSON.parse(line) as { turn: number }).turn);
    await rm(file);
    expect(turns).toEqual(Array.from({ length: 30 }, (_, i) => i));
  });
});

describe("trace de l'état du brief", () => {
  it("chaque mise à jour du brief écrit version, obligatoires suffisants et prêt", async () => {
    const conversation = new ConversationStore().create();
    const tool = briefTools.find((t) => t.definition.name === "note_duration");
    await tool?.run(
      { status: "confirmed", min_nights: 10, max_nights: 10, quote: "10 jours" },
      { conversation, toolUseId: "t", emit: () => {} },
    );
    await flushTraces(conversation.id);
    const file = new URL(`../../data/traces/${conversation.id}.jsonl`, import.meta.url);
    const records = (await readFile(file, "utf8"))
      .trim()
      .split("\n")
      .map(
        (line) =>
          JSON.parse(line) as {
            kind: string;
            version?: number;
            mandatoryOk?: number;
            ready?: boolean;
          },
      );
    await rm(file);
    expect(records).toContainEqual(
      expect.objectContaining({ kind: "brief_state", version: 1, mandatoryOk: 1, ready: false }),
    );
  });
});

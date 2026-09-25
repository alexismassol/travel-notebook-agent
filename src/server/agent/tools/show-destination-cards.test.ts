import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { ServerEvent } from "../../../shared/events";
import { ConversationStore } from "../../conversation";
import {
  showDestinationCardsTool,
  ungroundedCards,
  webSearchQueries,
} from "./show-destination-cards";

const card = {
  name: "Zanzibar",
  country: "Tanzanie",
  summary: "Archipel de l'océan Indien.",
  whyHere: "Plages et vieille ville.",
  whenToGo: "Saison sèche de juin à octobre.",
  forThisProfile: "Idéal pour se projeter.",
  watchOut: null,
};

function searched(query: string): Anthropic.MessageParam {
  return {
    role: "assistant" as const,
    content: [
      { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query } },
      { type: "text", text: "..." },
    ],
  } as Anthropic.MessageParam;
}

describe("une fiche ne décrit pas une saison sans recherche web", () => {
  it("extrait les requêtes de recherche de l'historique", () => {
    const conversation = new ConversationStore().create();
    conversation.messages.push(searched("Zanzibar météo septembre"));
    expect(webSearchQueries(conversation)).toEqual(["Zanzibar météo septembre"]);
  });

  it("une fiche est ancrée si une requête cite le lieu ou le pays, accents et casse ignorés", () => {
    expect(ungroundedCards([card], [])).toEqual(["Zanzibar"]);
    expect(ungroundedCards([card], ["zanzibar saison"])).toEqual([]);
    expect(ungroundedCards([card], ["Tanzanie climat septembre"])).toEqual([]);
    expect(
      ungroundedCards([{ ...card, name: "Hội An", country: "Vietnam" }], ["hoi an pluies"]),
    ).toEqual([]);
    expect(ungroundedCards([card], ["Maldives mousson"])).toEqual(["Zanzibar"]);
  });

  it("un nom composé est ancré si un de ses mots significatifs est dans la requête (cas réel : fiches Canaries refusées)", () => {
    const canaries = { ...card, name: "Îles Canaries", country: "Espagne" };
    const grande = { ...card, name: "Grande Canarie", country: "Espagne" };
    expect(ungroundedCards([canaries, grande], ["Canaries climat février soleil"])).toEqual([]);
  });

  it("un mot générique seul (îles, grande, saint) n'ancre pas une fiche", () => {
    const maurice = { ...card, name: "Île Maurice", country: "Maurice" };
    expect(ungroundedCards([maurice], ["îles grecques en février"])).toEqual(["Île Maurice"]);
  });

  it("sans recherche, l'outil refuse et n'affiche rien", async () => {
    const conversation = new ConversationStore().create();
    const events: ServerEvent[] = [];
    const outcome = await showDestinationCardsTool.run(
      { cards: [card] },
      { conversation, toolUseId: "toolu_cards", emit: (e) => events.push(e) },
    );
    expect(outcome.kind === "result" && outcome.isError).toBe(true);
    expect(outcome.kind === "result" && outcome.content).toMatch(/web_search/);
    expect(events).toEqual([]);
  });

  it("le refus propose une requête qui cite les lieux refusés (cas réel : recherche générale puis lieux non cherchés)", async () => {
    const conversation = new ConversationStore().create();
    conversation.messages.push(searched("destination soleil février vacances scolaires enfants"));
    const outcome = await showDestinationCardsTool.run(
      {
        cards: [
          { ...card, name: "Ténérife", country: "Espagne" },
          { ...card, name: "Guadeloupe", country: "France" },
        ],
      },
      { conversation, toolUseId: "toolu_cards", emit: () => {} },
    );
    expect(outcome.kind === "result" && outcome.content).toMatch(/« Ténérife Guadeloupe climat /);
  });

  it("affichage partiel : les fiches étayées s'affichent, les autres sont refusées avec la requête à lancer (cas réel : Guadeloupe cherchée, Sri Lanka non)", async () => {
    const conversation = new ConversationStore().create();
    conversation.messages.push(searched("Guadeloupe en février météo"));
    const events: ServerEvent[] = [];
    const outcome = await showDestinationCardsTool.run(
      {
        cards: [
          { ...card, name: "Guadeloupe", country: "France" },
          { ...card, name: "Sri Lanka", country: "Sri Lanka" },
        ],
      },
      { conversation, toolUseId: "toolu_part", emit: (e) => events.push(e) },
    );
    const shown = events.flatMap((e) =>
      e.type === "ui_block" && e.block.kind === "cards" ? e.block.cards.map((c) => c.name) : [],
    );
    expect(shown).toEqual(["Guadeloupe"]);
    expect(outcome.kind === "result" && outcome.isError).toBeFalsy();
    expect(outcome.kind === "result" && outcome.content).toMatch(/Sri Lanka/);
    expect(outcome.kind === "result" && outcome.content).toMatch(/« Sri Lanka climat /);
  });
});

describe("entrée réelle abîmée par Haiku (scénario famille)", () => {
  it("liste des fiches envoyée en texte JSON, avec des balises <cite> recopiées de la recherche : la fiche s'affiche, propre", async () => {
    const conversation = new ConversationStore().create();
    conversation.messages.push(searched("Marrakech climat février enfants"));
    const events: ServerEvent[] = [];
    const stringified = JSON.stringify([
      {
        ...card,
        name: "Marrakech",
        country: "Maroc",
        whenToGo:
          '<cite index="6-1,6-2">En février, les températures sont douces</cite>, autour de 20 °C.',
      },
    ]);
    const outcome = await showDestinationCardsTool.run(
      { cards: `\n${stringified}` },
      { conversation, toolUseId: "t", emit: (e) => events.push(e) },
    );
    expect(outcome.kind === "result" && outcome.isError).toBeFalsy();
    const block = events.find((e) => e.type === "ui_block");
    const shown =
      block?.type === "ui_block" && block.block.kind === "cards" ? block.block.cards : [];
    expect(shown.map((c) => c.name)).toEqual(["Marrakech"]);
    expect(shown[0]?.whenToGo).toBe("En février, les températures sont douces, autour de 20 °C.");
  });
});

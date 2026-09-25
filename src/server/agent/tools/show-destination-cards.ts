import { z } from "zod";
import type { DestinationCard } from "../../../shared/events";
import type { Conversation } from "../../conversation";
import { lookupDestination } from "../destination-lookup";
import { nettoyerTexteVisible } from "../text-guard";
import { toInputSchema } from "./schema";
import { type AgentTool, invalidInput } from "./types";

const CardInput = z.object({
  name: z.string().min(1).max(80).describe("Nom du lieu tel qu'on le trouve sur Wikipédia"),
  country: z.string().min(1).max(60),
  summary: z.string().min(3).max(280).describe("Ce qu'est ce lieu, en deux phrases"),
  whyHere: z.string().min(3).max(280).describe("Pourquoi ce lieu correspond aux envies dites"),
  whenToGo: z
    .string()
    .min(3)
    .max(200)
    .describe(
      "Ce que donne la période visée sur place, appuyé sur une recherche de cette conversation",
    ),
  forThisProfile: z.string().min(3).max(200).describe("Pourquoi c'est adapté à ces voyageurs"),
  watchOut: z
    .string()
    .max(200)
    .nullable()
    .describe("Un point d'attention honnête (saison, foule, trajet), ou null"),
});

const ShowCardsInput = z.object({ cards: z.array(CardInput).min(1).max(3) });

const CITE_TAG = /<\/?cite\b[^>]*>/g;

/**
 * Haiku envoie parfois la liste des fiches en TEXTE JSON, avec des balises de citation
 * recopiées des résultats de recherche dans `whenToGo`. Zod refuse, l'agent réessaie à
 * l'identique puis écrit les fiches en texte libre. Le schéma envoyé au modèle ne change pas :
 * on répare seulement l'entrée reçue avant de la vérifier.
 */
export function repairCardsInput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  let cards = (raw as { cards?: unknown }).cards;
  if (typeof cards === "string") {
    try {
      cards = JSON.parse(cards);
    } catch {
      return raw;
    }
  }
  const clean = (value: unknown): unknown =>
    typeof value === "string"
      ? nettoyerTexteVisible(
          value
            .replace(CITE_TAG, "")
            .replace(/\s{2,}/g, " ")
            .trim(),
        )
      : Array.isArray(value)
        ? value.map(clean)
        : value && typeof value === "object"
          ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)]))
          : value;
  return { ...(raw as object), cards: clean(cards) };
}

/**
 * Invariant tenu par le code : une fiche décrit toujours "quand partir", donc une saison.
 * Sans ce contrôle, Haiku peut afficher une fiche Zanzibar ("septembre, saison sèche") sans
 * aucune recherche, malgré la règle du prompt. Une fiche n'est acceptée que si une recherche
 * web de la conversation cite le lieu ou son pays.
 */
export function webSearchQueries(conversation: Conversation): string[] {
  return conversation.messages.flatMap((message) =>
    message.role !== "assistant" || typeof message.content === "string"
      ? []
      : message.content.flatMap((block) =>
          block.type === "server_tool_use" && block.name === "web_search"
            ? [String((block.input as { query?: unknown }).query ?? "")]
            : [],
        ),
  );
}

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** Mots trop génériques pour ancrer un lieu à eux seuls. */
const GENERIC_PLACE_WORDS = new Set([
  "ile",
  "iles",
  "grande",
  "grand",
  "petite",
  "petit",
  "saint",
  "sainte",
  "cote",
  "vallee",
  "mont",
  "lac",
  "parc",
  "national",
  "ville",
  "region",
  "nord",
  "sud",
  "est",
  "ouest",
  "island",
  "islands",
  "city",
  "coast",
]);

/** Mots significatifs d'un nom de lieu : 4 lettres ou plus, hors mots génériques. */
function placeWords(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !GENERIC_PLACE_WORDS.has(word));
}

/**
 * Une fiche est ancrée si un mot significatif du lieu ou du pays apparaît dans une requête.
 * Comparer le NOM ENTIER (« Îles Canaries ») à la requête (« Canaries climat février »)
 * refuse à tort des fiches pourtant bien étayées par une recherche. « Grande Canarie » est
 * ancrée par pluriel, pour que « Grande Canarie » soit ancrée par « Canaries ».
 */
export function ungroundedCards(
  cards: { name: string; country: string }[],
  queries: string[],
): string[] {
  const searched = queries.map(normalize);
  return cards
    .filter((card) => {
      // Nom court sans mot significatif (« Hội An ») : on garde le nom entier comme terme.
      const nameWords = placeWords(card.name);
      const words = [
        ...(nameWords.length > 0 ? nameWords : [normalize(card.name)]),
        ...placeWords(card.country),
      ].filter(Boolean);
      return !searched.some((query) => words.some((word) => query.includes(word)));
    })
    .map((card) => card.name);
}

/** Période du brief pour la requête suggérée (« février 2027 »), ou « à la période visée ». */
function periodHint(conversation: Conversation): string {
  return conversation.brief.mandatory.dates.value?.label ?? "à la période visée";
}

export const showDestinationCardsTool: AgentTool = {
  definition: {
    name: "show_destination_cards",
    description:
      "Affiche 1 à 3 fiches destination dans la conversation, avec photo et carte ajoutées par le " +
      "serveur. À utiliser pour recommander des destinations quand la destination est ouverte, ou " +
      "pour aider le voyageur à se projeter sur un lieu. Refusé par le serveur si aucune recherche " +
      "web de la conversation ne nomme ce lieu ou son pays : cherche d'abord avec les noms des lieux. Après " +
      "l'affichage, ne répète pas le contenu des fiches.",
    input_schema: toInputSchema(ShowCardsInput),
  },
  activityLabel: (input) => {
    // Entrée brute du modèle, pas encore validée : `cards` a déjà été reçu en texte (Haiku).
    const cards = (input as { cards?: unknown })?.cards;
    const names = Array.isArray(cards)
      ? cards.flatMap((c) => (typeof c?.name === "string" ? [c.name] : []))
      : [];
    return names.length > 0
      ? `Préparation des fiches : ${names.join(", ")}`
      : "Préparation des fiches";
  },
  async run(input, { conversation, emit, toolUseId }) {
    const parsed = ShowCardsInput.safeParse(repairCardsInput(input));
    if (!parsed.success) return invalidInput(parsed.error.issues);

    const ungrounded = ungroundedCards(parsed.data.cards, webSearchQueries(conversation));
    const grounded = parsed.data.cards.filter((card) => !ungrounded.includes(card.name));
    // Mesuré (3 passages famille) : après une recherche générale, le modèle abandonnait les
    // fiches au lieu de chercher les lieux. Le refus donne la requête à lancer.
    const retry =
      ungrounded.length > 0
        ? `Non affichées faute de recherche web : ${ungrounded.join(", ")}. Pour les montrer, lance web_search avec la requête « ${ungrounded.join(" ")} climat ${periodHint(conversation)} », puis rappelle show_destination_cards avec seulement ces lieux.`
        : "";
    if (grounded.length === 0) {
      return { kind: "result", isError: true, content: `Fiche refusée. ${retry}` };
    }

    // Affichage partiel : sans lui, un refus « tout ou rien » masquerait aussi les fiches déjà
    // étayées par une recherche.
    const cards: DestinationCard[] = await Promise.all(
      grounded.map(async (card) => {
        const found = await lookupDestination(card.name, card.country);
        return {
          ...card,
          imageUrl: found.imageUrl,
          coordinates: found.coordinates,
          pageUrl: found.pageUrl,
        };
      }),
    );
    emit({ type: "ui_block", block: { kind: "cards", toolUseId, cards } });

    const status = cards
      .map((c) => `${c.name} (${c.imageUrl ? "avec photo" : "sans photo"})`)
      .join(", ");
    return {
      kind: "result",
      content:
        `Fiches affichées au voyageur : ${status}. Il les voit : ne répète pas leur contenu. ${retry} Termine par au plus une question.`.replace(
          /\s+/g,
          " ",
        ),
    };
  },
};

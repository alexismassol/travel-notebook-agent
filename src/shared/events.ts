import type { Completeness, TravelBrief } from "./brief";

/**
 * Contrat entre le serveur et l'interface.
 *
 * Un tour = une requête POST dont la réponse est un flux SSE d'événements `ServerEvent`.
 * Les outils de rendu de l'agent deviennent des `UiBlock` : c'est ici que se décide
 * l'interaction agent / interface.
 */

export interface ChoiceOption {
  label: string;
  description?: string;
}

export interface ChoiceBlock {
  kind: "choice";
  toolUseId: string;
  question: string;
  options: ChoiceOption[];
  multiSelect: boolean;
  allowFreeText: boolean;
}

export interface DestinationCard {
  name: string;
  country: string;
  summary: string;
  whyHere: string;
  whenToGo: string;
  forThisProfile: string;
  watchOut: string | null;
  /** Résolus par le serveur (Wikipédia), jamais écrits par le modèle. */
  imageUrl: string | null;
  coordinates: { lat: number; lon: number } | null;
  pageUrl: string | null;
}

export interface CardsBlock {
  kind: "cards";
  toolUseId: string;
  cards: DestinationCard[];
}

export interface BriefSummaryBlock {
  kind: "brief_summary";
  toolUseId: string;
  message: string;
  brief: TravelBrief;
  completeness: Completeness;
}

export type UiBlock = ChoiceBlock | CardsBlock | BriefSummaryBlock;

export interface Source {
  url: string;
  title: string;
}

export interface TurnUsage {
  model: string;
  apiCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  webSearches: number;
  /** Délai entre la réception du message et le premier mot envoyé au voyageur. */
  firstTextMs: number | null;
  durationMs: number;
}

/** Ce que l'interface attend du voyageur à la fin du tour. */
export type Awaiting = "text" | "choice" | "brief_confirmation" | "done";

export type ServerEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_activity"; tool: string; label: string }
  | { type: "sources"; sources: Source[] }
  | { type: "brief_updated"; brief: TravelBrief; completeness: Completeness }
  | {
      type: "playbook_loaded";
      name: string;
      label: string;
      reason: string;
      origin: "spontaneous" | "nudged";
      turn: number;
    }
  | { type: "ui_block"; block: UiBlock }
  /** `expiresAt` et `turnsRemaining` viennent du serveur : le navigateur ne les recalcule pas. */
  | {
      type: "turn_end";
      awaiting: Awaiting;
      usage: TurnUsage;
      expiresAt: string;
      turnsRemaining: number;
    }
  // `retry` décide du bouton « Réessayer » ; `cause` n'est lue que dans le panneau technique.
  | { type: "error"; message: string; retry: boolean; cause: string };

import type { Completeness, TravelBrief } from "./brief";
import type { Contact } from "./contact";

/**
 * Routes HTTP :
 * - POST /api/conversations                 -> CreateConversationResponse
 * - GET  /api/conversations/:id             -> ConversationStatusResponse (404 si oubliée)
 * - POST /api/conversations/:id/turns       body TurnRequest -> flux SSE de ServerEvent
 * - POST /api/conversations/:id/send        body { contact? } -> SendBriefResponse
 */

export type TurnRequest =
  | { kind: "text"; text: string }
  | { kind: "choice"; toolUseId: string; selected: string[]; freeText?: string }
  | {
      kind: "brief_confirmation";
      toolUseId: string;
      decision: "send" | "edit";
      comment?: string;
      /** Donné seulement à la validation : le prénom et l'adresse imprimés sur le carnet. */
      contact?: Contact;
    };

export interface CreateConversationResponse {
  id: string;
  brief: TravelBrief;
  completeness: Completeness;
  /** Date et heure au-delà desquelles le serveur aura oublié cette conversation (ISO). */
  expiresAt: string;
}

/**
 * Ce que le serveur sait encore d'une conversation. Le contenu visible, lui, est gardé par le
 * navigateur : le serveur ne renvoie que ce que le navigateur ne peut pas deviner.
 */
export interface ConversationStatusResponse {
  id: string;
  expiresAt: string;
  turnsRemaining: number;
  sentAt: string | null;
}

export type SendBriefResponse =
  | { ok: true; sentAt: string }
  | { ok: false; error: string; completeness: Completeness };

export const API_ERRORS = {
  notFound: "Cette conversation n'existe plus. Rechargez la page pour en commencer une nouvelle.",
  busy: "Un message est déjà en cours de traitement. Attendez la réponse avant d'écrire.",
  invalid: "Ce message n'a pas pu être envoyé. Réessayez.",
  notReady: "Votre carnet n'est pas encore complet : il manque des informations essentielles.",
  alreadySent: "Ce carnet est déjà prêt. Préparez un autre voyage pour en créer un nouveau.",
  unexpected: "Une erreur est survenue. Réessayez dans un instant.",
  tooLarge: "Votre message est trop long. Raccourcissez-le un peu.",
  contactInvalid: "Vérifiez votre prénom et votre adresse e-mail.",
  tooManyTurns:
    "Cette conversation est très longue. Rechargez la page pour repartir d'un projet neuf, ou téléchargez votre carnet s'il est prêt.",
} as const;

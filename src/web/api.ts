import {
  API_ERRORS,
  type ConversationStatusResponse,
  type CreateConversationResponse,
  type SendBriefResponse,
  type TurnRequest,
} from "../shared/api";
import type { Contact } from "../shared/contact";
import type { ServerEvent } from "../shared/events";

/**
 * Client HTTP/SSE de l'interface. Aucune dépendance ajoutée : `fetch` natif + un `ReadableStream`
 * lu à la main pour le flux `text/event-stream`.
 */

export class ApiError extends Error {
  /** Statut HTTP, quand il y en a un : 404 veut dire que rien ne sert de réessayer. */
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.status = status;
  }
}

async function readErrorMessage(res: Response): Promise<string | null> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
      return body.error;
    }
  } catch {
    // Corps non-JSON ou vide : on retombe sur le message générique du statut.
  }
  return null;
}

function fallbackMessage(status: number): string {
  if (status === 404) return API_ERRORS.notFound;
  if (status === 409) return API_ERRORS.busy;
  if (status === 400) return API_ERRORS.invalid;
  return API_ERRORS.unexpected;
}

async function ensureOk(res: Response): Promise<void> {
  if (res.ok) return;
  const bodyMessage = await readErrorMessage(res);
  throw new ApiError(bodyMessage ?? fallbackMessage(res.status), res.status);
}

export async function createConversation(): Promise<CreateConversationResponse> {
  const res = await fetch("/api/conversations", { method: "POST" });
  await ensureOk(res);
  return (await res.json()) as CreateConversationResponse;
}

/**
 * Le serveur a-t-il encore cette conversation, et jusqu'à quand ? Rend null s'il l'a oubliée :
 * six heures d'inactivité, ou un redémarrage. Le fil gardé par le navigateur pourra alors se
 * relire, mais plus se continuer, et il faut le dire au voyageur plutôt que le laisser cliquer.
 */
export async function getConversation(id: string): Promise<ConversationStatusResponse | null> {
  const res = await fetch(`/api/conversations/${id}`);
  if (res.status === 404) return null;
  await ensureOk(res);
  return (await res.json()) as ConversationStatusResponse;
}

export async function sendBrief(
  conversationId: string,
  contact?: Contact,
): Promise<SendBriefResponse> {
  const res = await fetch(`/api/conversations/${conversationId}/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contact }),
  });
  await ensureOk(res);
  return (await res.json()) as SendBriefResponse;
}

function emitFrame(frame: string, onEvent: (event: ServerEvent) => void): void {
  for (const rawLine of frame.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (!line.startsWith("data:")) continue;
    const jsonText = line.slice("data:".length).trim();
    if (jsonText.length === 0) continue;
    onEvent(JSON.parse(jsonText) as ServerEvent);
  }
}

export async function sendTurn(
  conversationId: string,
  request: TurnRequest,
  onEvent: (event: ServerEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`/api/conversations/${conversationId}/turns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  await ensureOk(res);
  if (!res.body) return;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex !== -1) {
      emitFrame(buffer.slice(0, separatorIndex), onEvent);
      buffer = buffer.slice(separatorIndex + 2);
      separatorIndex = buffer.indexOf("\n\n");
    }
  }
  if (buffer.trim().length > 0) {
    emitFrame(buffer, onEvent);
  }
}

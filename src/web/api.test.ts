import { afterEach, describe, expect, it, vi } from "vitest";
import { API_ERRORS } from "../shared/api";
import { ApiError, createConversation, sendBrief, sendTurn } from "./api";

/**
 * Client HTTP de l'interface. Ce que le voyageur voit quand le serveur refuse dépend d'ici :
 * un message lisible, jamais un code ni une trace.
 */
const repondre = (body: string, init: ResponseInit & { type?: string } = {}) =>
  new Response(body, {
    ...init,
    headers: { "content-type": init.type ?? "application/json" },
  });

afterEach(() => vi.unstubAllGlobals());

describe("client HTTP de l'interface", () => {
  it("un refus du serveur remonte le message du serveur, pas le code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        repondre(JSON.stringify({ error: "Un tour est déjà en cours." }), { status: 409 }),
      ),
    );
    await expect(createConversation()).rejects.toThrow("Un tour est déjà en cours.");
  });

  it("un refus sans message donne quand même une phrase lisible", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => repondre("", { status: 409 })),
    );
    await expect(sendBrief("abc")).rejects.toBeInstanceOf(ApiError);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => repondre("", { status: 409 })),
    );
    await expect(sendBrief("abc")).rejects.toThrow(API_ERRORS.busy);
  });

  it("une conversation inconnue et un corps invalide ont chacun leur message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => repondre("<html>oups</html>", { status: 404, type: "text/html" })),
    );
    await expect(sendBrief("inconnue")).rejects.toThrow(API_ERRORS.notFound);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => repondre("", { status: 400 })),
    );
    await expect(sendBrief("abc")).rejects.toThrow(API_ERRORS.invalid);
  });

  it("une panne inattendue ne montre jamais le code brut", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => repondre("", { status: 500 })),
    );
    await expect(sendBrief("abc")).rejects.toThrow(API_ERRORS.unexpected);
  });

  it("le flux d'événements est lu même quand un message arrive coupé en deux", async () => {
    const morceaux = [
      'data: {"type":"text_delta","text":"Bonj',
      'our"}\n\ndata: {"type":"turn_end","awaiting":"text"}\n\n',
    ];
    const flux = new ReadableStream<Uint8Array>({
      start(controller) {
        const encodeur = new TextEncoder();
        for (const m of morceaux) controller.enqueue(encodeur.encode(m));
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(flux, { headers: { "content-type": "text/event-stream" } })),
    );
    const recus: string[] = [];
    await sendTurn("abc", { kind: "text", text: "salut" }, (e) => recus.push(e.type));
    expect(recus).toEqual(["text_delta", "turn_end"]);
  });
});

/**
 * Une conversation que le serveur ne connaît plus ne se rattrape pas : réessayer renverrait la
 * même erreur, pour toujours. L'interface doit pouvoir distinguer ce cas d'une panne passagère.
 */
describe("statut porté par l'erreur", () => {
  it("un 404 se reconnaît sans lire le message", async () => {
    const reponse = new Response(JSON.stringify({ error: "Cette conversation n'existe plus." }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
    global.fetch = (() => Promise.resolve(reponse)) as typeof fetch;
    const erreur = await createConversation().catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ApiError);
    expect((erreur as ApiError).status).toBe(404);
  });
});

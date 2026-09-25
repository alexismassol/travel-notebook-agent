import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { classifyTurnError } from "./turn-error";

/**
 * Un tour qui échoue laisse le voyageur devant un mur. Le message doit lui dire quoi faire, et
 * seulement ce qui est vrai : réessayer tout de suite n'a de sens que si ça peut marcher.
 */
const erreurApi = (status: number, type: string, message = "") =>
  new Anthropic.APIError(status, { type: "error", error: { type, message } }, message, undefined);

describe("classer une panne de tour", () => {
  it("une limite de débit invite à réessayer tout de suite", () => {
    const vu = classifyTurnError(erreurApi(429, "rate_limit_error"));
    expect(vu.retry).toBe(true);
    expect(vu.message).toContain("Réessayez dans un instant");
    expect(vu.cause).toContain("429");
  });

  it("une panne du service invite aussi à réessayer", () => {
    expect(classifyTurnError(erreurApi(529, "overloaded_error")).retry).toBe(true);
  });

  it("un crédit épuisé ne propose pas de réessayer tout de suite", () => {
    const vu = classifyTurnError(erreurApi(400, "invalid_request_error", "credit balance is low"));
    expect(vu.retry).toBe(false);
    expect(vu.message).toContain("indisponible");
    expect(vu.message).not.toContain("instant");
  });

  it("une clé refusée est un problème de service, pas du voyageur", () => {
    const vu = classifyTurnError(erreurApi(401, "authentication_error"));
    expect(vu.retry).toBe(false);
    expect(vu.message).toContain("indisponible");
  });

  it("aucun message montré au voyageur ne répète les mots de l'API", () => {
    const vu = classifyTurnError(erreurApi(400, "invalid_request_error", "credit balance is low"));
    expect(vu.message.toLowerCase()).not.toContain("credit");
    expect(vu.message.toLowerCase()).not.toContain("api");
  });

  it("une erreur inconnue reste réessayable, et sa cause est lisible", () => {
    const vu = classifyTurnError(new Error("socket hang up"));
    expect(vu.retry).toBe(true);
    expect(vu.cause).toContain("Error");
  });
});

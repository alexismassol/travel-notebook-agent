import { describe, expect, it } from "vitest";
import { Contact, contactError } from "./contact";

/**
 * Le prénom et l'adresse s'impriment sur le carnet : une adresse mal saisie y resterait. Le
 * contrôle se fait en code, jamais par le modèle.
 */
describe("contact du voyageur", () => {
  it("garde le prénom et l'adresse, sans espaces ni majuscules parasites", () => {
    const parsed = Contact.parse({ firstName: "  Alexis ", email: "  Alexis@PM.ME  " });
    expect(parsed).toEqual({ firstName: "Alexis", email: "alexis@pm.me" });
  });

  it("refuse une adresse sans arobase, et le dit en français", () => {
    expect(contactError({ firstName: "Alexis", email: "alexis.pm.me" })).toBe(
      "Cette adresse e-mail semble incomplète. Vérifiez-la.",
    );
  });

  it("refuse une adresse sans nom de domaine", () => {
    expect(contactError({ firstName: "Alexis", email: "alexis@" })).not.toBeNull();
  });

  it("refuse un prénom vide, même plein d'espaces", () => {
    expect(contactError({ firstName: "   ", email: "alexis@pm.me" })).toBe(
      "Indiquez votre prénom.",
    );
  });

  it("accepte une adresse avec un sous-domaine et un signe plus", () => {
    expect(contactError({ firstName: "Léa", email: "lea+voyage@mail.exemple.fr" })).toBeNull();
  });
});

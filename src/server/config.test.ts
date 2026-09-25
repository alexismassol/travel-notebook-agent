import { describe, expect, it } from "vitest";
import { apiPort, DEFAULT_API_PORT, loadConfig } from "./config";

/**
 * Le fichier `.env.example` porte des variables vides, prêtes à remplir. Copié tel quel, avec
 * seulement la clé renseignée, il donnait un port à zéro : le système en choisissait un au
 * hasard, et l'interface ne trouvait plus l'API. Les trois commandes du README échouaient.
 */
describe("port de l'API", () => {
  it("une variable vide vaut une variable absente", () => {
    expect(apiPort({ API_PORT: "" })).toBe(DEFAULT_API_PORT);
    expect(apiPort({ API_PORT: "   " })).toBe(DEFAULT_API_PORT);
    expect(apiPort({})).toBe(DEFAULT_API_PORT);
  });

  it("un port donné est respecté", () => {
    expect(apiPort({ API_PORT: "9000" })).toBe(9000);
  });

  it("une valeur qui n'est pas un port se remplace par le port par défaut", () => {
    expect(apiPort({ API_PORT: "abc" })).toBe(DEFAULT_API_PORT);
    expect(apiPort({ API_PORT: "0" })).toBe(DEFAULT_API_PORT);
    expect(apiPort({ API_PORT: "-1" })).toBe(DEFAULT_API_PORT);
  });

  it("le modèle vide retombe aussi sur celui par défaut", () => {
    expect(loadConfig({ ANTHROPIC_MODEL: "" }).model).toBe("claude-haiku-4-5");
  });
});

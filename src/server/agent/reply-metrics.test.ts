import { describe, expect, it } from "vitest";
import { defautsDeTon, replyMetrics } from "./reply-metrics";

/** Phrases tirées des transcriptions réelles (docs/scenarios, essai de robustesse). */
describe("replyMetrics : défauts de ton mesurables sans relecture", () => {
  it("superlatifs publicitaires : « Parfait ! », « Excellent ! », « idéaux »", () => {
    expect(
      replyMetrics("Parfait ! Excellent ! C'est parfait pour votre carnet.").superlatives,
    ).toBe(3);
    expect(
      replyMetrics("Les mois idéaux pour le trek sont octobre et novembre.").superlatives,
    ).toBe(1);
    expect(replyMetrics("Une superbe région, calme en mai.").superlatives).toBe(0);
  });

  it("narration des actions internes : correction, enregistrement, chargement", () => {
    expect(replyMetrics("Laissez-moi corriger cela :").narration).toBe(1);
    expect(replyMetrics("Une dernière correction :").narration).toBe(1);
    expect(replyMetrics("Je vais enregistrer vos informations.").narration).toBe(1);
    // Vu à l'écran : l'agent annonçait le chargement de ses propres instructions, alors que le
    // voyageur voit déjà la pastille qui le dit.
    expect(
      replyMetrics("Charger les instructions spécialisées pour ce type de séjour.").narration,
    ).toBe(1);
    expect(replyMetrics("Je dois d'abord comprendre votre projet.").narration).toBe(1);
    expect(replyMetrics("Je charge les instructions pour les familles.").narration).toBe(1);
    expect(replyMetrics("Juillet, c'est l'été polaire : pas d'aurores visibles.").narration).toBe(
      0,
    );
  });

  it("jargon « brief » dit au voyageur", () => {
    expect(replyMetrics("Parfait ! Votre brief est complet.").jargon).toBe(1);
    expect(replyMetrics("Votre demande est complète.").jargon).toBe(0);
  });

  it("nombre de mots de la réponse", () => {
    expect(replyMetrics("Vous partez à deux, en mai ?").words).toBe(6);
    expect(replyMetrics("").words).toBe(0);
  });

  it("tutoiement : pronoms isolés seulement, pas les mots qui les contiennent", () => {
    expect(replyMetrics("Tu veux partir quand ? Ton budget ?").informal).toBe(2);
    expect(replyMetrics("Vous partez en toute tranquillité, au total.").informal).toBe(0);
  });
});

describe("une seule question par tour, comptée", () => {
  it("compte les points d'interrogation de la réponse", () => {
    expect(replyMetrics("Quand partez-vous ?").questions).toBe(1);
    expect(replyMetrics("Quand partez-vous ? Et combien de temps ?").questions).toBe(2);
    expect(replyMetrics("Le Vietnam en novembre, c'est une bonne période.").questions).toBe(0);
  });
});

/**
 * Un rappel de ton écrit une fois se dilue au fil de la conversation. Le sien, cité, tient
 * mieux : le serveur mesure ce que le voyageur vient de lire et le renvoie au tour suivant.
 */
describe("les défauts de ton renvoyés au modèle", () => {
  it("une bonne réponse ne renvoie rien", () => {
    expect(defautsDeTon("Le Vietnam en novembre, c'est une bonne période.")).toEqual([]);
  });

  it("la narration est nommée", () => {
    expect(defautsDeTon("Laissez-moi enregistrer votre projet.").join(" ")).toMatch(
      /raconté ton travail/,
    );
  });

  it("deux questions dans un message sont nommées", () => {
    expect(defautsDeTon("Vous êtes deux ? Et la durée ?").join(" ")).toMatch(/plusieurs questions/);
  });

  it("le tutoiement et le mot brief aussi", () => {
    const d = defautsDeTon("Ton brief est prêt.").join(" ");
    expect(d).toMatch(/tutoyé/);
    expect(d).toMatch(/« brief »/);
  });

  it("une réponse trop longue est comptée en mots", () => {
    expect(defautsDeTon("mot ".repeat(90)).join(" ")).toMatch(/90 mots/);
  });
});

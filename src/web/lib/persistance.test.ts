import { describe, expect, it } from "vitest";
import { type ConversationState, createInitialState } from "./conversation";
import {
  CLE_STOCKAGE,
  type ConversationSauvee,
  lireDerniere,
  lireTout,
  MAX_CONVERSATIONS_GARDEES,
  oublier,
  sauvegarder,
  titreDe,
} from "./persistance";

/**
 * Le navigateur garde le fil visible pour qu'une actualisation ne perde pas la conversation.
 * Ce stockage est un confort : il ne doit jamais empêcher l'application de démarrer, quoi qu'il
 * contienne et quoi que le navigateur en fasse.
 */
class StockageFactice implements Storage {
  private readonly donnees = new Map<string, string>();
  get length() {
    return this.donnees.size;
  }
  clear() {
    this.donnees.clear();
  }
  getItem(cle: string) {
    return this.donnees.get(cle) ?? null;
  }
  key(index: number) {
    return [...this.donnees.keys()][index] ?? null;
  }
  removeItem(cle: string) {
    this.donnees.delete(cle);
  }
  setItem(cle: string, valeur: string) {
    this.donnees.set(cle, valeur);
  }
}

/** Navigation privée, quota plein, données de site bloquées : l'accès lève. */
const stockageQuiLeve = (): Storage =>
  new Proxy(new StockageFactice(), {
    get() {
      throw new Error("accès refusé");
    },
  });

function entree(id: string, texte = "Je veux partir au Japon"): ConversationSauvee {
  const etat = createInitialState();
  etat.timeline = [{ type: "user", id: "id-1", text: texte }];
  return {
    id,
    expiresAt: "2026-09-21T04:00:00.000Z",
    savedAt: "2026-09-20T22:00:00.000Z",
    titre: titreDe(etat),
    confirmations: {},
    etat,
  };
}

describe("garder la conversation dans le navigateur", () => {
  it("ce qui est sauvegardé se relit à l'identique", () => {
    const stockage = new StockageFactice();
    sauvegarder(entree("abc"), stockage);
    const relu = lireDerniere(stockage);
    expect(relu?.id).toBe("abc");
    expect(relu?.etat.timeline).toEqual([
      { type: "user", id: "id-1", text: "Je veux partir au Japon" },
    ]);
    expect(relu?.expiresAt).toBe("2026-09-21T04:00:00.000Z");
  });

  it("le titre vient du premier message tant que le carnet ne dit rien", () => {
    const etat = createInitialState();
    etat.timeline = [
      { type: "agent", id: "id-1", parts: [] },
      { type: "user", id: "id-2", text: "Trois jours en famille, quelque part au soleil" },
    ];
    expect(titreDe(etat)).toBe("Trois jours en famille, quelque part au soleil");
    expect(titreDe(createInitialState())).toBe("Nouvelle conversation");
  });

  it("la plus récente se lit en premier, et réécrire une conversation la remonte", () => {
    const stockage = new StockageFactice();
    sauvegarder(entree("un"), stockage);
    sauvegarder(entree("deux"), stockage);
    sauvegarder(entree("un", "message suivant"), stockage);
    expect(lireTout(stockage).map((c) => c.id)).toEqual(["un", "deux"]);
    expect(lireDerniere(stockage)?.id).toBe("un");
  });

  it("au-delà du nombre gardé, la plus ancienne est oubliée", () => {
    const stockage = new StockageFactice();
    for (let i = 0; i <= MAX_CONVERSATIONS_GARDEES; i += 1) {
      sauvegarder(entree(`c${i}`), stockage);
    }
    const gardees = lireTout(stockage);
    expect(gardees).toHaveLength(MAX_CONVERSATIONS_GARDEES);
    expect(gardees.map((c) => c.id)).not.toContain("c0");
  });

  it("oublier une conversation la retire sans toucher aux autres", () => {
    const stockage = new StockageFactice();
    sauvegarder(entree("un"), stockage);
    sauvegarder(entree("deux"), stockage);
    oublier("un", stockage);
    expect(lireTout(stockage).map((c) => c.id)).toEqual(["deux"]);
  });
});

/**
 * Le titre sert à reconnaître une conversation dans la liste. Le carnet sait déjà de quoi elle
 * parle, et il est plus parlant que la première phrase, souvent « bonjour » ou « je ne sais pas ».
 */
describe("le titre suit le carnet", () => {
  const avecCarnet = (remplir: (etat: ConversationState) => void): ConversationState => {
    const etat = createInitialState();
    etat.timeline = [{ type: "user", id: "id-1", text: "bonjour" }];
    remplir(etat);
    return etat;
  };

  it("le lieu prend la place du message dès qu'il est connu", () => {
    const etat = avecCarnet((e) => {
      e.brief.mandatory.destination.status = "confirmed";
      e.brief.mandatory.destination.value = {
        mode: "fixed",
        places: ["Martinique"],
        zone: "Caraïbes",
        criteria: [],
      };
    });
    expect(titreDe(etat)).toBe("Martinique");
  });

  it("le lieu et la période se lisent ensemble", () => {
    const etat = avecCarnet((e) => {
      e.brief.mandatory.destination.value = {
        mode: "fixed",
        places: ["Martinique"],
        zone: null,
        criteria: [],
      };
      e.brief.mandatory.dates.value = {
        earliest: "2026-10-25",
        latest: "2026-10-28",
        label: "fin octobre",
      };
    });
    expect(titreDe(etat)).toBe("Martinique, fin octobre");
  });

  it("sans période, le groupe complète le lieu", () => {
    const etat = avecCarnet((e) => {
      e.brief.mandatory.destination.value = {
        mode: "shortlist",
        places: ["Japon", "Corée du Sud"],
        zone: null,
        criteria: [],
      };
      e.brief.mandatory.travellers.value = {
        total: { min: 2, max: 2 },
        adults: 2,
        children: [],
        label: "2 adultes",
      };
    });
    expect(titreDe(etat)).toBe("Japon ou Corée du Sud, 2 adultes");
  });

  it("sans lieu, les envies disent déjà quelque chose", () => {
    const etat = avecCarnet((e) => {
      e.brief.useful.interests.value = ["musées", "plage"];
    });
    expect(titreDe(etat)).toBe("musées, plage");
  });

  it("un titre trop long est coupé, jamais tronqué au milieu d'un mot invisible", () => {
    const etat = avecCarnet((e) => {
      e.brief.mandatory.dates.value = {
        earliest: "2026-10-25",
        latest: "2026-10-28",
        label:
          "une période vraiment très longue à écrire, qui dépasse franchement la place disponible dans la liste",
      };
    });
    expect(titreDe(etat).length).toBeLessThanOrEqual(80);
    expect(titreDe(etat).endsWith("…")).toBe(true);
  });
});

describe("le stockage ne casse jamais le démarrage", () => {
  it("une donnée illisible est traitée comme absente, et la clé est purgée", () => {
    const stockage = new StockageFactice();
    stockage.setItem(CLE_STOCKAGE, "{ceci n'est pas du JSON");
    expect(lireTout(stockage)).toEqual([]);
    expect(stockage.getItem(CLE_STOCKAGE)).toBeNull();
  });

  it("une forme inattendue est traitée comme absente", () => {
    const stockage = new StockageFactice();
    stockage.setItem(CLE_STOCKAGE, JSON.stringify({ version: 99, conversations: [] }));
    expect(lireTout(stockage)).toEqual([]);
  });

  it("une conversation sans état exploitable est écartée, les autres restent", () => {
    const stockage = new StockageFactice();
    sauvegarder(entree("bonne"), stockage);
    const brut = JSON.parse(stockage.getItem(CLE_STOCKAGE) ?? "{}") as {
      conversations: unknown[];
    };
    brut.conversations.push({ id: "cassee", expiresAt: "x", savedAt: "y", titre: "z" });
    stockage.setItem(CLE_STOCKAGE, JSON.stringify(brut));
    expect(lireTout(stockage).map((c) => c.id)).toEqual(["bonne"]);
  });

  it("un stockage qui refuse la lecture rend une liste vide", () => {
    expect(lireTout(stockageQuiLeve())).toEqual([]);
    expect(lireDerniere(stockageQuiLeve())).toBeNull();
  });

  it("un stockage qui refuse l'écriture répond non, sans lever", () => {
    expect(sauvegarder(entree("abc"), stockageQuiLeve())).toBe(false);
  });

  it("sans stockage du tout, tout répond comme s'il était vide", () => {
    expect(lireTout(null)).toEqual([]);
    expect(sauvegarder(entree("abc"), null)).toBe(false);
    expect(() => oublier("abc", null)).not.toThrow();
  });
});

/**
 * Un carnet incomplet dans le stockage rendait une page blanche : l'interface lit chaque
 * emplacement sans se demander s'il existe. Il est donc validé par son vrai schéma.
 */
describe("un carnet abîmé ne sort jamais du stockage", () => {
  it("une conversation dont le carnet n'a pas la bonne forme est écartée", () => {
    const stockage = new StockageFactice();
    sauvegarder(entree("bonne"), stockage);
    const brut = JSON.parse(stockage.getItem(CLE_STOCKAGE) ?? "{}") as {
      conversations: { id: string; etat: { brief: unknown } }[];
    };
    const abimee = structuredClone(brut.conversations[0]) as {
      id: string;
      etat: { brief: unknown };
    };
    abimee.id = "abimee";
    abimee.etat.brief = { mandatory: {}, useful: {} };
    brut.conversations.push(abimee);
    stockage.setItem(CLE_STOCKAGE, JSON.stringify(brut));
    expect(lireTout(stockage).map((c) => c.id)).toEqual(["bonne"]);
  });
});

describe("entrée abîmée", () => {
  it("écarte la conversation dont une bulle a perdu son texte, garde les autres", () => {
    const stockage = new StockageFactice();
    sauvegarder(entree("garde-moi"), stockage);
    const abimee = entree("oublie-moi");
    abimee.etat.timeline = [{ type: "user", id: "id-1" } as never];
    sauvegarder(abimee, stockage);
    expect(lireTout(stockage).map((c) => c.id)).toEqual(["garde-moi"]);
  });
});

describe("contact gardé avec la conversation", () => {
  it("se relit après un rechargement, pour le carnet", () => {
    const stockage = new StockageFactice();
    const gardee = entree("avec-contact");
    gardee.contact = { firstName: "Camille", email: "camille@exemple.fr" };
    sauvegarder(gardee, stockage);
    expect(lireDerniere(stockage)?.contact).toEqual({
      firstName: "Camille",
      email: "camille@exemple.fr",
    });
  });
});

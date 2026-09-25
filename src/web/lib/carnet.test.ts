import { describe, expect, it } from "vitest";
import { type Completeness, emptyBrief, type TravelBrief } from "../../shared/brief";
import { buildCarnet, nomFichierCarnet } from "./carnet";

/**
 * Le carnet emporté par le voyageur doit lui rendre ce qu'il a dit, pas seulement des cases
 * remplies. Et il doit dire franchement ce qui manque, au lieu d'afficher des tirets.
 */
const carnet = (change: (b: TravelBrief) => void): TravelBrief => {
  const b = emptyBrief();
  b.version = 3;
  change(b);
  return b;
};

const LE_JOUR = new Date("2026-09-18T12:00:00Z");
const complet: Completeness = { ready: true, mandatoryOk: 4, missing: [] };
const vide: Completeness = {
  ready: false,
  mandatoryOk: 0,
  missing: [
    { field: "destination", reason: "pas encore évoqué" },
    { field: "dates", reason: "pas encore évoqué" },
    { field: "duration", reason: "pas encore évoqué" },
    { field: "travellers", reason: "pas encore évoqué" },
  ],
};

describe("carnet à emporter", () => {
  it("chaque information porte la phrase du voyageur, pas seulement la valeur", () => {
    const c = buildCarnet(
      carnet((b) => {
        b.mandatory.destination = {
          status: "confirmed",
          value: { mode: "fixed", places: ["Espagne"], zone: null, criteria: [] },
          alternatives: [],
          evidence: [{ quote: "je veux aller en Espagne", turn: 1 }],
        };
      }),
      complet,
      LE_JOUR,
    );
    const destination = c.sections[0]?.lignes.find((l) => l.label === "Destination");
    expect(destination?.valeur).toContain("Espagne");
    expect(destination?.citation).toBe("je veux aller en Espagne");
  });

  it("une information incertaine garde sa mention", () => {
    const c = buildCarnet(
      carnet((b) => {
        b.mandatory.dates = {
          status: "vague",
          value: { earliest: "2027-01-01", latest: "2027-01-31", label: "janvier" },
          alternatives: [],
          evidence: [{ quote: "en janvier", turn: 1 }],
        };
      }),
      complet,
      LE_JOUR,
    );
    expect(c.sections[0]?.lignes.find((l) => l.label === "Dates")?.mention).toBe("à préciser");
  });

  it("ce qui manque est écrit, avec la raison, au lieu d'un tiret", () => {
    const c = buildCarnet(
      carnet(() => {}),
      vide,
      LE_JOUR,
    );
    const reste = c.sections.find((s) => s.titre === "Ce qui reste à préciser");
    expect(reste).toBeDefined();
    expect(reste?.lignes.some((l) => l.valeur === "pas encore évoqué")).toBe(true);
    // Les informations utiles non dites n'y figurent pas : elles ne bloquent rien.
    expect(reste?.lignes.map((l) => l.label)).not.toContain("Envies");
  });

  it("la section « vos préférences » disparaît quand rien n'est connu", () => {
    const c = buildCarnet(
      carnet(() => {}),
      vide,
      LE_JOUR,
    );
    expect(c.sections.some((s) => s.titre === "Vos préférences")).toBe(false);
  });

  it("les mots du voyageur sont repris tels quels", () => {
    const c = buildCarnet(
      carnet((b) => {
        b.nuances = [{ quote: "je ne parle pas espagnol", turn: 2 }];
      }),
      complet,
      LE_JOUR,
    );
    expect(c.mots).toEqual(["je ne parle pas espagnol"]);
  });

  it("la date est écrite en toutes lettres, pas en chiffres", () => {
    expect(
      buildCarnet(
        carnet(() => {}),
        vide,
        LE_JOUR,
      ).date,
    ).toContain("18 septembre 2026");
  });
});

describe("nom du fichier téléchargé", () => {
  const vietnam = carnet((b) => {
    b.mandatory.destination = {
      status: "confirmed",
      value: { mode: "fixed", places: ["Vietnam"], zone: null, criteria: [] },
      alternatives: [],
      evidence: [{ quote: "Vietnam, 3 semaines en novembre", turn: 1 }],
    };
  });

  it("porte la destination et le jour, pour ne pas écraser un carnet précédent", () => {
    expect(nomFichierCarnet(vietnam, LE_JOUR)).toBe("carnet-vietnam-2026-09-18.pdf");
  });

  it("se passe des accents, des espaces et de la ponctuation", () => {
    const sainteLucie = carnet((b) => {
      b.mandatory.destination = {
        status: "confirmed",
        value: { mode: "fixed", places: ["Sainte-Lucie (Caraïbes)"], zone: null, criteria: [] },
        alternatives: [],
        evidence: [{ quote: "sainte Lucie", turn: 1 }],
      };
    });
    expect(nomFichierCarnet(sainteLucie, LE_JOUR)).toBe(
      "carnet-sainte-lucie-caraibes-2026-09-18.pdf",
    );
  });

  it("reste un nom valable quand la destination n'est pas encore connue", () => {
    expect(nomFichierCarnet(emptyBrief(), LE_JOUR)).toBe("carnet-de-voyage-2026-09-18.pdf");
  });
});

describe("contact sur le carnet", () => {
  const brief = carnet((b) => {
    b.mandatory.destination = {
      status: "confirmed",
      value: { mode: "fixed", places: ["Vietnam"], zone: "Vietnam", criteria: [] },
      alternatives: [],
      evidence: [{ quote: "Vietnam", turn: 1 }],
    };
  });

  it("porte le prénom et l'adresse du voyageur en tête du carnet", () => {
    const c = buildCarnet(brief, complet, LE_JOUR, {
      firstName: "Alexis",
      email: "alexis@pm.me",
    });
    expect(c.contact).toBe("pour Alexis, alexis@pm.me");
  });

  it("reste muet tant que la demande n'est pas partie", () => {
    expect(buildCarnet(brief, complet, LE_JOUR).contact).toBeNull();
  });
});

/**
 * Cas réel du carnet PDF : la destination « Vietnam » imprimée avec « vous avez dit : On aime la
 * cuisine de rue et la baie d'Halong ». Cette dernière phrase avait complété les envies liées à la
 * destination ; elle ne dit pas « Vietnam ». Le carnet doit citer la phrase qui parle de ce qu'il
 * affiche.
 */
describe("la citation imprimée parle de la valeur affichée", () => {
  const avecDestination = (evidence: { quote: string; turn: number }[]) =>
    buildCarnet(
      carnet((b) => {
        b.mandatory.destination = {
          status: "confirmed",
          value: { mode: "fixed", places: ["Vietnam"], zone: "Vietnam", criteria: [] },
          alternatives: [],
          evidence,
        };
      }),
      complet,
      LE_JOUR,
    ).sections[0]?.lignes[0];

  it("préfère la phrase la plus récente qui nomme la destination", () => {
    const ligne = avecDestination([
      { quote: "Vietnam, 3 semaines en novembre", turn: 1 },
      { quote: "On aime la cuisine de rue et la baie d'Halong", turn: 2 },
    ]);
    expect(ligne?.citation).toBe("Vietnam, 3 semaines en novembre");
  });

  it("une destination qu'aucune phrase ne nomme s'imprime sans citation", () => {
    // Cas réel, second PDF : la seule phrase notée parlait des envies, pas du Vietnam.
    const ligne = avecDestination([
      { quote: "On aime la cuisine de rue et la baie d'Halong", turn: 1 },
    ]);
    expect(ligne?.citation).toBe("");
  });

  it("la durée garde sa dernière phrase, dite avec d'autres mots que la valeur", () => {
    const c = buildCarnet(
      carnet((b) => {
        b.mandatory.duration = {
          status: "confirmed",
          value: { minNights: 21, maxNights: 21 },
          alternatives: [],
          evidence: [{ quote: "3 semaines", turn: 1 }],
        };
      }),
      complet,
      LE_JOUR,
    );
    const duree = c.sections[0]?.lignes.find((l) => l.label === "Durée");
    expect(duree?.citation).toBe("3 semaines");
  });
});

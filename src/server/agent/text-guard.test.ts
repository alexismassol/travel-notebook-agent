import { describe, expect, it } from "vitest";
import {
  createCoulissesFilter,
  createVisibleTextFilter,
  repairEscapes,
  retirerCoulisses,
  stripForbiddenText,
} from "./text-guard";

function streamThrough(chunks: string[]) {
  const filter = createVisibleTextFilter();
  const shown = chunks.map((c) => filter.push(c)).join("") + filter.flush();
  return { shown, leaked: filter.leaked };
}

describe("filtre du texte visible", () => {
  it("coupe un appel d'outil écrit en texte, même découpé en fragments (cas observé)", () => {
    const { shown, leaked } = streamThrough([
      "Enregistré ! C'est noté.",
      "\n\n<func",
      'tion_calls>\n<invoke name="note_duration">',
      '\n<parameter name="status">confirmed</parameter>',
    ]);
    expect(shown).toBe("Enregistré\u202f! C'est noté.\n\n");
    expect(leaked).toBe(true);
  });

  it("laisse passer un < ordinaire, même en fin de fragment", () => {
    const { shown, leaked } = streamThrough(["Moins de <", "3 h de vol, et 2 < 5."]);
    expect(shown).toBe("Moins de <3 h de vol, et 2 < 5.");
    expect(leaked).toBe(false);
  });

  it("rend le texte retenu en fin d'appel s'il n'est pas devenu une balise", () => {
    const { shown } = streamThrough(["Température <in"]);
    expect(shown).toBe("Température <in");
  });

  it("nettoie le texte stocké dans l'historique", () => {
    expect(stripForbiddenText('Parfait.\n<function_calls><invoke name="x">')).toBe("Parfait.");
    expect(stripForbiddenText("Rien à couper")).toBe("Rien à couper");
  });
});

/**
 * Sur une vraie conversation, le voyageur lit « croisière » dans la question de l'agent.
 * Le modèle écrit l'échappement JSON au milieu d'un mot français.
 */
describe("échappement Unicode écrit en toutes lettres par le modèle", () => {
  it("le mot est réparé dans le texte affiché", () => {
    const filter = createVisibleTextFilter();
    const vu = filter.push("l'histoire ancienne et la croisi\\u00e8re (Égypte)") + filter.flush();
    expect(vu).toBe("l'histoire ancienne et la croisière (Égypte)");
  });

  it("réparé aussi quand l'échappement est coupé en deux fragments", () => {
    const filter = createVisibleTextFilter();
    const vu = filter.push("une croisi\\u0") + filter.push("0e8re en mer") + filter.flush();
    expect(vu).toBe("une croisière en mer");
  });

  it("le texte gardé dans l'historique est réparé lui aussi", () => {
    expect(stripForbiddenText("d\\u00e9part de Paris")).toBe("départ de Paris");
  });

  it("un texte normal n'est pas touché", () => {
    const filter = createVisibleTextFilter();
    expect(filter.push("Février est une bonne période.") + filter.flush()).toBe(
      "Février est une bonne période.",
    );
  });

  it("un échappement de caractère de contrôle n'est pas décodé", () => {
    const filter = createVisibleTextFilter();
    const vu = filter.push("texte\\u0000suite") + filter.flush();
    expect(vu).toBe("texte\\u0000suite");
  });
});

describe("les textes des blocs cliquables passent par la même réparation", () => {
  it("un échappement écrit en toutes lettres dans une question redevient une lettre", () => {
    expect(repairEscapes("Quel type de d\\u00e9paysement vous attire ?")).toBe(
      "Quel type de dépaysement vous attire ?",
    );
  });
});

/**
 * Sur une vraie réponse, le modèle écrit « Excellente choix - la Martinique est parfaite ».
 * Le tiret qui relie deux morceaux de phrase fait « écrit par une machine ». La consigne du
 * prompt ne suffit pas : le modèle la perd au fil de la conversation, donc le texte visible
 * passe par un filtre.
 */
describe("tiret qui relie deux morceaux de phrase", () => {
  const montre = (texte: string) => {
    const filtre = createVisibleTextFilter();
    return filtre.push(texte) + filtre.flush();
  };

  it("le cas signalé devient une virgule", () => {
    expect(montre("Excellent choix — la Martinique est parfaite.")).toBe(
      "Excellent choix, la Martinique est parfaite.",
    );
  });

  it("le tiret court entouré d'espaces aussi", () => {
    expect(montre("Deux options - la côte ou l'intérieur.")).toBe(
      "Deux options, la côte ou l'intérieur.",
    );
  });

  it("après une ponctuation, le tiret disparaît sans en ajouter une deuxième", () => {
    expect(montre("Parfait ! — je note la Martinique.")).toBe(
      "Parfait\u202f! je note la Martinique.",
    );
  });

  it("un mot composé garde son tiret", () => {
    expect(montre("Un week-end hors-saison à Saint-Denis.")).toBe(
      "Un week-end hors-saison à Saint-Denis.",
    );
  });

  it("une liste à puces garde ses tirets", () => {
    expect(montre("Trois idées :\n- la côte\n- la montagne\n- les îles")).toBe(
      "Trois idées\u202f:\n- la côte\n- la montagne\n- les îles",
    );
  });

  it("un intervalle de chiffres n'est pas touché", () => {
    expect(montre("Comptez 10-15 jours, soit 8–10 nuits.")).toBe(
      "Comptez 10-15 jours, soit 8–10 nuits.",
    );
  });

  it("le tiret coupé en deux fragments est corrigé quand même", () => {
    const filtre = createVisibleTextFilter();
    const vu = filtre.push("Excellent choix ") + filtre.push("— la Martinique") + filtre.flush();
    expect(vu).toBe("Excellent choix, la Martinique");
  });

  it("le tiret collé aux mots est corrigé lui aussi", () => {
    expect(montre("La Martinique—une île douce.")).toBe("La Martinique, une île douce.");
  });

  it("le texte gardé dans l'historique est corrigé, pour ne pas réapprendre le tic au modèle", () => {
    expect(stripForbiddenText("Bonne période — partez en juin.")).toBe(
      "Bonne période, partez en juin.",
    );
  });
});

/**
 * Juste après la mise en place du filtre, la phrase s'affiche sans son « ? », puis la ligne
 * « Mise à jour de votre carnet », puis le « ? » seul, un paragraphe plus bas. Le filtre
 * retient le dernier caractère de chaque fragment au cas où un tiret arriverait derrière.
 * Il ne doit retenir que ce qui peut vraiment en devenir un.
 */
describe("rien ne reste en retard quand la phrase est finie", () => {
  it("la fin de phrase part avec le reste, il ne reste rien à vider", () => {
    const filtre = createVisibleTextFilter();
    expect(filtre.push("Vous êtes flexible sur la période ?")).toBe(
      "Vous êtes flexible sur la période\u202f?",
    );
    expect(filtre.flush()).toBe("");
  });

  it("un fragment ordinaire part en entier", () => {
    const filtre = createVisibleTextFilter();
    expect(filtre.push("Trois jours, c'est court mais faisable.")).toBe(
      "Trois jours, c'est court mais faisable.",
    );
  });

  it("un tiret en tête de fragment est corrigé grâce au caractère déjà montré", () => {
    const filtre = createVisibleTextFilter();
    const vu = filtre.push("Excellent choix") + filtre.push(" — la Martinique") + filtre.flush();
    expect(vu).toBe("Excellent choix, la Martinique");
  });
});

describe("un tiret entre deux nombres n'est pas un tiret de liaison", () => {
  const montre = (texte: string) => {
    const filtre = createVisibleTextFilter();
    return filtre.push(texte) + filtre.flush();
  };

  it("une plage de dates écrite avec des espaces garde son tiret", () => {
    expect(montre("Comptez du 15 - 20 juillet pour votre séjour.")).toBe(
      "Comptez du 15 - 20 juillet pour votre séjour.",
    );
  });

  it("une plage de nuits aussi", () => {
    expect(montre("Prévoyez 10 - 15 nuits sur place.")).toBe("Prévoyez 10 - 15 nuits sur place.");
  });

  it("un tiret entre deux mots reste remplacé", () => {
    expect(montre("Deux options - la côte ou l'intérieur.")).toBe(
      "Deux options, la côte ou l'intérieur.",
    );
  });
});

/**
 * Vu à l'écran : « Parfait, le brief est complet. » « Brief » est notre mot, pas celui du
 * voyageur, et le prompt l'interdit depuis le début. Le code le remplace avant l'affichage.
 */
describe("le mot « brief » ne sort jamais à l'écran", () => {
  const montre = (texte: string) => {
    const filtre = createVisibleTextFilter();
    return filtre.push(texte) + filtre.flush();
  };

  it("le mot est remplacé par « projet », majuscule comprise", () => {
    expect(montre("Parfait, le brief est complet.")).toBe("Parfait, le projet est complet.");
    expect(montre("Brief prêt.")).toBe("Projet prêt.");
    expect(montre("Vos briefs sont prêts.")).toBe("Vos projets sont prêts.");
  });

  it("un mot qui contient brief n'est pas touché", () => {
    expect(montre("Un briefing avec le guide.")).toBe("Un briefing avec le guide.");
  });

  it("le texte gardé dans l'historique est corrigé lui aussi", () => {
    expect(stripForbiddenText("Votre brief est dans votre carnet.")).toBe(
      "Votre projet est dans votre carnet.",
    );
  });
});

/**
 * Vu à l'écran : « Je vous propose <strong>mai</strong> ». Le modèle écrit du HTML, le rendu
 * n'en accepte pas, et la balise s'affichait en toutes lettres au voyageur.
 */
describe("le HTML écrit par le modèle ne s'affiche jamais", () => {
  const montre = (texte: string) => {
    const filtre = createVisibleTextFilter();
    return filtre.push(texte) + filtre.flush();
  };

  it("le gras et l'italique deviennent du markdown", () => {
    expect(montre("Je vous propose <strong>mai</strong>.")).toBe("Je vous propose **mai**.");
    expect(montre("Plutôt <em>hors saison</em>.")).toBe("Plutôt *hors saison*.");
  });

  it("les autres balises disparaissent sans emporter le texte", () => {
    expect(montre("<p>Le Vietnam en novembre.</p>")).toBe("Le Vietnam en novembre.");
    expect(montre('Un <span class="x">mot</span> ordinaire.')).toBe("Un mot ordinaire.");
  });

  it("une balise coupée entre deux fragments est nettoyée quand même", () => {
    const filtre = createVisibleTextFilter();
    const vu = filtre.push("Je propose <str") + filtre.push("ong>mai</strong>.") + filtre.flush();
    expect(vu).toBe("Je propose **mai**.");
  });

  it("un chevron ordinaire passe toujours", () => {
    expect(montre("Moins de 3 h de vol, et 2 < 5.")).toBe("Moins de 3 h de vol, et 2 < 5.");
  });
});

/**
 * Vu à l'écran : « ou vous êtes ouvert à tout » puis « ? » seul sur la ligne suivante. Une
 * espace ordinaire avant une ponctuation double autorise la coupure de ligne.
 */
describe("la ponctuation double ne part jamais seule à la ligne", () => {
  const montre = (texte: string) => {
    const filtre = createVisibleTextFilter();
    return filtre.push(texte) + filtre.flush();
  };

  it("l'espace avant ? ! ; : devient une espace fine insécable", () => {
    expect(montre("Vous êtes ouvert à tout ?")).toBe("Vous êtes ouvert à tout\u202f?");
    expect(montre("Parfait !")).toBe("Parfait\u202f!");
    expect(montre("Deux options : la côte ou la montagne.")).toBe(
      "Deux options\u202f: la côte ou la montagne.",
    );
  });

  it("une ponctuation collée au mot n'est pas touchée", () => {
    expect(montre("Combien de nuits?")).toBe("Combien de nuits?");
  });
});

/**
 * Phrases de coulisses : 19 passages sur 48 de la campagne du 2026-09-25 disaient au voyageur
 * « Je vais noter votre projet et charger les instructions ». Le prompt ne suffit pas : le
 * filtre les retire avant l'écran, et du texte gardé dans l'historique.
 */
describe("filtre des phrases de coulisses", () => {
  const passer = (fragments: string[]) => {
    const filtre = createCoulissesFilter();
    const vu = fragments.map((f) => filtre.push(f)).join("") + filtre.flush();
    return { vu, retirees: filtre.retirees };
  };

  it("retire la phrase de coulisses, même coupée en fragments", () => {
    const { vu, retirees } = passer([
      "Je vais noter votre pro",
      "jet et charger les instructions pour vous surprendre. ",
      "Laquelle de ces trois idées vous tente ?",
    ]);
    expect(vu).toBe("Laquelle de ces trois idées vous tente ?");
    expect(retirees).toBe(1);
  });

  it("garde une phrase qui commence par « Je » sans raconter les coulisses", () => {
    const { vu, retirees } = passer(["Je vous propose trois idées rares. Voici la première."]);
    expect(vu).toBe("Je vous propose trois idées rares. Voici la première.");
    expect(retirees).toBe(0);
  });

  it("garde une question, même si elle commence comme des coulisses", () => {
    const { vu } = passer(["Je note que vous partez à deux, c'est bien ça ?"]);
    expect(vu).toBe("Je note que vous partez à deux, c'est bien ça ?");
  });

  it("laisse passer tout de suite une phrase qui ne commence pas comme des coulisses", () => {
    const filtre = createCoulissesFilter();
    expect(filtre.push("Le Vietnam en novembre, c'est la saison sèche")).toBe(
      "Le Vietnam en novembre, c'est la saison sèche",
    );
  });

  it("garde une phrase qui rapporte un fait du voyageur", () => {
    const phrase = "Je note que vous êtes quatre personnes pour un trek au Népal en avril.";
    expect(passer([phrase]).vu).toBe(phrase);
    expect(retirerCoulisses(phrase)).toBe(phrase);
  });

  it("retire en flux une phrase ouverte par une interjection ou un tiret, comme dans l'historique", () => {
    const mots = (texte: string) => texte.split(/(?<= )/);
    const interjection = passer(mots("Parfait, c'est noté. Pour combien de temps ?"));
    expect(interjection.vu).toBe("Pour combien de temps ?");
    const liste = passer(mots("- Je vais enregistrer votre projet.\nQuelle période vous tente ?"));
    expect(liste.vu).toBe("Quelle période vous tente ?");
  });

  it("montre une phrase en « Je » dès ses premiers mots, sans attendre son point", () => {
    const filtre = createCoulissesFilter();
    const vu = ["Je ", "vous ", "propose ", "trois ", "idées ", "rares ", "pour ", "mars"]
      .map((f) => filtre.push(f))
      .join("");
    expect(vu).toBe("Je vous propose trois idées rares pour mars");
  });

  it("nettoie aussi le texte stocké dans l'historique", () => {
    expect(retirerCoulisses("C'est noté. Le Vietnam en novembre, c'est la saison sèche.")).toBe(
      "Le Vietnam en novembre, c'est la saison sèche.",
    );
  });
});

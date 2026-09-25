import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyBrief, type TravelBrief } from "../../../shared/brief";
import { ConversationStore } from "../../conversation";
import { computeCompleteness } from "../brief/completeness";
import { briefGuidance, briefTools, normalizeDeparture, normalizeZone } from "./brief-tools";

const tool = (name: string) => {
  const found = briefTools.find((t) => t.definition.name === name);
  if (!found) throw new Error(name);
  return found;
};

describe("outils note_*", () => {
  it("normalizeZone : un mot bouchon ne devient jamais une valeur", () => {
    // Le modèle écrit parfois autre chose que le mot réservé. « Zone : inconnu » s'affichait
    // alors au voyageur comme si c'était une destination.
    for (const bouchon of ["inconnu", "non précisé", "à préciser", "non renseigné", "aucune"]) {
      expect(normalizeZone(bouchon)).toBeNull();
      expect(normalizeDeparture(bouchon)).toBeNull();
    }
    expect(normalizeDeparture("Paris")).toBe("Paris");
    expect(normalizeZone("Vietnam")).toBe("Vietnam");
  });

  it("normalizeZone : les valeurs réservées deviennent null, un pays reste", () => {
    expect(normalizeZone("Vietnam")).toBe("Vietnam");
    expect(normalizeZone("plusieurs pays")).toBeNull();
    expect(normalizeZone("À définir")).toBeNull();
    expect(normalizeZone("  ")).toBeNull();
  });

  it("note_destination avec un pays unique rend la destination suffisante", async () => {
    const conversation = new ConversationStore().create();
    const outcome = await tool("note_destination").run(
      {
        status: "confirmed",
        mode: "fixed",
        places: ["Vietnam"],
        zone: "Vietnam",
        criteria: [],
        quote: "Vietnam",
      },
      { conversation, toolUseId: "t", emit: () => {} },
    );
    expect(outcome.kind).toBe("result");
    expect(conversation.brief.mandatory.destination.value?.zone).toBe("Vietnam");
  });

  it("note_travellers : les enfants sans âge restent inconnus, et le rappel famille apparaît", async () => {
    const conversation = new ConversationStore().create();
    const outcome = await tool("note_travellers").run(
      {
        status: "confirmed",
        total_min: 4,
        total_max: 4,
        adults: 2,
        children_count: 2,
        children_ages: [7],
        label: "2 adultes, 2 enfants",
        quote: "avec nos deux enfants, dont un de 7 ans",
      },
      { conversation, toolUseId: "t", emit: () => {} },
    );
    expect(conversation.brief.mandatory.travellers.value?.children).toEqual([
      { age: 7 },
      { age: null },
    ]);
    expect(outcome.kind === "result" && outcome.content).toMatch(/Rappel serveur/);
    expect(conversation.nudgedPlaybooks.has("voyage-en-famille")).toBe(true);
  });

  it("une date invalide est refusée avec un message que le modèle peut corriger", async () => {
    const conversation = new ConversationStore().create();
    const outcome = await tool("note_dates").run(
      {
        status: "vague",
        earliest: "novembre",
        latest: "2026-11-30",
        label: "novembre",
        quote: "novembre",
      },
      { conversation, toolUseId: "t", emit: () => {} },
    );
    expect(outcome.kind === "result" && outcome.isError).toBe(true);
    expect(conversation.brief.version).toBe(0);
  });

  it("les schémas envoyés sont stricts : additionalProperties false, sans contrainte refusée", () => {
    for (const t of briefTools) {
      const schema = JSON.stringify(t.definition.input_schema);
      expect(t.definition.strict).toBe(true);
      expect(schema).toContain('"additionalProperties":false');
      expect(schema).not.toMatch(
        /"(minLength|maxLength|minimum|maximum|pattern|minItems|maxItems)"/,
      );
    }
  });
});

describe("note_travellers : un « confirmé » doit venir des mots du voyageur", () => {
  const familyInput = {
    status: "confirmed",
    total_min: 4,
    total_max: 4,
    adults: 2,
    children_count: 2,
    children_ages: [4, 7],
    label: "2 adultes et 2 enfants (4 et 7 ans)",
    quote: "Les enfants ont 4 et 7 ans",
  };
  const withTravellerMessage = (text: string) => {
    const conversation = new ConversationStore().create();
    conversation.turn = 1;
    conversation.messages.push({
      role: "user",
      content: [
        { type: "text", text },
        { type: "text", text: "<contexte_serveur>\n2 adultes\n</contexte_serveur>" },
      ],
    });
    return conversation;
  };

  it("cas réel du scénario famille : adultes jamais dits -> enregistré à confirmer", async () => {
    const conversation = withTravellerMessage(
      "Les enfants ont 4 et 7 ans. Plutôt pendant les vacances de février, une dizaine de jours.",
    );
    const outcome = await tool("note_travellers").run(familyInput, {
      conversation,
      toolUseId: "t",
      emit: () => {},
    });
    expect(conversation.brief.mandatory.travellers.status).toBe("inferred");
    expect(outcome.kind === "result" && outcome.content).toMatch(/à confirmer/);
  });

  it("les mots du voyageur le disent -> reste confirmé", async () => {
    const conversation = withTravellerMessage("On part à 4, avec les enfants de 4 et 7 ans.");
    await tool("note_travellers").run(familyInput, {
      conversation,
      toolUseId: "t",
      emit: () => {},
    });
    expect(conversation.brief.mandatory.travellers.status).toBe("confirmed");
  });

  it("déjà « à confirmer » avec la même valeur à un tour précédent -> la validation est acceptée", async () => {
    const conversation = withTravellerMessage("Les enfants ont 4 et 7 ans.");
    const ctx = { conversation, toolUseId: "t", emit: () => {} };
    await tool("note_travellers").run(familyInput, ctx);
    expect(conversation.brief.mandatory.travellers.status).toBe("inferred");
    // Même tour : pas de validation possible.
    await tool("note_travellers").run(familyInput, ctx);
    expect(conversation.brief.mandatory.travellers.status).toBe("inferred");

    conversation.turn = 2;
    conversation.messages.push({ role: "user", content: "Oui, c'est ça." });
    await tool("note_travellers").run({ ...familyInput, quote: "Oui, c'est ça." }, ctx);
    expect(conversation.brief.mandatory.travellers.status).toBe("confirmed");
  });
});

describe("note_preferences : la ville de départ", () => {
  // Sans cette information, « on part de Paris » ne laisse aucune trace dans le brief,
  // alors que c'est lui qui décide du trajet et de son prix.
  const input = (departure_city: string) => ({
    status: "confirmed" as const,
    budget_max_eur: 0,
    budget_per: "unknown" as const,
    budget_status: "vague" as const,
    departure_status: "confirmed" as const,
    style: [],
    interests: [],
    constraints: [],
    nuances: [],
    departure_city,
    quote: "on part de Paris",
  });

  it("« on part de Paris » est enregistré comme ville de départ", async () => {
    const conversation = new ConversationStore().create();
    const outcome = await tool("note_preferences").run(input("Paris"), {
      conversation,
      toolUseId: "t",
      emit: () => {},
    });
    expect(conversation.brief.useful.departure.value).toBe("Paris");
    expect(conversation.brief.useful.departure.status).toBe("confirmed");
    expect(outcome.kind === "result" && outcome.content).toContain("departure");
  });

  it("une ville démesurée est refusée par l'outil, pas seulement à la fusion", async () => {
    const conversation = new ConversationStore().create();
    const outcome = await tool("note_preferences").run(input("Paris".repeat(200)), {
      conversation,
      toolUseId: "t",
      emit: () => {},
    });
    // Le message doit nommer le paramètre de l'outil (`departure_city`), pas le champ du brief :
    // c'est la preuve que le refus vient de l'entrée, avant la fusion.
    expect(outcome.kind === "result" && outcome.isError).toBe(true);
    expect(outcome.kind === "result" && outcome.content).toMatch(/departure_city/);
    expect(conversation.brief.useful.departure.status).toBe("unknown");
  });

  it("la valeur réservée « non dite » ne crée pas de ville de départ", async () => {
    const conversation = new ConversationStore().create();
    await tool("note_preferences").run(input("non dite"), {
      conversation,
      toolUseId: "t",
      emit: () => {},
    });
    expect(conversation.brief.useful.departure.status).toBe("unknown");
    expect(conversation.brief.useful.departure.value).toBeNull();
  });
});

describe("note_preferences : une certitude par information", () => {
  // Sur un appel réel, « je pars de Paris c'est sûr, le budget on verra » enregistre AUSSI le
  // budget en « confirmé », parce que les deux partagent un statut unique. C'est l'invariant 5
  // du projet qui tombe.
  const base = {
    style: [],
    interests: [],
    constraints: [],
    nuances: [],
    quote: "je pars de Paris c'est sûr, le budget on verra, environ 4000 par personne",
  };

  it("départ sûr et budget flou dans la même phrase gardent chacun leur statut", async () => {
    const conversation = new ConversationStore().create();
    await tool("note_preferences").run(
      {
        ...base,
        status: "confirmed",
        departure_city: "Paris",
        departure_status: "confirmed",
        budget_max_eur: 4000,
        budget_per: "person",
        budget_status: "vague",
      },
      { conversation, toolUseId: "t", emit: () => {} },
    );
    expect(conversation.brief.useful.departure.status).toBe("confirmed");
    expect(conversation.brief.useful.budget.status).toBe("vague");
  });

  it("« à trancher » est impossible ici (une seule valeur par appel) : enregistré « à préciser »", async () => {
    const conversation = new ConversationStore().create();
    const outcome = await tool("note_preferences").run(
      {
        ...base,
        status: "vague",
        departure_city: "Paris",
        departure_status: "conflicting",
        budget_max_eur: 0,
        budget_per: "unknown",
        budget_status: "vague",
        quote: "moi je pars de Paris, mon copain de Lyon",
      },
      { conversation, toolUseId: "t", emit: () => {} },
    );
    expect(conversation.brief.useful.departure.status).toBe("vague");
    expect(conversation.brief.useful.departure.value).toBe("Paris");
    expect(outcome.kind === "result" && outcome.content).toMatch(/nuances/);
  });
});

describe("note_duration : un « confirmé » doit venir d'un nombre dit", () => {
  const dizaineInput = {
    status: "confirmed",
    min_nights: 9,
    max_nights: 9,
    quote: "une dizaine de jours",
  };
  const withTravellerMessage = (text: string) => {
    const conversation = new ConversationStore().create();
    conversation.turn = 1;
    conversation.messages.push({ role: "user", content: [{ type: "text", text }] });
    return conversation;
  };

  it("cas réel du scénario famille : « une dizaine de jours » -> enregistré à préciser", async () => {
    const conversation = withTravellerMessage(
      "Les enfants ont 4 et 7 ans. Plutôt pendant les vacances de février, une dizaine de jours, on part de Paris.",
    );
    const outcome = await tool("note_duration").run(dizaineInput, {
      conversation,
      toolUseId: "t",
      emit: () => {},
    });
    expect(conversation.brief.mandatory.duration.status).toBe("vague");
    expect(conversation.brief.mandatory.duration.value).toEqual({ minNights: 9, maxNights: 9 });
    expect(outcome.kind === "result" && outcome.content).toMatch(/à préciser/);
  });

  it("« 10 jours » : le nombre est dit, la durée reste confirmée", async () => {
    const conversation = withTravellerMessage("On part 10 jours en Grèce en juin.");
    await tool("note_duration").run(dizaineInput, {
      conversation,
      toolUseId: "t",
      emit: () => {},
    });
    expect(conversation.brief.mandatory.duration.status).toBe("confirmed");
  });

  it("une durée approximative garde le carnet complet : « vague » ne le bloque pas", async () => {
    const conversation = withTravellerMessage("Une dizaine de jours en février.");
    await tool("note_duration").run(dizaineInput, {
      conversation,
      toolUseId: "t",
      emit: () => {},
    });
    // `missing` contient des objets {field, reason} : comparer à la chaîne « duration » serait
    // toujours vrai, donc toujours vert.
    const missing = computeCompleteness(conversation.brief).missing.map((m) => m.field);
    expect(missing).not.toContain("duration");
  });
});

describe("note_destination : hésitation entre plusieurs lieux", () => {
  it("cas réel (Japon ou Corée du Sud) : un conflit qui répète un lieu déjà listé devient vague", async () => {
    const conversation = new ConversationStore().create();
    const outcome = await tool("note_destination").run(
      {
        status: "conflicting",
        mode: "shortlist",
        places: ["Japon", "Corée du Sud"],
        zone: "plusieurs pays",
        criteria: [],
        alternative_places: ["Corée du Sud"],
        quote: "On hésite entre le Japon et la Corée du Sud",
      },
      { conversation, toolUseId: "t", emit: () => {} },
    );
    const destination = conversation.brief.mandatory.destination;
    expect(destination.status).toBe("vague");
    expect(destination.alternatives).toEqual([]);
    expect(outcome.kind === "result" && outcome.isError).toBeFalsy();
  });
});

describe("note_destination : hésitation écrite avec ou sans accents", () => {
  it("« Coree du Sud » et « Corée du Sud » sont le même lieu", async () => {
    const conversation = new ConversationStore().create();
    await tool("note_destination").run(
      {
        status: "conflicting",
        mode: "shortlist",
        places: ["Japon", "Corée du Sud"],
        zone: "plusieurs pays",
        criteria: [],
        alternative_places: ["Coree du Sud"],
        quote: "On hésite entre le Japon et la Corée du Sud",
      },
      { conversation, toolUseId: "t", emit: () => {} },
    );
    expect(conversation.brief.mandatory.destination.status).toBe("vague");
  });
});

describe("note_destination en conflit", () => {
  it("sans l'autre destination, le conflit est refusé au lieu d'une alternative vide", async () => {
    const conversation = new ConversationStore().create();
    const outcome = await tool("note_destination").run(
      {
        status: "conflicting",
        mode: "fixed",
        places: ["Grèce"],
        zone: "Grèce",
        criteria: [],
        quote: "la Grèce",
      },
      { conversation, toolUseId: "t", emit: () => {} },
    );
    expect(outcome.kind === "result" && outcome.isError).toBe(true);
    expect(conversation.brief.version).toBe(0);
  });
});

describe("question suivante, calculée après l'enregistrement", () => {
  it("voyageurs ramenés à « à confirmer » : le résultat demande de les faire confirmer avec ask_choice", async () => {
    const conversation = new ConversationStore().create();
    conversation.turn = 1;
    conversation.messages.push({ role: "user", content: "Les enfants ont 4 et 7 ans." });
    await tool("note_travellers").run(
      {
        status: "inferred",
        total_min: 4,
        total_max: 4,
        adults: 2,
        children_count: 2,
        children_ages: [4, 7],
        label: "2 adultes et 2 enfants (4 et 7 ans)",
        quote: "Les enfants ont 4 et 7 ans",
      },
      { conversation, toolUseId: "t", emit: () => {} },
    );
    expect(briefGuidance(conversation.brief).join("\n")).toMatch(
      /Question suivante[^\n]*confirmer[^\n]*voyageurs[^\n]*ask_choice/,
    );
  });

  it("hésitation entre deux pays : le résultat propose de trancher avec ask_choice", async () => {
    const conversation = new ConversationStore().create();
    await tool("note_destination").run(
      {
        status: "vague",
        mode: "shortlist",
        places: ["Japon", "Corée du Sud"],
        zone: "plusieurs pays",
        criteria: [],
        quote: "On hésite entre le Japon et la Corée du Sud",
      },
      { conversation, toolUseId: "t", emit: () => {} },
    );
    expect(briefGuidance(conversation.brief).join("\n")).toMatch(
      /Question suivante[^\n]*Japon, Corée du Sud[^\n]*ask_choice/,
    );
  });
});

describe("note_dates : une année non dite ne peut pas tomber dans le passé", () => {
  const juin = (quoteYear = "") => ({
    status: "confirmed",
    earliest: "2026-06-01",
    latest: "2026-06-30",
    label: `juin${quoteYear}`,
    quote: `en juin${quoteYear}`,
  });
  const withMessage = (text: string) => {
    const conversation = new ConversationStore().create();
    conversation.turn = 1;
    conversation.messages.push({ role: "user", content: text });
    return conversation;
  };

  afterEach(() => vi.useRealTimers());

  it("cas réel (Grèce) : « juin » noté 2026 devient juin 2027", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-17T08:00:00Z") });
    const conversation = withMessage("On part 3 semaines en Grèce en juin, on sera 4 adultes.");
    const outcome = await tool("note_dates").run(juin(), {
      conversation,
      toolUseId: "t",
      emit: () => {},
    });
    expect(conversation.brief.mandatory.dates.value).toMatchObject({
      earliest: "2027-06-01",
      latest: "2027-06-30",
    });
    expect(outcome.kind === "result" && outcome.content).toMatch(/2027/);
  });

  it("cas réel (mesure finale) : le libellé « juin 2026 » écrit par le modèle suit l'année décalée", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-17T08:00:00Z") });
    const conversation = withMessage("On part 3 semaines en Grèce en juin, on sera 4 adultes.");
    await tool("note_dates").run(
      { ...juin(), label: "juin 2026", quote: "On part 3 semaines en Grèce en juin" },
      { conversation, toolUseId: "t", emit: () => {} },
    );
    expect(conversation.brief.mandatory.dates.value).toMatchObject({
      earliest: "2027-06-01",
      label: "juin 2027",
    });
  });

  it("un montant en dollars n'est pas une année dite", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-17T08:00:00Z") });
    const conversation = withMessage("On part en Grèce en juin avec un budget de 2027 dollars.");
    await tool("note_dates").run(juin(), { conversation, toolUseId: "t", emit: () => {} });
    expect(conversation.brief.mandatory.dates.value?.earliest).toBe("2027-06-01");
  });

  it("seule l'année entière change dans le libellé", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-17T08:00:00Z") });
    const conversation = withMessage("On part en juin.");
    await tool("note_dates").run(
      { ...juin(), label: "juin 2026, circuit 12026" },
      { conversation, toolUseId: "t", emit: () => {} },
    );
    expect(conversation.brief.mandatory.dates.value?.label).toBe("juin 2027, circuit 12026");
  });

  it("une année dite par le voyageur n'est jamais changée, même passée", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-17T08:00:00Z") });
    const conversation = withMessage("C'était pour juin 2026.");
    await tool("note_dates").run(juin(" 2026"), { conversation, toolUseId: "t", emit: () => {} });
    expect(conversation.brief.mandatory.dates.value?.earliest).toBe("2026-06-01");
  });
});

describe("question suivante : tout ce qui manque encore", () => {
  it("« 4 ou 6 personnes » : le résultat demande de préciser les voyageurs avec ask_choice", async () => {
    const conversation = new ConversationStore().create();
    conversation.turn = 1;
    conversation.messages.push({
      role: "user",
      content:
        "On part à Bali, 10 jours en juin, mais on sera 4 ou 6 personnes, ça dépend des amis.",
    });
    // État réel de la transcription : destination, période et durée déjà notées.
    const b = conversation.brief.mandatory;
    b.destination = {
      status: "confirmed",
      value: { mode: "fixed", places: ["Bali"], zone: "Indonésie", criteria: [] },
      alternatives: [],
      evidence: [{ quote: "On part à Bali", turn: 1 }],
    };
    b.dates = {
      status: "vague",
      value: { earliest: "2099-06-01", latest: "2099-06-30", label: "juin" },
      alternatives: [],
      evidence: [{ quote: "en juin", turn: 1 }],
    };
    b.duration = {
      status: "confirmed",
      value: { minNights: 9, maxNights: 9 },
      alternatives: [],
      evidence: [{ quote: "10 jours", turn: 1 }],
    };
    await tool("note_travellers").run(
      {
        status: "vague",
        total_min: 4,
        total_max: 6,
        adults: 0,
        children_count: 0,
        children_ages: [],
        label: "4 ou 6 personnes",
        quote: "on sera 4 ou 6 personnes",
      },
      { conversation, toolUseId: "t", emit: () => {} },
    );
    expect(briefGuidance(conversation.brief).join("\n")).toMatch(
      /Question suivante[^\n]*voyageurs[^\n]*ask_choice/,
    );
  });
});

describe("question suivante : destination ouverte et période connue", () => {
  it("la consigne demande une recherche qui nomme les lieux avant les fiches", async () => {
    const conversation = new ConversationStore().create();
    conversation.brief.mandatory.destination = {
      status: "vague",
      value: { mode: "open", places: [], zone: null, criteria: ["soleil"] },
      alternatives: [],
      evidence: [{ quote: "du soleil", turn: 1 }],
    };
    await tool("note_dates").run(
      {
        status: "vague",
        earliest: "2099-02-01",
        latest: "2099-02-28",
        label: "vacances de février",
        quote: "pendant les vacances de février",
      },
      { conversation, toolUseId: "t", emit: () => {} },
    );
    expect(briefGuidance(conversation.brief).join("\n")).toMatch(
      /Question suivante[^\n]*une recherche qui nomme ces lieux[^\n]*show_destination_cards/,
    );
  });
});

describe("ce qui rend le carnet utile en plus des quatre essentiels", () => {
  const briefComplet = (): TravelBrief => {
    const b = emptyBrief();
    b.version = 4;
    b.mandatory.destination = {
      status: "confirmed",
      value: { mode: "fixed", places: ["Espagne"], zone: "Espagne", criteria: [] },
      alternatives: [],
      evidence: [{ quote: "en Espagne", turn: 1 }],
    };
    b.mandatory.dates = {
      status: "confirmed",
      value: { earliest: "2027-01-10", latest: "2027-01-20", label: "janvier" },
      alternatives: [],
      evidence: [{ quote: "en janvier", turn: 1 }],
    };
    b.mandatory.duration = {
      status: "confirmed",
      value: { minNights: 6, maxNights: 7 },
      alternatives: [],
      evidence: [{ quote: "une semaine", turn: 2 }],
    };
    b.mandatory.travellers = {
      status: "confirmed",
      value: { total: { min: 1, max: 1 }, adults: 1, children: [], label: "1 adulte" },
      alternatives: [],
      evidence: [{ quote: "je pars seul", turn: 2 }],
    };
    return b;
  };

  it("sans ville de départ ni budget, la consigne présente et signale les deux", () => {
    const consignes = briefGuidance(briefComplet(), 0).join(" ");
    expect(consignes).toMatch(/present_brief maintenant/);
    expect(consignes).toMatch(/ville de départ/i);
    expect(consignes).toMatch(/budget/i);
    // Le voyageur décidé ne doit pas répondre à une question de plus avant de voir son projet.
    expect(consignes).toMatch(/télécharger son carnet sans/i);
  });

  it("au-delà de deux questions, on n'insiste plus et on présente le carnet", () => {
    const consignes = briefGuidance(briefComplet(), 2).join(" ");
    expect(consignes).toMatch(/present_brief/);
    expect(consignes).not.toMatch(/ville de départ/i);
  });

  it("quand le départ et le budget sont connus, on présente le carnet tout de suite", () => {
    const b = briefComplet();
    b.useful.departure = {
      status: "confirmed",
      value: "Orléans",
      alternatives: [],
      evidence: [{ quote: "je pars d'Orléans", turn: 3 }],
    };
    b.useful.budget = {
      status: "vague",
      value: { min: 1500, max: 2000, per: "person", currency: "EUR" },
      alternatives: [],
      evidence: [{ quote: "autour de 1500 euros", turn: 3 }],
    };
    expect(briefGuidance(b, 0).join(" ")).toMatch(/present_brief/);
  });
});

describe("un voyage avec ses parents n'est pas un voyage avec des enfants", () => {
  it("« moi et mes parents » : le carnet passe en « à confirmer » et le rappel famille se tait", async () => {
    const conversation = new ConversationStore().create();
    conversation.messages.push({
      role: "user",
      content: [{ type: "text", text: "moi et mes parents" }],
    });
    const outcome = await tool("note_travellers").run(
      {
        status: "confirmed",
        total_min: 3,
        total_max: 3,
        adults: 2,
        children_count: 1,
        children_ages: [],
        label: "2 adultes et 1 enfant",
        quote: "moi et mes parents",
      },
      { conversation, toolUseId: "t", emit: () => {} },
    );
    expect(conversation.brief.mandatory.travellers.status).toBe("inferred");
    const texte = outcome.kind === "result" ? outcome.content : "";
    expect(texte).toMatch(/aucun enfant n'est nommé/);
    expect(texte).not.toMatch(/playbook voyage-en-famille n'est pas/);
  });

  it("« avec nos deux enfants » : le rappel famille reprend son rôle", async () => {
    const conversation = new ConversationStore().create();
    conversation.messages.push({
      role: "user",
      content: [{ type: "text", text: "on part avec nos deux enfants" }],
    });
    const outcome = await tool("note_travellers").run(
      {
        status: "confirmed",
        total_min: 4,
        total_max: 4,
        adults: 2,
        children_count: 2,
        children_ages: [7, 9],
        label: "2 adultes et 2 enfants",
        quote: "avec nos deux enfants",
      },
      { conversation, toolUseId: "t", emit: () => {} },
    );
    const texte = outcome.kind === "result" ? outcome.content : "";
    expect(texte).toMatch(/playbook voyage-en-famille n'est pas/);
  });
});

/**
 * Un vrai carnet a été validé sans ville de départ. L'agent avait demandé « d'où partez-vous et
 * quel budget ? », le voyageur avait répondu « tout », ce qui ne répond qu'au budget. La question
 * était comptée comme posée, donc le départ n'est jamais revenu. Le carnet restait sans trajet.
 */
describe("la ville de départ se redemande tant qu'elle manque", () => {
  const pret = (): TravelBrief => {
    const b = emptyBrief();
    b.mandatory.destination = {
      status: "confirmed",
      value: { mode: "fixed", places: ["Sainte-Lucie"], zone: "Sainte-Lucie", criteria: [] },
      alternatives: [],
      evidence: [],
    };
    b.mandatory.dates = {
      status: "confirmed",
      value: { earliest: "2027-04-01", latest: "2027-04-15", label: "avril 2027" },
      alternatives: [],
      evidence: [],
    };
    b.mandatory.duration = {
      status: "confirmed",
      value: { minNights: 4, maxNights: 4 },
      alternatives: [],
      evidence: [],
    };
    b.mandatory.travellers = {
      status: "confirmed",
      value: { total: { min: 2, max: 2 }, adults: 2, children: [], label: "2 adultes" },
      alternatives: [],
      evidence: [],
    };
    return b;
  };

  it("une réponse partielle ne clôt pas la question : le départ est redemandé", () => {
    const brief = pret();
    brief.useful.budget = {
      status: "confirmed",
      value: { min: null, max: 1500, currency: "EUR", per: "total" },
      alternatives: [],
      evidence: [],
    };
    const suite = briefGuidance(brief, 1).join("\n");
    expect(suite).toMatch(/ville de départ/);
    expect(suite).not.toMatch(/fourchette de budget/);
  });

  it("au bout de deux questions, on n'insiste plus", () => {
    expect(briefGuidance(pret(), 2).join("\n")).not.toMatch(/ville de départ/);
  });

  it("le départ connu, la question ne part pas", () => {
    const brief = pret();
    brief.useful.departure = {
      status: "confirmed",
      value: "Paris",
      alternatives: [],
      evidence: [],
    };
    brief.useful.budget = {
      status: "confirmed",
      value: { min: null, max: 1500, currency: "EUR", per: "total" },
      alternatives: [],
      evidence: [],
    };
    expect(briefGuidance(brief, 0).join("\n")).not.toMatch(/ville de départ/);
  });
});

/**
 * Une vraie conversation partait d'Halloween. L'agent a proposé Marrakech et la Guadeloupe,
 * deux endroits qui n'ont rien à voir avec cette fête. Le serveur rappelle donc les instructions
 * dédiées avant qu'un lieu ne soit proposé.
 */
describe("voyage posé sur une fête", () => {
  const rappel = async (message: string) => {
    const conversation = new ConversationStore().create();
    conversation.messages.push({ role: "user", content: [{ type: "text", text: message }] });
    const outcome = await tool("note_dates").run(
      {
        status: "vague",
        earliest: "2026-10-25",
        latest: "2026-11-02",
        label: "autour d'Halloween",
        quote: message,
      },
      { conversation, toolUseId: "t", emit: () => {} },
    );
    return { texte: outcome.kind === "result" ? outcome.content : "", conversation };
  };

  it("rappelle les instructions quand la fête porte le voyage", async () => {
    const { texte, conversation } = await rappel("je veux partir pour halloween");
    expect(texte).toMatch(/playbook voyage-pour-une-fete n'est pas/);
    expect(conversation.nudgedPlaybooks.has("voyage-pour-une-fete")).toBe(true);
  });

  it("reconnaît aussi les autres fêtes, écrites sans accent", async () => {
    expect((await rappel("on aimerait voir les marches de noel")).texte).toMatch(
      /voyage-pour-une-fete/,
    );
    expect((await rappel("la saint patrick en irlande")).texte).toMatch(/voyage-pour-une-fete/);
  });

  it("ne dit rien sur un voyage ordinaire", async () => {
    expect((await rappel("on part au Vietnam en novembre")).texte).not.toMatch(
      /voyage-pour-une-fete/,
    );
  });
});

/**
 * « Pour Halloween » fixe une période, pas une année. Le modèle enregistrait « Halloween 2026 »
 * comme confirmé alors que le voyageur n'avait jamais dit l'année.
 */
describe("année déduite d'une fête", () => {
  const noter = async (message: string, label: string) => {
    const conversation = new ConversationStore().create();
    conversation.messages.push({ role: "user", content: [{ type: "text", text: message }] });
    await tool("note_dates").run(
      {
        status: "confirmed",
        earliest: "2026-10-25",
        latest: "2026-11-02",
        label,
        quote: message,
      },
      { conversation, toolUseId: "t", emit: () => {} },
    );
    return conversation.brief.mandatory.dates;
  };

  it("la période est gardée, l'année reste déduite", async () => {
    const dates = await noter("je veux partir pour halloween", "Halloween 2026");
    expect(dates.status).toBe("inferred");
    expect(dates.value?.earliest).toBe("2026-10-25");
  });

  it("l'année dite par le voyageur reste confirmée", async () => {
    const dates = await noter("halloween 2026 si possible", "Halloween 2026");
    expect(dates.status).toBe("confirmed");
  });

  it("une période sans année affichée n'est pas touchée", async () => {
    const dates = await noter("on part fin octobre", "fin octobre");
    expect(dates.status).toBe("confirmed");
  });
});

/**
 * Une fête nomme un jour, pas un séjour. Le modèle enregistrait « du 31 octobre au 31 octobre »,
 * et quatre nuits n'y tenaient plus : le seuil du carnet complet refusait alors un projet complet.
 */
describe("fenêtre d'un seul jour autour d'une fête", () => {
  const noter = async (message: string, earliest: string, latest: string) => {
    const conversation = new ConversationStore().create();
    conversation.messages.push({ role: "user", content: [{ type: "text", text: message }] });
    await tool("note_dates").run(
      { status: "confirmed", earliest, latest, label: "Halloween", quote: message },
      { conversation, toolUseId: "t", emit: () => {} },
    );
    return conversation.brief.mandatory.dates;
  };

  it("le serveur ouvre la période de quelques jours, et le dit", async () => {
    const dates = await noter("je veux partir pour halloween", "2026-10-31", "2026-10-31");
    expect(dates.value?.earliest).toBe("2026-10-27");
    expect(dates.value?.latest).toBe("2026-11-04");
    expect(dates.status).toBe("inferred");
  });

  it("une période déjà large n'est pas touchée", async () => {
    const dates = await noter("halloween, on part une semaine", "2026-10-24", "2026-11-02");
    expect(dates.value?.earliest).toBe("2026-10-24");
  });

  it("hors d'une fête, la période reste celle du voyageur", async () => {
    const dates = await noter("on part le 12 juin 2027", "2027-06-12", "2027-06-12");
    expect(dates.value?.earliest).toBe("2027-06-12");
  });
});

/**
 * `note_preferences` n'a qu'une citation par appel. Cas réel du carnet PDF : départ, budget et
 * envies notés d'un coup avec « départ de Paris, budget autour de 4000 € ». Le carnet imprimait
 * cette phrase sous « Envies : cuisine de rue », comme si le voyageur l'avait dite pour ça.
 */
describe("une citation ne justifie que ce dont elle parle", () => {
  const appel = {
    status: "confirmed" as const,
    budget_max_eur: 4000,
    budget_per: "total" as const,
    budget_status: "vague" as const,
    departure_status: "confirmed" as const,
    style: [],
    interests: ["cuisine de rue"],
    constraints: [],
    nuances: [],
    departure_city: "Paris",
    quote: "départ de Paris, budget autour de 4000 €",
  };

  it("la phrase reste sous le départ et le budget, pas sous les envies", async () => {
    const conversation = new ConversationStore().create();
    await tool("note_preferences").run(appel, { conversation, toolUseId: "t", emit: () => {} });
    const { departure, budget, interests } = conversation.brief.useful;
    expect(departure.evidence.map((e) => e.quote)).toEqual([appel.quote]);
    expect(budget.evidence.map((e) => e.quote)).toEqual([appel.quote]);
    // Les envies sont bien notées, mais sans citation plutôt qu'avec une citation fausse.
    expect(interests.value).toEqual(["cuisine de rue"]);
    expect(interests.evidence).toEqual([]);
  });

  it("la phrase qui parle des envies reste sous les envies", async () => {
    const conversation = new ConversationStore().create();
    await tool("note_preferences").run(
      { ...appel, quote: "on aime la cuisine de rue et la baie d'Halong" },
      { conversation, toolUseId: "t", emit: () => {} },
    );
    const { interests, departure } = conversation.brief.useful;
    expect(interests.evidence.map((e) => e.quote)).toEqual([
      "on aime la cuisine de rue et la baie d'Halong",
    ]);
    expect(departure.evidence).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import type { TravellersValue } from "../../../shared/brief";
import {
  childrenDoubt,
  datesDoubt,
  durationDoubt,
  hesitationSurLeNombre,
  travellersDoubt,
} from "./fidelity";

const travellers = (
  total: [number, number],
  adults: number | null,
  childAges: (number | null)[] = [],
): TravellersValue => ({
  total: { min: total[0], max: total[1] },
  adults,
  children: childAges.map((age) => ({ age })),
  label: "test",
});

/** Messages voyageur tirés des transcriptions réelles (docs/scenarios, essai de robustesse). */
describe("travellersDoubt : un nombre de voyageurs confirmé doit avoir été dit", () => {
  it("scénario famille : adultes jamais dits, seulement l'âge des enfants -> doute", () => {
    const said =
      "On veut du soleil en famille cet hiver, mais on sait pas où.\n" +
      "Les enfants ont 4 et 7 ans. Plutôt pendant les vacances de février, une dizaine de jours, on part de Paris.";
    expect(travellersDoubt(travellers([4, 4], 2, [4, 7]), said)).not.toBeNull();
  });

  it("aurores en famille : « notre fils de 10 ans » ne dit pas combien d'adultes -> doute", () => {
    const said =
      "On veut voir des aurores boréales en Norvège en juillet, en famille avec notre fils de 10 ans.";
    expect(travellersDoubt(travellers([3, 3], 2, [10]), said)).not.toBeNull();
  });

  it("fauteuil roulant : « on est trois » mais seulement 2 personnes notées -> doute", () => {
    const said =
      "Je voudrais emmener ma mère de 78 ans qui se déplace en fauteuil roulant, une semaine au soleil en mars, on est trois.";
    expect(travellersDoubt(travellers([3, 3], 2), said)).toMatch(/total/);
  });

  it("une durée ou un âge ne comptent pas comme un nombre de voyageurs", () => {
    expect(
      travellersDoubt(travellers([3, 3], 3), "On part 3 semaines, notre fils a 3 ans."),
    ).not.toBeNull();
  });

  it("le verbe « a » (« notre fille a 3 chats ») ne compte pas comme « à 3 »", () => {
    const said = "Notre fille a 3 chats à la maison, on part en camping-car en famille.";
    expect(travellersDoubt(travellers([3, 3], 3), said)).not.toBeNull();
    expect(travellersDoubt(travellers([4, 4], 4), "On part à 4, en camping-car.")).toBeNull();
    expect(travellersDoubt(travellers([2, 2], 2), "À deux, en camping-car.")).toBeNull();
  });

  it("cas nominal : « on est 2 » confirme 2 adultes", () => {
    const said = "Vietnam, 3 semaines en novembre, on est 2, budget ~4000€";
    expect(travellersDoubt(travellers([2, 2], 2), said)).toBeNull();
  });

  it("« on sera 4 adultes » et « à deux » confirment", () => {
    expect(
      travellersDoubt(
        travellers([4, 4], 4),
        "On part 3 semaines en Grèce en juin, on sera 4 adultes.",
      ),
    ).toBeNull();
    expect(
      travellersDoubt(
        travellers([2, 2], 2),
        "Un truc dépaysant mais sans les foules, en mai, deux semaines à deux.",
      ),
    ).toBeNull();
  });

  it("correction : total dit (« on sera quatre ») et enfants dits -> les adultes se comptent", () => {
    const said =
      "Vietnam en novembre, 3 semaines, à deux.\nAh non pardon, on sera quatre, avec nos deux ados de 14 et 16 ans.";
    expect(travellersDoubt(travellers([4, 4], 2, [14, 16]), said)).toBeNull();
  });

  it("un mot qui désigne les adultes suffit (« ma femme et moi »)", () => {
    expect(
      travellersDoubt(
        travellers([4, 4], 2, [5, 8]),
        "Ma femme et moi avec nos enfants de 5 et 8 ans.",
      ),
    ).toBeNull();
  });

  it("message en anglais (essai de robustesse) : « we are two » confirme 2 adultes", () => {
    const said =
      "Hi, we are two retired Canadians looking for a slow trip in Morocco next spring, around 3 weeks.";
    expect(travellersDoubt(travellers([2, 2], 2), said)).toBeNull();
    expect(travellersDoubt(travellers([2, 2], 2), "Around 3 weeks in Morocco.")).not.toBeNull();
  });

  it("« en duo » et « just the two of us » disent bien qui part", () => {
    expect(
      travellersDoubt(travellers([2, 2], 2), "On voyage en duo, une semaine en Espagne."),
    ).toBeNull();
    expect(
      travellersDoubt(travellers([2, 2], 2), "Just the two of us, a week in Spain."),
    ).toBeNull();
  });

  it("une option de question à choix cliquée compte comme dite", () => {
    expect(travellersDoubt(travellers([4, 4], 2, [4, 7]), "2 adultes et 2 enfants")).toBeNull();
  });
});

/** Mesure finale du scénario (docs/scenarios/relecture.md) : « une dizaine de jours » -> 9 nuits confirmées. */
describe("durationDoubt : une durée confirmée doit avoir été dite précisément", () => {
  const nights = (min: number, max = min) => ({ minNights: min, maxNights: max });

  it("scénario famille : « une dizaine de jours » noté 9 nuits exactement -> doute", () => {
    const said =
      "On veut du soleil en famille cet hiver, mais on sait pas où.\n" +
      "Les enfants ont 4 et 7 ans. Plutôt pendant les vacances de février, une dizaine de jours, on part de Paris.";
    expect(durationDoubt(nights(9), said)).toMatch(/dizaine de jours/);
  });

  it("mesuré au 2e passage : « une dizaine de jours » noté 9 à 10 nuits -> doute aussi", () => {
    expect(durationDoubt(nights(9, 10), "Une dizaine de jours en février.")).not.toBeNull();
  });

  it("« deux semaines à peu près » : la fourchette reste, le statut non", () => {
    expect(durationDoubt(nights(12, 16), "On partirait deux semaines à peu près.")).toMatch(
      /peu pres/,
    );
  });

  it("« 3 semaines » : un nombre exact reste confirmé", () => {
    expect(
      durationDoubt(nights(21), "Vietnam, 3 semaines en novembre, on est 2, budget ~4000€"),
    ).toBeNull();
  });

  it("« 10 jours » : 9 nuits, c'est la conversion, pas une approximation", () => {
    expect(durationDoubt(nights(9), "On part 10 jours en Grèce en juin.")).toBeNull();
  });

  it("anglais (essai de robustesse) : « around 3 weeks » noté 21 nuits -> doute", () => {
    const said =
      "Hi, we are two retired Canadians looking for a slow trip in Morocco next spring, around 3 weeks.";
    expect(durationDoubt(nights(21), said)).toMatch(/around 3 weeks/);
  });

  it("le voyageur précise ensuite « 9 nuits » -> la durée peut être confirmée", () => {
    const said = "Une dizaine de jours en février.\n9 nuits";
    expect(durationDoubt(nights(9), said)).toBeNull();
  });

  // La règle « une borne n'est pas une durée » vient de la consigne du prompt système (« pas plus
  // de 10 jours » n'est pas « 8 à 9 nuits ») : elle passe en code, comme la décision 17.
  it("« 10 jours max » noté 9 nuits pile -> doute", () => {
    expect(durationDoubt(nights(9), "Ah en fait 10 jours max, pas 3 semaines.")).toMatch(/max/);
  });

  it("« pas plus de deux semaines » : une borne n'est pas une durée", () => {
    expect(durationDoubt(nights(13, 14), "On a pas plus de deux semaines devant nous.")).toMatch(
      /pas plus de/,
    );
  });

  it("cas réel en Grèce : « plutôt 10 jours » est un nombre, pas une approximation", () => {
    const said = "On part 3 semaines en Grèce en juin.\nFinalement ce sera plutôt 10 jours.";
    expect(durationDoubt(nights(9, 10), said)).toBeNull();
  });

  it("un budget maximum ne parle pas de la durée", () => {
    expect(durationDoubt(nights(9), "4000 euros max, on part 10 jours.")).toBeNull();
  });

  // Sur le vrai code, ces trois tournures passent au travers.
  it("« plus ou moins », « peut-être », « give or take » sont des approximations", () => {
    expect(durationDoubt(nights(14), "On part plus ou moins 2 semaines en Italie.")).not.toBeNull();
    expect(durationDoubt(nights(9), "Peut-être 10 jours en Grèce, on hésite.")).not.toBeNull();
    expect(durationDoubt(nights(9), "10 days give or take, sometime in May.")).not.toBeNull();
  });

  it("« au plus tard » parle d'une date, pas d'une durée (faux positif)", () => {
    expect(
      durationDoubt(nights(9), "Je peux partir au plus tard 10 jours après le mariage."),
    ).toBeNull();
  });

  it("un budget approximatif ne rend pas la durée approximative", () => {
    expect(
      durationDoubt(nights(9), "Le Vietnam en novembre, budget environ 4000 euros."),
    ).toBeNull();
  });
});

describe("un enfant ne s'invente pas à partir d'un lien de parenté", () => {
  const avecEnfants = (nb: number, total: number, adultes: number): TravellersValue => ({
    total: { min: total, max: total },
    adults: adultes,
    children: Array.from({ length: nb }, () => ({ age: null })),
    label: `${adultes} adultes et ${nb} enfant`,
  });

  it("« moi et mes parents » ne contient aucun enfant", () => {
    expect(childrenDoubt(avecEnfants(1, 3, 2), "moi et mes parents")).toMatch(/enfant/i);
  });

  it("« avec nos deux enfants » en contient", () => {
    expect(childrenDoubt(avecEnfants(2, 4, 2), "on part avec nos deux enfants")).toBeNull();
  });

  it("un âge dit suffit, même sans le mot enfant", () => {
    expect(childrenDoubt(avecEnfants(1, 3, 2), "il a 4 ans")).toBeNull();
  });

  it("un bébé compte, et un ado aussi", () => {
    expect(childrenDoubt(avecEnfants(1, 3, 2), "avec le bébé")).toBeNull();
    expect(childrenDoubt(avecEnfants(1, 3, 2), "avec notre ado")).toBeNull();
  });

  it("sans enfant noté, il n'y a rien à vérifier", () => {
    expect(childrenDoubt(avecEnfants(0, 2, 2), "moi et mes parents")).toBeNull();
  });
});

/**
 * Vu en usage réel : « je suis flexible sur les dates » a été enregistré « octobre 2026 »,
 * déduit. Le carnet affichait « à confirmer », et l'agent redemandait la période tour après
 * tour. Une flexibilité est une absence de contrainte, pas une date.
 */
describe("une période ne s'invente pas", () => {
  it("« je suis flexible » ne justifie aucun mois", () => {
    expect(datesDoubt("octobre 2026", "Je suis flexible sur les dates.")).toMatch(/aucun mois/);
    expect(datesDoubt("mai 2027", "Peu importe, choisissez pour moi.")).toMatch(/aucun mois/);
  });

  it("un mois dit reste un mois dit", () => {
    expect(datesDoubt("octobre 2026", "plutôt en octobre")).toBeNull();
    expect(datesDoubt("été 2027", "on partira cet été")).toBeNull();
    expect(datesDoubt("juin 2027", "we would like to travel in June")).toBeNull();
  });

  it("une date en chiffres compte aussi", () => {
    expect(datesDoubt("juin 2027", "du 15/06 au 30/06")).toBeNull();
    expect(datesDoubt("avril 2027", "en 2027 si possible")).toBeNull();
  });

  it("une période sans mois nommé ne déclenche rien", () => {
    expect(datesDoubt("dans les prochaines semaines", "je suis flexible")).toBeNull();
  });

  it("sans rien dit, on ne peut pas juger", () => {
    expect(datesDoubt("octobre 2026", "")).toBeNull();
  });
});

describe("un nombre n'est pas une date", () => {
  it("« 4 adultes » et « une semaine » ne justifient aucun mois", () => {
    expect(
      datesDoubt("octobre-novembre", "Je veux partir en Grèce, on sera 4 adultes, une semaine."),
    ).toMatch(/aucun mois/);
  });

  it("une vraie date en chiffres reste acceptée", () => {
    expect(datesDoubt("juin 2027", "on part du 15/06 au 30/06, on est 4")).toBeNull();
  });
});

/**
 * Cas mesuré : « on sera 4 ou 6 personnes » posé en texte au lieu d'une question à choix, une
 * fois sur trois. Le rappel doit partir dès le message, avant que l'agent écrive sa question.
 */
describe("hesitationSurLeNombre", () => {
  it("repère une hésitation sur le nombre de voyageurs", () => {
    expect(hesitationSurLeNombre("On part à Bali, mais on sera 4 ou 6 personnes")).toBe("4 ou 6");
    expect(hesitationSurLeNombre("nous serons trois ou quatre")).toBe("trois ou quatre");
    expect(hesitationSurLeNombre("entre 5 et 8 personnes, ça dépend")).toBe("5 et 8");
  });

  it("ignore une durée, un budget ou un nombre sûr", () => {
    expect(hesitationSurLeNombre("on part 4 ou 5 jours")).toBeNull();
    expect(hesitationSurLeNombre("entre 3000 et 4000 euros")).toBeNull();
    expect(hesitationSurLeNombre("on est 2, en novembre")).toBeNull();
  });

  it("ignore deux nombres qui ne comptent pas des gens", () => {
    expect(hesitationSurLeNombre("on veut un climat entre 18 et 25 °C")).toBeNull();
    expect(hesitationSurLeNombre("des étapes de 3 ou 4 kg de bagages")).toBeNull();
    expect(hesitationSurLeNombre("un hôtel 3 ou 4 étoiles")).toBeNull();
  });

  it("repère l'hésitation quand le contexte parle de personnes", () => {
    expect(hesitationSurLeNombre("on sera entre 5 et 8")).toBe("5 et 8");
    expect(hesitationSurLeNombre("3 ou 4 amis de fac")).toBe("3 ou 4");
  });
});

import { z } from "zod";
import type { TravelBrief } from "../../../shared/brief";
import { citationParleDe } from "../../../shared/citation";
import type { ServerEvent } from "../../../shared/events";
import { type Conversation, trace } from "../../conversation";
import { applyPatch, BriefPatch, STATUS_HELP } from "../brief/apply-patch";
import { computeCompleteness } from "../brief/completeness";
import { childrenDoubt, datesDoubt, durationDoubt, travellersDoubt } from "../brief/fidelity";
import { nextQuestionHint } from "../brief/next-question";
import { summarizeBrief } from "../brief/summarize";
import { travellerText } from "../traveller-text";
import { toInputSchema } from "./schema";
import { type AgentTool, invalidInput, type ToolOutcome } from "./types";

/**
 * Outils de mise à jour du brief, à paramètres PLATS (scalaires et listes de scalaires).
 *
 * Pourquoi pas un seul `update_brief` à objets imbriqués : sur les objets imbriqués, Haiku 4.5
 * produit des entrées malformées (`"interests": "\n<parameter name=\"status\">..."`). Le mode
 * strict qui l'empêcherait est refusé par l'API sur ce schéma ("compiled grammar is too large").
 * Des paramètres plats se remplissent de façon fiable et passent en mode strict.
 *
 * Chaque outil convertit son entrée en `BriefPatch` : la validation (Zod) et la fusion
 * (`applyPatch`) restent uniques et testées.
 */

/**
 * Valeurs réservées de `zone`. Pas de chaîne vide : mesuré sur Haiku 4.5, un paramètre texte
 * qui doit rester vide est celui où la syntaxe d'outil fuit. Un paramètre facultatif, lui,
 * était omis même pour un pays unique.
 */
/** Longueur maximale d'une valeur texte écrite par le modèle. */
const MAX_TEXT = 80;
const ZONE_SEVERAL = "plusieurs pays";
const ZONE_UNKNOWN = "à définir";
/** Même raison pour la ville de départ : un paramètre texte ne reste jamais vide. */
const DEPARTURE_UNKNOWN = "non dite";

/**
 * Mots qui disent une absence, pas une valeur. Le modèle n'écrit pas toujours le mot réservé, et
 * « Ville de départ : non renseigné » s'affichait alors au voyageur comme une vraie réponse.
 */
const BOUCHON =
  /^(inconnu|non (dit|dite|precise|precisee|renseigne|renseignee)|a (definir|preciser)|aucune?|n\/?a|pas encore .*)$/;

function estUnBouchon(texte: string): boolean {
  const nu = texte
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return nu === "" || BOUCHON.test(nu);
}

export function normalizeDeparture(city: string): string | null {
  const c = city.trim();
  return estUnBouchon(c) || c.toLowerCase() === DEPARTURE_UNKNOWN ? null : c;
}

export function normalizeZone(zone: string): string | null {
  const z = zone.trim();
  const lower = z.toLowerCase();
  return estUnBouchon(z) || lower === ZONE_SEVERAL || lower === ZONE_UNKNOWN ? null : z;
}

/**
 * Le voyageur relit son carnet et le garde : il se lit en français correct. Le voyageur, lui, écrit vite,
 * et une vraie conversation a produit « belles décoratives » à partir de « belle décos ».
 */
const FRANCAIS_CORRECT =
  "Écris en français correct, même si le voyageur tape vite : « belle décos » devient « belles décorations ». Ses mots exacts restent dans quote.";

const Status = z.enum(["vague", "inferred", "confirmed", "conflicting"]).describe(STATUS_HELP);
const Quote = z
  .string()
  .min(1)
  .describe("Les mots exacts du voyageur qui justifient cette mise à jour");

function commit(
  conversation: Conversation,
  emit: (e: ServerEvent) => void,
  candidate: unknown,
  notes: string[],
): ToolOutcome {
  const parsed = BriefPatch.safeParse(candidate);
  if (!parsed.success) return invalidInput(parsed.error.issues);

  const { brief, changes } = applyPatch(conversation.brief, parsed.data, conversation.turn);
  conversation.brief = brief;
  const completeness = computeCompleteness(brief);
  emit({ type: "brief_updated", brief, completeness });
  void trace({
    conversationId: conversation.id,
    turn: conversation.turn,
    at: new Date().toISOString(),
    kind: "brief_state",
    version: brief.version,
    mandatoryOk: completeness.mandatoryOk,
    ready: completeness.ready,
  });

  const lines = [
    changes.length > 0 ? `Changements : ${changes.join(" ; ")}` : "Aucun changement.",
    ...notes,
    summarizeBrief(brief, completeness),
  ];

  // Filet de sécurité : l'état structuré dit qu'il y a des enfants, les instructions famille
  // ne sont pas chargées. Le serveur rappelle ; c'est toujours l'agent qui charge.
  const travellers = brief.mandatory.travellers.value;
  // Un enfant qui n'apparaît nulle part dans les mots du voyageur ne déclenche pas le rappel.
  // Sinon une erreur de lecture pousse des conseils hors sujet, et l'agent demande l'âge d'un
  // enfant qui n'existe pas, comme avec « moi et mes parents ». Quand le voyageur n'a encore
  // rien écrit, on ne peut pas juger : le filet reprend son rôle.
  const dit = travellerText(conversation.messages);
  const hasChildren =
    (travellers?.children.length ?? 0) > 0 &&
    (travellers === null || dit.trim() === "" || !childrenDoubt(travellers, dit));
  const familyLoaded = conversation.playbooks.some((p) => p.name === "voyage-en-famille");
  if (hasChildren && !familyLoaded) {
    if (!conversation.nudgedPlaybooks.has("voyage-en-famille")) {
      conversation.nudgedPlaybooks.set("voyage-en-famille", conversation.messages.length);
    }
    lines.push(
      "Rappel serveur : le brief contient des enfants et le playbook voyage-en-famille n'est pas " +
        "chargé. Charge-le avant de recommander ou de poser une autre question.",
    );
    void trace({
      conversationId: conversation.id,
      turn: conversation.turn,
      at: new Date().toISOString(),
      kind: "playbook_nudge",
      name: "voyage-en-famille",
    });
  }
  // Même filet pour une fête. Sans lui, l'agent proposait Marrakech et la Guadeloupe pour
  // Halloween : des lieux agréables, mais sans rapport avec ce que le voyageur venait de dire.
  const fete = feteEvoquee(dit);
  const feteChargee = conversation.playbooks.some((p) => p.name === "voyage-pour-une-fete");
  if (fete && !feteChargee) {
    if (!conversation.nudgedPlaybooks.has("voyage-pour-une-fete")) {
      conversation.nudgedPlaybooks.set("voyage-pour-une-fete", conversation.messages.length);
    }
    lines.push(
      `Rappel serveur : le voyage est posé sur une fête (${fete}) et le playbook ` +
        "voyage-pour-une-fete n'est pas chargé. Charge-le avant de proposer un lieu.",
    );
    void trace({
      conversationId: conversation.id,
      turn: conversation.turn,
      at: new Date().toISOString(),
      kind: "playbook_nudge",
      name: "voyage-pour-une-fete",
    });
  }
  return { kind: "result", content: lines.join("\n") };
}

/**
 * Fêtes qui décident d'une date et d'un lieu. Écrites sans accent et sans tiret dans le motif :
 * un voyageur tape « noel », « st patrick » ou « dia de muertos » aussi souvent que la forme
 * correcte. Rendu : le nom de la fête reconnue, pour que le rappel dise laquelle.
 */
const FETES: [RegExp, string][] = [
  [/hall?ow(e)?en/i, "Halloween"],
  [/(saint|st)[ .-]*patrick/i, "la Saint-Patrick"],
  [/(march(e|é)s? de )?no(e|ë)l|r(e|é)veillon/i, "Noël"],
  [/nouvel an|jour de l'an|new year/i, "le Nouvel An"],
  [/carnaval|carnival/i, "le carnaval"],
  [/(f(e|ê)te des morts|d(i|í)a de (los )?muertos)/i, "la fête des morts"],
  [/oktoberfest/i, "l'Oktoberfest"],
  [/(holi|diwali|songkran)\b/i, "une grande fête locale"],
];

/** Une fête dure un jour ou deux ; un séjour, plusieurs. En dessous, la fenêtre est trop serrée. */
const JOURS_MINIMUM_AUTOUR_DUNE_FETE = 5;
const MARGE_AUTOUR_DUNE_FETE = 4;

function joursEntre(debut: string, fin: string): number {
  return Math.round((Date.parse(fin) - Date.parse(debut)) / 86_400_000) + 1;
}

function decalerDe(jour: string, jours: number): string {
  return new Date(Date.parse(jour) + jours * 86_400_000).toISOString().slice(0, 10);
}

export function feteEvoquee(dit: string): string | null {
  for (const [motif, nom] of FETES) if (motif.test(dit)) return nom;
  return null;
}

/**
 * Consigne de suite, calculée UNE fois par appel au modèle, après tous les note_* de cet appel
 * (`loop.ts`). Calculée dans chaque note_* plutôt qu'une seule fois, elle peut donner des
 * résultats contradictoires dans le même lot. Un résultat dirait « il manque la période » et
 * le suivant « le brief est complet ».
 */
/** Au-delà, on n'insiste plus : le voyageur ne veut pas répondre, ou ne sait pas. */
export const MAX_QUESTIONS_UTILES = 2;

/** La question sur le départ et le budget doit-elle partir ce tour-ci ? */
export function doitPoserLaQuestionUtile(brief: TravelBrief, dejaPosees: number): boolean {
  if (dejaPosees >= MAX_QUESTIONS_UTILES) return false;
  if (!computeCompleteness(brief).ready) return false;
  return brief.useful.departure.status === "unknown" || brief.useful.budget.status === "unknown";
}

export function briefGuidance(brief: TravelBrief, usefulAsked = 0): string[] {
  const completeness = computeCompleteness(brief);
  if (completeness.ready) {
    // Les quatre essentiels suffisent pour un carnet complet (décision 4), mais deux informations
    // le rendent bien plus utile : d'où part le voyageur, et son ordre de budget. Sans la ville, le
    // trajet reste inconnu ; sans le budget, un projet infaisable passe quand même.
    // Une réponse partielle ne clôt pas la question : un vrai carnet a été validé sans ville de
    // départ parce que « tout » ne répondait qu'au budget. On redemande ce qui manque encore,
    // deux fois au plus, puis on laisse le voyageur tranquille.
    const manqueDepart = brief.useful.departure.status === "unknown";
    const manqueBudget = brief.useful.budget.status === "unknown";
    if (doitPoserLaQuestionUtile(brief, usefulAsked)) {
      const quoi = [
        manqueDepart ? "la ville de départ" : null,
        manqueBudget ? "une fourchette de budget" : null,
      ]
        .filter(Boolean)
        .join(" et ");
      return [
        `Le brief est complet : appelle present_brief maintenant. Dans ton message, dis en une ` +
          `phrase qu'il manque ${quoi} pour préparer le trajet, et qu'il peut l'indiquer ou ` +
          "télécharger son carnet sans. Une seule phrase, et aucune autre question.",
      ];
    }
    // Mesuré sur les 6 carnets réellement validés : style, envies et contraintes étaient vides
    // 6 fois sur 6. Le carnet n'était qu'un squelette. On invite sans bloquer le carnet : le seuil
    // reste le seuil (décision 4), c'est la phrase qui accompagne le récapitulatif qui change.
    const sansEnvies =
      brief.useful.style.status === "unknown" &&
      brief.useful.interests.status === "unknown" &&
      brief.useful.constraints.status === "unknown";
    return [
      sansEnvies
        ? "Le brief est complet : appelle present_brief dans ce tour. Dans ta phrase, invite le voyageur à dire ses envies ou son style de voyage s'il le souhaite : rien n'est noté, et son carnet sera plus utile avec."
        : "Le brief est complet : appelle present_brief dans ce tour, sans nouvelle question (sauf si le voyageur en a posé une).",
    ];
  }
  const hint = nextQuestionHint(brief, completeness);
  return hint ? [`Question suivante, si le voyageur n'attend pas une autre réponse : ${hint}`] : [];
}

/**
 * Correction d'une entrée avant fusion, décidée en code : renvoie l'entrée corrigée et la note
 * qui l'explique au modèle, ou null si rien n'est à corriger.
 */
type Review<T> = (data: T, conversation: Conversation) => { data: T; note: string } | null;

function briefTool<T extends z.ZodType>(
  name: string,
  description: string,
  input: T,
  toPatch: (data: z.infer<T>) => unknown,
  review?: Review<z.infer<T>>,
): AgentTool {
  return {
    definition: {
      name,
      description: `${description} Appelle-le dès que l'information apparaît, même floue. Le résultat donne l'état du brief et ce qui manque.`,
      strict: true,
      input_schema: toInputSchema(input),
    },
    activityLabel: () => "Mise à jour de votre carnet",
    async run(raw, { conversation, emit }) {
      const parsed = input.safeParse(raw);
      if (!parsed.success) return invalidInput(parsed.error.issues);
      const reviewed = review?.(parsed.data, conversation) ?? null;
      const data = reviewed ? reviewed.data : parsed.data;
      return commit(conversation, emit, toPatch(data), reviewed ? [reviewed.note] : []);
    },
  };
}

const DestinationInput = z.object({
  status: Status,
  mode: z
    .enum(["open", "shortlist", "fixed"])
    .describe("open = aucun lieu choisi ; shortlist = quelques lieux ; fixed = un lieu"),
  places: z.array(z.string()).describe("Lieux cités, vide si mode open"),
  zone: z
    .string()
    .min(1)
    .max(MAX_TEXT)
    .describe(
      `Pays ou région où se déroule le voyage, un seul (ex. 'Vietnam', 'Sicile'). Écrire '${ZONE_SEVERAL}' si les lieux sont dans plusieurs pays, '${ZONE_UNKNOWN}' si mode open`,
    ),
  criteria: z
    .array(z.string())
    .describe("Envies qui guident le choix : 'soleil', 'sans les foules'..."),
  alternative_places: z
    .array(z.string())
    .optional()
    .describe("Seulement si status conflicting : l'autre destination citée. Sinon omettre"),
  quote: Quote,
});

const DatesInput = z.object({
  status: Status,
  earliest: z
    .string()
    .describe(
      "Début de la fenêtre de départ, AAAA-MM-JJ. 'cet été' = 06-01 ; 'novembre' = 11-01. Année non dite : prochaine occurrence à venir, jamais une date passée ; mois sans jour ou année non dite : status vague, pas confirmed",
    ),
  latest: z
    .string()
    .describe("Fin de la fenêtre, AAAA-MM-JJ. 'cet été' = 08-31 ; 'novembre' = 11-30"),
  label: z
    .string()
    .describe("Les mots du voyageur reformulés court : 'cet été', 'vacances de février 2027'"),
  alternative_label: z
    .string()
    .optional()
    .describe(
      "Seulement si status conflicting : l'autre période, AAAA-MM-JJ/AAAA-MM-JJ. Sinon omettre",
    ),
  quote: Quote,
});

const DurationInput = z.object({
  status: Status,
  min_nights: z
    .number()
    .int()
    .describe(
      "En nuits : 'deux semaines à peu près' = 12 ; '3 semaines' = 21 ; '10 jours' = 9 nuits (un séjour de N jours compte N-1 nuits)",
    ),
  max_nights: z.number().int().describe("'deux semaines à peu près' = 16 ; '3 semaines' = 21"),
  alternative_min_nights: z
    .number()
    .int()
    .optional()
    .describe("Seulement si status conflicting : l'autre durée. Sinon omettre"),
  alternative_max_nights: z
    .number()
    .int()
    .optional()
    .describe("Seulement si status conflicting. Sinon omettre"),
  quote: Quote,
});

const TravellersInput = z.object({
  status: Status,
  total_min: z.number().int().describe("Nombre de personnes, borne basse ('4 ou 6' = 4)"),
  total_max: z.number().int().describe("Borne haute ('4 ou 6' = 6)"),
  adults: z
    .number()
    .int()
    .describe(
      "Nombre d'adultes dit par le voyageur, 0 s'il ne l'a pas dit. « on est 2 » ou « à deux » sans enfant = 2, confirmed. Si tu le déduis (« en famille » = 2 adultes ?), status inferred, jamais confirmed",
    ),
  children_count: z.number().int().describe("Nombre d'enfants mineurs, 0 si aucun"),
  children_ages: z
    .array(z.number().int())
    .describe("Âges connus des enfants ; peut être plus court que children_count"),
  label: z.string().describe("Résumé court : '2 adultes et 2 enfants (4 et 7 ans)'"),
  quote: Quote,
});

const PreferencesInput = z.object({
  status: Status.describe(
    `Certitude du style, des envies, des contraintes et des nuances. ${STATUS_HELP}`,
  ),
  budget_max_eur: z.number().int().describe("Budget maximum en euros, 0 si non évoqué"),
  budget_per: z.enum(["person", "total", "unknown"]).describe("unknown si non évoqué"),
  // Une phrase réelle mélange les certitudes : « je pars de Paris c'est sûr, le budget on verra ».
  // Un statut unique pour tout l'appel enregistre le budget « confirmé » à tort.
  budget_status: Status.describe("Certitude du budget, indépendante des autres informations"),
  style: z
    .array(z.string())
    .describe(
      `Style de voyage : 'slow travel', 'confort'... vide si rien de nouveau.${FRANCAIS_CORRECT}`,
    ),
  interests: z
    .array(z.string())
    .describe(
      "Centres d'intérêt : 'plongée', 'cuisine locale'... vide si rien de nouveau." +
        FRANCAIS_CORRECT,
    ),
  constraints: z
    .array(z.string())
    .describe(
      "Contraintes, écrites comme une phrase que le voyageur relit dans son carnet : 'ne parle pas " +
        "espagnol', 'mobilité réduite', 'voyage avec un bébé de 5 mois', 'pas de vol de nuit'. " +
        "Note ici aussi tout ce qui sort de l'aller-retour habituel, qu'on supposerait sinon : " +
        "'aller simple, pas de retour prévu', 'retour depuis une autre ville', 'arrivée imposée " +
        "à tel aéroport'. Jamais un mot collé à un autre ('pas de parler espagnol'). " +
        "Vide si rien de nouveau",
    ),
  nuances: z
    .array(z.string())
    .describe(
      "Phrases du voyageur utiles pour préparer son voyage, mot pour mot, qui n'entrent nulle part ailleurs",
    ),
  departure_status: Status.describe(
    "Certitude de la ville de départ, indépendante des autres informations",
  ),
  departure_city: z
    .string()
    .min(1)
    // Bornée ici ET dans `DepartureValue`. Le mode strict retire `maxLength` du schéma envoyé
    // au modèle, donc la borne ne sert qu'au serveur : c'est justement le point.
    .max(MAX_TEXT)
    .describe(
      `Ville ou aéroport d'où part le voyageur s'il le dit ('Paris', 'Lyon'). Écrire '${DEPARTURE_UNKNOWN}' s'il ne l'a pas dit`,
    ),
  quote: Quote,
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Une année écrite par le voyageur (2027), pas un montant (« 2500 € »). */
const SAID_YEAR =
  /\b20[2-9]\d\b(?!\s*(?:€|\$|£|euros?|eur\b|dollars?|usd\b|livres?|gbp\b|francs?|chf\b|k\b))/i;

/** Même lieu écrit avec ou sans accents ni majuscules (« Coree du Sud », « Corée du Sud »). */
function samePlace(place: string): string {
  return place
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function nextYear(iso: string): string {
  const shifted = `${Number(iso.slice(0, 4)) + 1}${iso.slice(4)}`;
  // Le 29 février n'existe pas l'année suivante.
  return shifted.endsWith("-02-29") ? `${shifted.slice(0, 7)}-28` : shifted;
}

function parseWindow(label: string) {
  const [earliest, latest] = label.split("/");
  return earliest && latest ? { earliest, latest, label } : null;
}

export const briefTools: AgentTool[] = [
  briefTool(
    "note_destination",
    "Enregistre la destination dans le brief, ou le fait qu'elle soit encore ouverte avec les envies du voyageur.",
    DestinationInput,
    (d) => ({
      destination: {
        status: d.status,
        value: {
          mode: d.mode,
          places: d.places,
          zone: normalizeZone(d.zone),
          criteria: d.criteria,
        },
        ...(d.status === "conflicting" && (d.alternative_places?.length ?? 0) > 0
          ? {
              alternatives: [
                { mode: "fixed", places: d.alternative_places ?? [], zone: null, criteria: [] },
              ],
            }
          : {}),
        quote: d.quote,
      },
    }),
    // Lors d'un essai de robustesse : « On hésite entre le Japon et la Corée du Sud » est noté
    // en conflit, avec pour « autre réponse » un lieu déjà dans la liste. Une hésitation
    // n'est pas une contradiction : le carnet ne doit trancher qu'entre deux réponses
    // réellement différentes.
    (d) => {
      const listed = new Set(d.places.map(samePlace));
      const alternatives = d.alternative_places ?? [];
      const repeatsList =
        d.status === "conflicting" &&
        alternatives.length > 0 &&
        alternatives.every((p) => listed.has(samePlace(p)));
      if (!repeatsList) return null;
      return {
        data: { ...d, status: "vague" as const, alternative_places: undefined },
        note: "Destination notée « à préciser » et non « à trancher » : le voyageur hésite entre plusieurs lieux, il ne s'est pas contredit.",
      };
    },
  ),
  briefTool(
    "note_dates",
    "Enregistre la période de départ dans le brief, comme une fenêtre de dates.",
    DatesInput,
    (d) => {
      const alternative =
        d.status === "conflicting" && d.alternative_label ? parseWindow(d.alternative_label) : null;
      return {
        dates: {
          status: d.status,
          value: { earliest: d.earliest, latest: d.latest, label: d.label },
          ...(alternative ? { alternatives: [alternative] } : {}),
          quote: d.quote,
        },
      };
    },
    // « en juin », dit en septembre, est parfois noté en juin de la même année malgré la
    // consigne « prochaine occurrence ». La règle passe en code : si le voyageur n'a écrit
    // aucune année, une période déjà passée glisse à l'année suivante.
    (d, conversation) => {
      const dit = travellerText(conversation.messages);
      // « je suis flexible sur les dates » a été enregistré « octobre 2026 », déduit. Le carnet
      // affichait « à confirmer », et l'agent redemandait la période tour après tour.
      const invente = datesDoubt(d.label, dit);
      if (invente) {
        return {
          data: { ...d, status: "vague" as const, label: "dates ouvertes, voyageur flexible" },
          note: `Période enregistrée « à préciser », sans mois : ${invente}. Ne redemande pas la période : le voyageur est flexible, et son carnet le dit.`,
        };
      }
      // Une fête nomme un jour, pas un séjour. « Du 31 octobre au 31 octobre » ne peut loger
      // aucune nuit, et le seuil du carnet complet refusait ensuite un projet pourtant complet. Le serveur
      // ouvre la fenêtre de quelques jours, le dit, et laisse le statut en déduit.
      const fete = feteEvoquee(dit);
      if (fete && joursEntre(d.earliest, d.latest) < JOURS_MINIMUM_AUTOUR_DUNE_FETE) {
        return {
          data: {
            ...d,
            status: "inferred" as const,
            earliest: decalerDe(d.earliest, -MARGE_AUTOUR_DUNE_FETE),
            latest: decalerDe(d.latest, MARGE_AUTOUR_DUNE_FETE),
          },
          note: `La fête tient sur un jour, pas le séjour : la période est ouverte de ${MARGE_AUTOUR_DUNE_FETE} jours avant et après. Dis-la au voyageur pour qu'il la resserre s'il veut.`,
        };
      }
      // Une fête fixe la période, jamais l'année : « pour Halloween » enregistrait
      // « Halloween 2026 » comme confirmé, alors que le voyageur n'avait pas dit l'année. Un
      // mois dit reste traité plus bas, où une période passée se décale d'une année.
      const ANNEE = /\b20\d{2}\b/;
      if (
        d.status === "confirmed" &&
        feteEvoquee(dit) !== null &&
        ANNEE.test(d.label) &&
        !ANNEE.test(dit)
      ) {
        return {
          data: { ...d, status: "inferred" as const },
          note: "L'année n'a pas été dite par le voyageur : la période est enregistrée comme déduite. Dis l'année à voix haute pour qu'il la corrige si besoin.",
        };
      }
      const today = new Date().toISOString().slice(0, 10);
      if (!ISO_DATE.test(d.earliest) || !ISO_DATE.test(d.latest) || d.latest >= today) return null;
      if (SAID_YEAR.test(dit)) return null;
      let { earliest, latest } = d;
      for (let i = 0; i < 2 && latest < today; i++) {
        earliest = nextYear(earliest);
        latest = nextYear(latest);
      }
      if (latest < today) return null;
      // Le libellé est ce que le voyageur lit dans son carnet : sans cette correction, il
      // affiche encore l'ancienne année alors que la date a glissé à l'année suivante.
      const oldYear = d.earliest.slice(0, 4);
      const label = d.label.replace(new RegExp(`\\b${oldYear}\\b`, "g"), earliest.slice(0, 4));
      return {
        data: { ...d, earliest, latest, label },
        note: `Période « ${d.label} » placée en ${earliest.slice(0, 4)} : le voyageur n'a pas dit l'année, et la date notée était déjà passée.`,
      };
    },
  ),
  briefTool(
    "note_duration",
    "Enregistre la durée du voyage dans le brief, en nuits.",
    DurationInput,
    (d) => ({
      duration: {
        status: d.status,
        value: { minNights: d.min_nights, maxNights: d.max_nights },
        ...(d.status === "conflicting"
          ? {
              alternatives: [
                {
                  minNights: d.alternative_min_nights ?? 0,
                  maxNights: d.alternative_max_nights ?? d.alternative_min_nights ?? 0,
                },
              ],
            }
          : {}),
        quote: d.quote,
      },
    }),
    // « une dizaine de jours » est parfois enregistré « confirmé, 9 à 9 nuits ». « vague »
    // garde le carnet complet, puisque c'est le voyageur qui est approximatif et non l'agent
    // qui devine, mais le carnet affiche enfin un ordre de grandeur.
    (d, conversation) => {
      if (d.status !== "confirmed") return null;
      const doubt = durationDoubt(
        { minNights: d.min_nights, maxNights: d.max_nights },
        travellerText(conversation.messages),
      );
      if (!doubt) return null;
      return {
        data: { ...d, status: "vague" as const },
        note: `Durée enregistrée « à préciser » et non « confirmée » : ${doubt}. Si le nombre de nuits change l'itinéraire, fais-le préciser avec ask_choice.`,
      };
    },
  ),
  briefTool(
    "note_travellers",
    "Enregistre qui part : nombre de personnes, adultes, enfants et leurs âges.",
    TravellersInput,
    (d) => ({
      travellers: {
        status: d.status,
        value: {
          total: { min: d.total_min, max: d.total_max },
          adults: d.adults > 0 ? d.adults : null,
          children: Array.from(
            { length: Math.max(d.children_count, d.children_ages.length) },
            (_, i) => ({
              age: d.children_ages[i] ?? null,
            }),
          ),
          label: d.label,
        },
        quote: d.quote,
      },
    }),
    (d, conversation) => {
      if (d.status !== "confirmed") return null;
      const value = {
        total: { min: d.total_min, max: d.total_max },
        adults: d.adults > 0 ? d.adults : null,
        children: Array.from(
          { length: Math.max(d.children_count, d.children_ages.length) },
          (_, i) => ({
            age: d.children_ages[i] ?? null,
          }),
        ),
        label: d.label,
      };
      // Validation par le voyageur : la même valeur était déjà « à confirmer » à un tour
      // précédent, il a eu le carnet et la question sous les yeux.
      const previous = conversation.brief.mandatory.travellers;
      const lastTurn = previous.evidence.at(-1)?.turn ?? conversation.turn;
      if (
        previous.status === "inferred" &&
        lastTurn < conversation.turn &&
        JSON.stringify({ ...previous.value, label: "" }) === JSON.stringify({ ...value, label: "" })
      ) {
        return null;
      }
      const dit = travellerText(conversation.messages);
      // Un enfant inventé coûte deux fois : il fausse le carnet, et il déclenche les conseils
      // famille, qui font demander l'âge d'un enfant qui n'existe pas.
      const doubt = travellersDoubt(value, dit) ?? childrenDoubt(value, dit);
      if (!doubt) return null;
      return {
        data: { ...d, status: "inferred" as const },
        note: `Voyageurs enregistrés « à confirmer » et non « confirmé » : ${doubt}. Fais valider le nombre de voyageurs avant de présenter le carnet, de préférence avec ask_choice.`,
      };
    },
  ),
  briefTool(
    "note_preferences",
    "Enregistre les informations utiles mais non obligatoires : ville de départ, budget, style, envies, contraintes, nuances.",
    PreferencesInput,
    (d) => {
      // Une seule phrase pour tout l'appel : elle ne reste que sous les valeurs dont elle parle.
      const cite = (valeurs: string[]) => (citationParleDe(valeurs, d.quote) ? d.quote : "");
      const depart = normalizeDeparture(d.departure_city);
      return {
        ...(d.budget_max_eur > 0 && d.budget_per !== "unknown"
          ? {
              budget: {
                status: d.budget_status,
                value: { min: null, max: d.budget_max_eur, currency: "EUR", per: d.budget_per },
                quote: cite([String(d.budget_max_eur)]),
              },
            }
          : {}),
        ...(d.style.length > 0
          ? { style: { status: d.status, value: d.style, quote: cite(d.style) } }
          : {}),
        ...(d.interests.length > 0
          ? { interests: { status: d.status, value: d.interests, quote: cite(d.interests) } }
          : {}),
        ...(d.constraints.length > 0
          ? {
              constraints: { status: d.status, value: d.constraints, quote: cite(d.constraints) },
            }
          : {}),
        ...(depart
          ? { departure: { status: d.departure_status, value: depart, quote: cite([depart]) } }
          : {}),
        ...(d.nuances.length > 0 ? { nuances: d.nuances } : {}),
      };
    },
    // Ces champs n'ont qu'une valeur par appel : « à trancher » exige une autre valeur, que le
    // schéma ne permet pas de donner, et l'outil échoue en boucle.
    (d) => {
      const keys = ["status", "budget_status", "departure_status"] as const;
      if (!keys.some((k) => d[k] === "conflicting")) return null;
      const data = { ...d };
      for (const key of keys) if (data[key] === "conflicting") data[key] = "vague" as const;
      return {
        data,
        note: "Statut « à trancher » impossible ici : une seule valeur par appel. Enregistré « à préciser ». Si le voyageur a donné deux valeurs différentes, mets la seconde dans nuances, mot pour mot.",
      };
    },
  ),
];

export const BRIEF_TOOL_NAMES = new Set(briefTools.map((t) => t.definition.name));

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { computeCompleteness } from "../src/server/agent/brief/completeness";
import { summarizeBrief } from "../src/server/agent/brief/summarize";
import { runTurn } from "../src/server/agent/loop";
import { replyMetrics } from "../src/server/agent/reply-metrics";
import { warmUp } from "../src/server/agent/warm-up";
import { loadConfig } from "../src/server/config";
import { ConversationStore } from "../src/server/conversation";
import type { TurnRequest } from "../src/shared/api";
import type { ServerEvent } from "../src/shared/events";
import { tokenCost } from "../src/shared/pricing";

/**
 * Rejoue les intentions de référence contre l'agent réel et écrit une transcription par
 * scénario dans docs/scenarios/. Vrais appels API : ce sont des preuves, pas des simulations.
 * Les messages du voyageur sont écrits à l'avance ; quand l'agent pose une question à choix,
 * le message suivant est envoyé en texte libre (chemin prévu par le serveur).
 */

interface Scenario {
  slug: string;
  intention: string;
  messages: string[];
  /** Valide le carnet si l'agent présente le récapitulatif. */
  sendWhenReady?: boolean;
}

/**
 * Sortie : docs/scenarios/ par défaut (mesure de référence versionnée). Un essai ponctuel
 * (SCENARIO_FILE=chemin.json) écrit dans SCENARIO_OUT, par défaut data/spikes/ (non versionné).
 */
const SCENARIO_FILE = process.env.SCENARIO_FILE;
const OUT_DIR = pathToFileURL(
  `${resolve(process.env.SCENARIO_OUT ?? (SCENARIO_FILE ? "data/spikes" : "docs/scenarios"))}/`,
);

const SCENARIOS: Scenario[] = [
  {
    slug: "1-destination-ouverte-famille",
    intention: "Destination ouverte, en famille",
    messages: [
      "On veut du soleil en famille cet hiver, mais on sait pas où.",
      "Les enfants ont 4 et 7 ans. Plutôt pendant les vacances de février, une dizaine de jours, on part de Paris.",
    ],
  },
  {
    slug: "2-infos-completes",
    intention: "Informations déjà complètes",
    messages: ["Vietnam, 3 semaines en novembre, on est 2, budget ~4000€"],
    sendWhenReady: true,
  },
  {
    slug: "3-conseil-trek-nepal",
    intention: "Demande de conseil qui se heurte à la réalité",
    messages: ["Le trek au Népal en juillet, c'est jouable ?"],
  },
  {
    slug: "4-envie-floue-zanzibar",
    intention: "Envie floue à ancrer",
    messages: ["C'est où Zanzibar ? Ça ressemble à quoi ?"],
  },
  {
    slug: "5-depaysement-sans-la-foule",
    intention: "Dépaysement sans la foule",
    messages: ["Un truc dépaysant mais sans les foules, en mai, deux semaines à deux."],
  },
  {
    slug: "6-contradiction",
    intention: "Contradiction dans la durée",
    messages: [
      "On part 3 semaines en Grèce en juin, on sera 4 adultes.",
      "Finalement ce sera plutôt 10 jours.",
    ],
  },
  {
    slug: "7-composition-variable",
    intention: "Composition variable (question à choix attendue)",
    messages: [
      "On part à Bali, 10 jours en juin, mais on sera 4 ou 6 personnes, ça dépend des amis.",
    ],
  },
  {
    // Le message d'exemple de l'accueil : tout arrive d'un coup, sauf la ville de départ.
    // À surveiller : une seule chose à la fois, pas deux « votre projet est complet » de suite.
    slug: "9-tout-dun-coup",
    intention: "Tout donné dès le premier message",
    messages: ["Vietnam, 3 semaines en novembre, à deux, budget 4 000 €", "On part de Bordeaux."],
    sendWhenReady: true,
  },
  {
    // Le voyageur qui ne sait rien et le dit. Rien ne doit se reposer deux fois, et l'agent
    // doit proposer une piste concrète plutôt que reformuler sa question.
    slug: "10-je-ne-sais-pas",
    intention: "Le voyageur ne sait pas et le dit",
    messages: [
      "Je sais pas du tout où partir.",
      "Je sais pas.",
      "Peu importe, je suis flexible.",
      "J'ai pas vraiment de budget en tête.",
    ],
  },
  {
    // Le voyageur doute du voyage lui-même. L'agent ne doit pas le pousser à conclure.
    slug: "11-pas-sur-de-partir",
    intention: "Le voyageur hésite à partir",
    messages: [
      "Je sais même pas si je vais partir cette année, j'hésite.",
      "C'est surtout une question d'argent, et je suis fatigué en ce moment.",
    ],
  },
  {
    // Le voyageur part ailleurs, puis revient. L'agent décline sans sermon et garde le fil.
    slug: "12-hors-sujet-puis-retour",
    intention: "Demande hors sujet, puis retour au voyage",
    messages: [
      "Écris-moi un poème sur la mer.",
      "Bon d'accord. Je veux partir en Grèce en septembre, on est trois.",
    ],
  },
  {
    // Trois hésitations dans une seule phrase. Rien ne doit être noté comme certain.
    slug: "13-contradictions-dans-une-phrase",
    intention: "Le voyageur se contredit dans la même phrase",
    messages: [
      "On part deux semaines, enfin non plutôt quatre jours, en juin ou peut-être septembre.",
    ],
  },
  {
    // Le voyageur pressé, qui écrit en style télégraphique et veut son carnet tout de suite.
    slug: "14-voyageur-presse",
    intention: "Le voyageur pressé veut son carnet tout de suite",
    messages: ["Bali. Juillet. 2 pers. Fais-moi le carnet.", "Non, fais-le maintenant."],
    sendWhenReady: true,
  },
  {
    // Le cadrage produit demande que l'agent suive la langue du voyageur.
    slug: "15-voyageur-en-anglais",
    intention: "Le voyageur écrit en anglais",
    messages: ["I want to go somewhere warm in February with my two kids, we are based in Paris."],
  },
  {
    // Le voyageur qui ne sait pas quoi répondre interroge l'agent : ici il ne répond jamais
    // directement, il demande. Le brief doit quand même avancer.
    slug: "8-le-voyageur-interroge",
    intention: "Le voyageur pose les questions",
    messages: [
      "Je veux partir en février au soleil, mais je sais pas où.",
      "Je sais pas quoi répondre, vous conseillez quoi pour un premier voyage lointain ?",
      "C'est mieux le Sri Lanka ou la Thaïlande en février ? Et il fait quel temps ?",
      "On est deux, une semaine, on part de Lyon. Le décalage horaire c'est gérable ?",
    ],
  },
  {
    // Le voyageur veut de l'inattendu : l'agent doit charger seul le playbook voyage-surprise,
    // puis proposer des expériences rares mais faisables, vérifiées par une recherche.
    slug: "16-surprenez-moi",
    intention: "Le voyageur veut être surpris",
    messages: [
      "Surprenez-moi : dix jours en mars, on est trois amis et on a déjà fait les grandes capitales d'Europe.",
    ],
  },
];

function describeEvent(e: ServerEvent): string | null {
  switch (e.type) {
    case "tool_activity":
      return `- outil \`${e.tool}\` : ${e.label}`;
    case "playbook_loaded":
      return `- **playbook chargé** \`${e.name}\` (${e.origin}) : ${e.reason}`;
    case "sources":
      return `- sources : ${e.sources.map((s) => `[${s.title}](${s.url})`).join(", ")}`;
    case "ui_block":
      if (e.block.kind === "choice") {
        return `- **question à choix** : ${e.block.question} -> ${e.block.options.map((o) => o.label).join(" / ")}${e.block.multiSelect ? " (multiple)" : ""}`;
      }
      if (e.block.kind === "cards") {
        return e.block.cards
          .map(
            (c) =>
              `- **fiche** ${c.name} (${c.country}) - quand : ${c.whenToGo} - photo : ${c.imageUrl ? "oui" : "non"}`,
          )
          .join("\n");
      }
      return `- **récapitulatif présenté** : ${e.block.message}`;
    case "error":
      return `- ERREUR : ${e.message}`;
    default:
      return null;
  }
}

async function run(scenario: Scenario, client: Anthropic, writeTranscript: boolean) {
  const config = loadConfig();
  const conversation = new ConversationStore().create();
  const lines = [
    `# ${scenario.intention}`,
    "",
    `Modèle : \`${config.model}\` - généré le ${new Date().toISOString()}`,
    "",
  ];
  let total = 0;
  let searches = 0;
  let informal = 0;
  let superlatives = 0;
  let narration = 0;
  let jargon = 0;
  /** Le plus grand nombre de questions posées dans un seul tour : la promesse est d'une. */
  let maxQuestions = 0;
  let longestReplyWords = 0;
  let askedChoice = false;
  let shownCards = false;
  let latencies: number[] = [];

  const queue: TurnRequest[] = scenario.messages.map((text) => ({ kind: "text", text }));
  while (queue.length > 0) {
    const request = queue.shift() as TurnRequest;
    const events: ServerEvent[] = [];
    const awaiting = await runTurn(conversation, request, (e) => events.push(e), {
      client,
      config,
    });
    const usage = events.find((e) => e.type === "turn_end");
    // Un nouveau segment de texte commence après chaque outil : on les sépare d'un saut de ligne.
    let reply = "";
    for (const e of events) {
      if (e.type === "text_delta") reply += e.text;
      else if (e.type === "tool_activity" && reply && !reply.endsWith("\n")) reply += "\n";
    }

    lines.push(`## Tour ${conversation.turn}`, "");
    lines.push(
      request.kind === "text"
        ? `**Voyageur** : ${request.text}`
        : `**Voyageur** : (${request.kind}) ${JSON.stringify(request)}`,
      "",
    );
    const trace = events.map(describeEvent).filter(Boolean);
    if (trace.length > 0) lines.push("Décisions de l'agent :", "", ...(trace as string[]), "");
    lines.push(`**Agent** : ${reply.trim() || "(pas de texte)"}`, "");
    // Défauts de ton comptés en code (reply-metrics.ts) : vouvoiement, superlatifs, narration
    // des actions internes, mot « brief », longueur (80 mots maximum, hors fiches et choix).
    const metrics = replyMetrics(reply);
    informal += metrics.informal;
    superlatives += metrics.superlatives;
    narration += metrics.narration;
    jargon += metrics.jargon;
    maxQuestions = Math.max(maxQuestions, metrics.questions);
    longestReplyWords = Math.max(longestReplyWords, metrics.words);
    if (events.some((e) => e.type === "ui_block" && e.block.kind === "choice")) askedChoice = true;
    if (events.some((e) => e.type === "ui_block" && e.block.kind === "cards")) shownCards = true;
    if (usage?.type === "turn_end") {
      const u = usage.usage;
      total += tokenCost(u);
      searches += u.webSearches;
      latencies = [...latencies, u.durationMs];
      lines.push(
        `Mesure : ${u.apiCalls} appels, ${u.inputTokens} tokens d'entrée, ${u.cacheReadTokens} lus en cache, ${u.cacheWriteTokens} écrits en cache, ${u.outputTokens} en sortie, ${u.webSearches} recherche(s), ${u.durationMs} ms, attente : \`${awaiting}\``,
        "",
      );
    }

    // Comme l'application, qui répond 409 à tout message après la validation : un carnet validé
    // clôt la conversation. Sans cet arrêt, le scénario 9 montrait un second récapitulatif,
    // impossible dans l'interface réelle.
    if (conversation.sentAt && request.kind === "brief_confirmation") break;

    // Le voyageur répond au récapitulatif tout de suite, pas après ses messages suivants :
    // mis en fin de file, la validation portait l'identifiant d'un récapitulatif déjà remplacé, et
    // le serveur refusait la réponse. La campagne entière s'arrêtait là.
    if (awaiting === "brief_confirmation" && scenario.sendWhenReady && conversation.pending) {
      conversation.sentAt = new Date().toISOString();
      queue.unshift({
        kind: "brief_confirmation",
        toolUseId: conversation.pending.toolUseId,
        decision: "send",
      });
    }
  }

  const completeness = computeCompleteness(conversation.brief);
  lines.push(
    "## Brief final",
    "",
    "```text",
    summarizeBrief(conversation.brief, completeness),
    "```",
    "",
  );
  if (conversation.brief.nuances.length > 0) {
    lines.push(
      "Nuances conservées :",
      "",
      ...conversation.brief.nuances.map((n) => `- « ${n.quote} » (tour ${n.turn})`),
      "",
    );
  }
  lines.push(
    "## Coût",
    "",
    `Tokens : ${total.toFixed(4)} $ (tarifs Haiku 4.5). Recherches web : ${searches}, facturées en plus à la recherche.`,
    "",
  );
  if (writeTranscript) {
    await writeFile(new URL(`${scenario.slug}.md`, OUT_DIR), lines.join("\n"));
  }
  return {
    scenario,
    completeness,
    total,
    searches,
    informal,
    superlatives,
    narration,
    jargon,
    maxQuestions,
    longestReplyWords,
    askedChoice,
    shownCards,
    latencies,
    sent: conversation.sentAt !== null,
    turns: conversation.turn,
    playbooks: conversation.playbooks,
  };
}

/**
 * Coût attendu d'un passage, sur 24 passages : 0,0263 $ de jetons et environ une recherche web,
 * facturée 0,01 $. L'estimation sert de garde-fou avant de dépenser, pas de promesse : le vrai
 * coût est imprimé à la fin.
 */
const COUT_PAR_PASSAGE = 0.0263 + 0.01;
/** Au-delà, la commande demande un feu vert explicite. Une conversation de démonstration coûte moins. */
const SEUIL_CONFIRMATION = 0.1;

export function estimerCout(scenarios: number, repeat: number): number {
  return scenarios * Math.max(1, repeat) * COUT_PAR_PASSAGE;
}

/**
 * Le tableau de `docs/scenarios/README.md` est la mesure de référence du projet. Il ne s'écrit
 * que sur la liste complète jouée plusieurs fois : un passage unique donne des chiffres, pas des
 * taux, et un sous-ensemble efface les autres scénarios.
 */
export function estReference(passage: {
  only: string | undefined;
  fichier: string | undefined;
  repeat: number;
}): boolean {
  return !passage.only && !passage.fichier && passage.repeat > 1;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY)
    throw new Error("ANTHROPIC_API_KEY manquante (voir .env.example).");
  const only = process.argv[2];
  const source: Scenario[] = SCENARIO_FILE
    ? (JSON.parse(await readFile(SCENARIO_FILE, "utf8")) as Scenario[])
    : SCENARIOS;
  const selected = only ? source.filter((s) => s.slug.startsWith(only)) : source;
  const repeat = Math.max(1, Number(process.env.SCENARIO_REPEAT ?? 1));
  const estimation = estimerCout(selected.length, repeat);
  console.log(
    `${selected.length} scénario(s) x ${repeat} passage(s) = ${selected.length * repeat} appels réels, ` +
      `environ ${estimation.toFixed(2)} $ (jetons + recherches web).`,
  );
  // Une consigne écrite ne suffit pas pour annoncer le coût avant de lancer : trois passages ont
  // déjà été lancés sans prévenir, et le crédit du compte y est passé.
  if (estimation > SEUIL_CONFIRMATION && !process.env.SCENARIO_CONFIRM) {
    console.error(
      `Au-delà de ${SEUIL_CONFIRMATION.toFixed(2)} $, il faut un feu vert : relancez avec ` +
        "SCENARIO_CONFIRM=1 devant la commande.",
    );
    process.exitCode = 1;
    return;
  }
  await mkdir(OUT_DIR, { recursive: true });
  const client = new Anthropic();
  // Sans préchauffe, la compilation de grammaire des outils stricts (~60 s après un changement
  // de schéma) serait mesurée comme de la latence de conversation.
  await warmUp(client, loadConfig());
  // Le modèle n'est pas déterministe : chaque scénario est joué REPEAT fois (défaut 1). Le
  // premier passage donne la transcription ; le tableau des taux agrège tous les passages.
  const echecs: string[] = [];
  const runs = await Promise.all(
    selected.map(async (s) => {
      const all = [];
      for (let i = 0; i < repeat; i++) {
        // Un scénario qui casse ne doit pas emporter les quatorze autres : la campagne coûte
        // trop cher pour être rejouée en entier, et un tableau partiel vaut mieux que rien.
        try {
          all.push(await run(s, client, i === 0));
        } catch (error) {
          echecs.push(`${s.intention} (passage ${i + 1}) : ${(error as Error).message}`);
        }
      }
      return all;
    }),
  );
  // Un scénario dont tous les passages ont échoué n'a pas de ligne : on le dit plus bas
  // plutôt que de laisser un trou silencieux dans le tableau.
  const joues = runs.filter((all) => all.length > 0);
  const results = joues.map((all) => all[0] as NonNullable<(typeof all)[0]>);
  const rate = (all: typeof results, pick: (r: (typeof results)[0]) => boolean) =>
    `${all.filter(pick).length}/${all.length}`;
  const rates =
    repeat > 1
      ? [
          `## Taux sur ${repeat} passages par scénario`,
          "",
          "| Scénario | 4/4 atteint | Carnet validé | Fiche affichée | Question à choix | Recherche web | Tutoiement | Superlatif | Narration | « brief » | 2 questions | Réponse > 80 mots | Coût moyen | Tour le plus long (ms) |",
          "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
          ...joues.map((all) => {
            const first = all[0] as (typeof results)[0];
            const cost = all.reduce((sum, r) => sum + r.total, 0) / all.length;
            const longest = Math.max(...all.flatMap((r) => r.latencies));
            return `| ${first.scenario.intention} | ${rate(all, (r) => r.completeness.ready)} | ${rate(all, (r) => r.sent)} | ${rate(all, (r) => r.shownCards)} | ${rate(all, (r) => r.askedChoice)} | ${rate(all, (r) => r.searches > 0)} | ${rate(all, (r) => r.informal > 0)} | ${rate(all, (r) => r.superlatives > 0)} | ${rate(all, (r) => r.narration > 0)} | ${rate(all, (r) => r.jargon > 0)} | ${rate(all, (r) => r.maxQuestions > 1)} | ${rate(all, (r) => r.longestReplyWords > 80)} | ${cost.toFixed(4)} $ | ${longest} |`;
          }),
          "",
          `Total de tous les passages : ${joues
            .flat()
            .reduce((sum, r) => sum + r.total, 0)
            .toFixed(
              4,
            )} $ en tokens, ${joues.flat().reduce((sum, r) => sum + r.searches, 0)} recherche(s) web.`,
          "",
          ...(echecs.length > 0
            ? [`Passages en échec, non comptés : ${echecs.join(" ; ")}.`, ""]
            : []),
        ]
      : [];

  const index = [
    "# Scénarios rejoués sur l'agent réel",
    "",
    "Généré par `npm run scenarios`. Chaque ligne renvoie à la transcription complète.",
    "",
    ...rates,
    ...(repeat > 1 ? ["## Premier passage (transcriptions)", ""] : []),
    "| Scénario | Tours | Obligatoires | Carnet validé | Playbook | Recherches | Question à choix | Tutoiement | Durée par tour (ms) | Coût tokens |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...results.map(
      (r) =>
        `| [${r.scenario.intention}](${r.scenario.slug}.md) | ${r.turns} | ${r.completeness.mandatoryOk}/4 | ${r.sent ? "oui" : "non"} | ${r.playbooks.map((p) => `${p.name} (${p.origin})`).join(", ") || "-"} | ${r.searches} | ${r.askedChoice ? "oui" : "non"} | ${r.informal} | ${r.latencies.join(" / ")} | ${r.total.toFixed(4)} $ |`,
    ),
    "",
    `Total : ${results.reduce((sum, r) => sum + r.total, 0).toFixed(4)} $ en tokens, ${results.reduce((sum, r) => sum + r.searches, 0)} recherche(s) web facturées en plus. Durées mesurées côté serveur, du message reçu à la fin du tour.`,
    "",
  ];
  // Le tableau de référence ne s'écrit que sur une vraie mesure : liste complète et plusieurs
  // passages. Un passage unique l'écrasait avec des chiffres qui ne sont pas des taux, et le
  // dépôt perdait la mesure à trois passages, comme c'est arrivé deux fois.
  const reference = estReference({ only, fichier: SCENARIO_FILE, repeat });
  if (reference) await writeFile(new URL("README.md", OUT_DIR), index.join("\n"));
  else
    console.log(
      "\nTableau de référence non réécrit : il demande la liste complète et SCENARIO_REPEAT > 1.",
    );
  console.log(index.join("\n"));
}

// Ne se lance que si le fichier est exécuté directement. Un simple import, depuis un test par
// exemple, déclencherait sinon toute la campagne d'appels payants.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();

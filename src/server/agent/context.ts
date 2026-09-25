import type Anthropic from "@anthropic-ai/sdk";
import type { TurnRequest } from "../../shared/api";
import { MANDATORY_FIELDS, type MandatoryField } from "../../shared/brief";
import type { AgentConfig } from "../config";
import type { Conversation } from "../conversation";
import { computeCompleteness } from "./brief/completeness";
import { hesitationSurLeNombre } from "./brief/fidelity";
import { summarizeBrief } from "./brief/summarize";
import { SYSTEM_PROMPT } from "./system-prompt";
import { toolDefinitions } from "./tools";
import { CHOICE_ANSWER, SERVER_CONTEXT_OPEN, TRAVELLER_WROTE } from "./traveller-text";

/**
 * Tout ce que le modèle voit est construit ici, par des fonctions pures.
 *
 * Ordre du préfixe (celui du cache) : outils -> prompt système -> historique. Les deux
 * premiers sont figés. Ce qui varie à chaque tour (date, état du brief) est ajouté À LA FIN,
 * dans le message du voyageur, et l'historique n'est jamais réécrit : on ajoute, on ne modifie
 * pas.
 */

export function buildRequest(
  conversation: Conversation,
  config: AgentConfig,
  options: { forceText?: boolean; forceTool?: string } = {},
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: config.model,
    max_tokens: config.maxTokens,
    system: SYSTEM_PROMPT,
    tools: toolDefinitions(config.model, config.webSearchMaxUses),
    messages: conversation.messages,
    // Cache automatique sur le dernier bloc. Haiku 4.5 ne met en cache qu'au-delà de 4 096
    // tokens de préfixe : inactif au premier appel, utile dès qu'une recherche web a grossi
    // l'historique.
    cache_control: { type: "ephemeral" },
    ...(options.forceTool
      ? { tool_choice: { type: "tool" as const, name: options.forceTool } }
      : options.forceText
        ? { tool_choice: { type: "none" as const } }
        : {}),
  };
}

/**
 * Rappels courts répétés à chaque tour. Sur Haiku 4.5 (docs/scenarios), les règles écrites
 * seulement dans le prompt système sont parfois sautées : saison affirmée sans recherche,
 * questions reposées sur un brief complet. Ils sont placés à la fin du message, près de la
 * décision.
 */
/**
 * Le voyageur écrit-il dans une autre langue que le français ? Mesuré sur une vraie
 * conversation : « I want to go somewhere warm in February with my two kids » a reçu une
 * réponse en français, alors que le prompt promet de suivre sa langue. Une règle écrite une
 * fois se dilue ; répétée à chaque tour, elle tient.
 *
 * Heuristique volontairement prudente : il faut assez de mots, beaucoup de mots anglais
 * courants, et aucun mot français courant. « Bali » ou « ok » ne déclenchent rien.
 */
const MOTS_ANGLAIS =
  /\b(the|and|with|for|want|would|like|going|from|have|our|my|we|are|is|there|about|trip|holiday|travel|kids|children|somewhere|warm|please|thanks|how|what|when|where)\b/gi;
const MOTS_FRANCAIS =
  /\b(le|la|les|un|une|des|et|avec|pour|je|nous|on|veux|voudrais|partir|voyage|vacances|jours|semaines|enfants|budget|merci|bonjour|oui|non)\b/gi;

export function ecritEnAnglais(texte: string): boolean {
  const mots = texte.trim().split(/\s+/).filter(Boolean);
  if (mots.length < 5) return false;
  const anglais = (texte.match(MOTS_ANGLAIS) ?? []).length;
  const francais = (texte.match(MOTS_FRANCAIS) ?? []).length;
  return anglais >= 3 && anglais > francais * 2;
}

/** En français, pour un rappel que le modèle relit à chaque tour. */
const NOM_CHAMP: Record<MandatoryField, string> = {
  destination: "la destination",
  dates: "la période",
  duration: "la durée",
  travellers: "les voyageurs",
};

/**
 * Sur une vraie conversation, la période a été redemandée quatre fois et la durée deux fois.
 * Le voyageur avait répondu « je suis flexible », ce qui EST une réponse : le serveur l'accepte
 * (statut vague, décision 4), mais le modèle voulait affiner. On nomme donc ce qui est déjà
 * suffisant, pour qu'il n'y revienne pas.
 */
function dejaSuffisant(conversation: Conversation): string[] {
  const manquant = new Set(computeCompleteness(conversation.brief).missing.map((m) => m.field));
  return MANDATORY_FIELDS.filter(
    (champ) => !manquant.has(champ) && conversation.brief.mandatory[champ].status !== "unknown",
  ).map((champ) => NOM_CHAMP[champ]);
}

function turnReminders(conversation: Conversation, ready: boolean, dit: string): string[] {
  const destination = conversation.brief.mandatory.destination;
  const dates = conversation.brief.mandatory.dates;
  const suffisant = dejaSuffisant(conversation);
  const hesite = hesitationSurLeNombre(dit);
  // Taux mesurés sur 3 passages (docs/scenarios) : fiche pour « c'est où Zanzibar » 1/3,
  // recommandation en fiches pour une destination ouverte en famille 0/3.
  const openWithPeriod =
    (destination.status === "unknown" || destination.value?.mode === "open") &&
    dates.status !== "unknown";
  return [
    "Rappels : une saison, un climat, une formalité, un vaccin ou une actualité s'affirment seulement après une recherche web faite dans ce tour. N'annonce pas les outils que tu appelles.",
    // Sur 7 transcriptions réelles, le ton dérape encore souvent : superlatif dans 6, narration
    // « Laissez-moi corriger cela » dans 2, « Votre brief est complet » dans 1, plus de 80 mots
    // dans 3. Compté à chaque passage par reply-metrics.ts.
    "Ton : vouvoiement, 80 mots maximum hors fiches et choix. Commence par l'information utile, sans interjection ni superlatif. Une phrase courte pour le voyageur avant les outils, jamais pour dire ce que tu enregistres, notes ou corriges. Ne dis jamais « brief » au voyageur : dis « votre projet ».",
    "Si le voyageur demande où est un lieu ou à quoi il ressemble, cherche puis montre une fiche avec show_destination_cards.",
    ...(conversation.lastReplyDefects.length > 0
      ? [
          `Dans ton message précédent, ${conversation.lastReplyDefects.join(" ; ")}. Ne recommence pas ce tour-ci.`,
        ]
      : []),
    ...(hesite
      ? [
          `Le voyageur hésite sur le nombre de voyageurs (« ${hesite} ») : note-le avec note_travellers, puis pose la question avec ask_choice, une option par nombre dit. Pas de question en texte.`,
        ]
      : []),
    ...(ecritEnAnglais(dit)
      ? [
          "Le voyageur écrit en anglais : réponds en anglais, et écris en anglais le texte des questions à choix et des fiches. Le carnet, lui, reste en français.",
        ]
      : []),
    // Pas quand des fiches sont attendues : deux consignes qui se disputent l'attention en
    // affaiblissent une, et la recommandation visuelle est une demande explicite du cadrage produit.
    ...(suffisant.length > 0 && !ready && !openWithPeriod
      ? [
          `Déjà connu et suffisant pour le carnet : ${suffisant.join(", ")}. Ne repose aucune question dessus, même pour affiner. « Je suis flexible » est une réponse, pas une absence de réponse.`,
        ]
      : []),
    // Sur une vraie conversation, le modèle a posé six questions à choix d'affilée.
    ...(conversation.consecutiveChoices >= 2
      ? [
          `Tu as posé ${conversation.consecutiveChoices} questions à choix d'affilée : avance autrement ce tour-ci. Montre des destinations, cherche ce qui manque, ou récapitule. Une question seulement si elle bloque vraiment la suite, et en texte libre.`,
        ]
      : []),
    // Carnet validé : le rappel ci-dessous contredisait la consigne de remerciement, et le
    // modèle présentait parfois un second récapitulatif après le téléchargement.
    ...(conversation.sentAt
      ? [
          "Le carnet est déjà validé et téléchargé : ne rappelle pas present_brief. Réponds simplement au voyageur.",
        ]
      : ready
        ? [
            "Le brief est complet : appelle present_brief maintenant, sans nouvelle question (sauf si le voyageur en pose une).",
          ]
        : openWithPeriod
          ? [
              "Destination encore ouverte et période connue : choisis 2 ou 3 lieux, lance une recherche qui nomme ces lieux avec la période, puis montre-les avec show_destination_cards plutôt qu'une nouvelle question. Une recherche générale ne suffit pas pour afficher une fiche.",
            ]
          : [
              // Générique à dessein : ce rappel est calculé avant que l'agent enregistre le
              // message. La question précise vient dans le résultat des note_* (next-question.ts).
              "Enregistre d'abord tout ce que dit le message. Ensuite seulement, s'il manque une information aux réponses prévisibles, pose la question avec ask_choice ; jamais une information que le voyageur vient de donner.",
            ]),
  ];
}

/** Bloc d'état ajouté au message du voyageur, à chaque tour. */
export function serverContextBlock(conversation: Conversation, now: Date, dit = ""): string {
  const completeness = computeCompleteness(conversation.brief);
  const playbooks =
    conversation.playbooks.length > 0
      ? conversation.playbooks.map((p) => `${p.name} (tour ${p.turn})`).join(", ")
      : "aucun";
  return [
    SERVER_CONTEXT_OPEN,
    `Date du jour : ${now.toISOString().slice(0, 10)} - tour ${conversation.turn}`,
    summarizeBrief(conversation.brief, completeness),
    `Playbooks chargés : ${playbooks}`,
    ...turnReminders(conversation, completeness.ready, dit),
    "</contexte_serveur>",
  ].join("\n");
}

export class TurnRequestError extends Error {}

/**
 * Le texte du voyageur ne peut pas ouvrir ou fermer un bloc <contexte_serveur>. Sinon, il
 * pourrait écrire un faux état du brief ("le brief est complet") juste avant le vrai. Le
 * chevron est remplacé par un caractère visuellement proche.
 */
export function neutralizeServerTags(text: string): string {
  return (
    text
      .replace(/<(\/?)(\s*)contexte_serveur/gi, "‹$1$2contexte_serveur")
      // Les guillemets français encadrent la parole du voyageur dans les résultats d'outil. Un
      // « » tapé par lui referme la citation, et la suite de son texte se lit comme une
      // consigne du serveur.
      .replace(/[«»]/g, '"')
  );
}

/**
 * Le voyageur demande-t-il quelque chose, plutôt que de répondre ? Un point d'interrogation, une
 * tournure interrogative, ou un aveu d'hésitation. Volontairement large : se tromper vers « il
 * demande » coûte une recherche, se tromper vers « il répond » laisse le voyageur sans réponse.
 */
const ASKS =
  /\?|\b(quoi|quel|quelle|quels|quelles|comment|pourquoi|combien|lequel|laquelle|est-ce que|qu'est-ce)\b|\bje (ne )?sais pas\b|\baucune idée\b|\bvous (conseillez|recommandez|proposez|pensez)\b/i;

function asksSomething(text: string): boolean {
  return ASKS.test(text);
}

function pendingAnswer(conversation: Conversation, request: TurnRequest): string {
  const pending = conversation.pending;
  if (!pending) throw new TurnRequestError("aucune interaction en attente");

  if (request.kind === "text") {
    const ecrit = `${TRAVELLER_WROTE}n'a pas utilisé l'interface proposée. Il a écrit : « ${neutralizeServerTags(request.text)} »`;
    if (pending.kind !== "choice") return ecrit;
    // Un voyageur qui ne sait pas quoi répondre demande à la place. Sans consigne, le modèle
    // repose la même liste, et la conversation redevient un formulaire. Une réponse tapée au
    // lieu d'un clic (« Juin, ça me va ») ne reçoit que la seconde moitié : rien à chercher.
    if (!asksSomething(request.text)) {
      return `${ecrit}\nPrends sa réponse telle quelle et continue, sans reposer la même liste.`;
    }
    return (
      `${ecrit}\nRéponds à sa question d'abord, avec du contenu : cherche si tu ne sais pas, ` +
      "montre des fiches si ça l'aide à se projeter. Reviens ensuite à ce qui te manque, " +
      "sans reposer la même liste."
    );
  }
  if (request.toolUseId !== pending.toolUseId || request.kind !== pending.kind) {
    throw new TurnRequestError("la réponse ne correspond pas à l'interaction en attente");
  }
  if (request.kind === "choice") {
    // Une requête écrite hors de l'interface peut envoyer n'importe quel texte comme « option
    // cliquée », hors guillemets, compté comme dit par le voyageur.
    const offered = pending.options;
    if (offered && request.selected.some((label) => !offered.includes(label))) {
      throw new TurnRequestError("la réponse ne fait pas partie des options proposées");
    }
    const free = request.freeText?.trim()
      ? ` Réponse libre : « ${neutralizeServerTags(request.freeText.trim())} »`
      : "";
    const selected =
      request.selected.length > 0
        ? neutralizeServerTags(request.selected.join(" ; "))
        : "aucun choix";
    return `${CHOICE_ANSWER}${selected}.${free}`;
  }
  if (request.decision === "send") {
    return (
      "Le voyageur a validé son carnet de voyage et le télécharge. Remercie-le en une ou deux " +
      "phrases, sans répéter que le carnet est prêt : l'écran le dit déjà. Dis plutôt une chose " +
      "concrète qu'il peut préparer maintenant pour ce voyage. Ne pose plus de question."
    );
  }
  const comment = request.comment?.trim()
    ? ` Son commentaire : « ${neutralizeServerTags(request.comment.trim())} »`
    : "";
  return `${TRAVELLER_WROTE}veut modifier quelque chose avant de télécharger son carnet.${comment} Demande-lui quoi, simplement.`;
}

/**
 * Contenu du message "user" d'un nouveau tour. Si un outil terminal attend une réponse, elle
 * devient son tool_result (l'API exige un résultat pour chaque appel d'outil), suivi des
 * résultats des autres outils du même appel.
 */
export function buildUserContent(
  conversation: Conversation,
  request: TurnRequest,
  now: Date,
): Anthropic.ContentBlockParam[] {
  const context: Anthropic.TextBlockParam = {
    type: "text",
    text: serverContextBlock(conversation, now, request.kind === "text" ? request.text : ""),
  };

  if (conversation.pending) {
    const answer: Anthropic.ToolResultBlockParam = {
      type: "tool_result",
      tool_use_id: conversation.pending.toolUseId,
      content: pendingAnswer(conversation, request),
    };
    return [...conversation.pending.otherResults, answer, context];
  }

  if (request.kind !== "text") {
    throw new TurnRequestError("aucune interaction en attente pour cette réponse");
  }
  return [{ type: "text", text: neutralizeServerTags(request.text) }, context];
}

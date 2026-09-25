import Anthropic from "@anthropic-ai/sdk";
import type { TurnRequest } from "../../shared/api";
import type { TravelBrief } from "../../shared/brief";
import type { Awaiting, ServerEvent, Source, TurnUsage } from "../../shared/events";
import type { AgentConfig } from "../config";
import { type Conversation, expiresAtOf, MAX_TURNS_PER_CONVERSATION, trace } from "../conversation";
import { computeCompleteness } from "./brief/completeness";
import { buildRequest, buildUserContent } from "./context";
import { defautsDeTon } from "./reply-metrics";
import {
  createCoulissesFilter,
  createVisibleTextFilter,
  retirerCoulisses,
  stripForbiddenText,
} from "./text-guard";
import { TOOLS_BY_NAME } from "./tools";
import { BRIEF_TOOL_NAMES, briefGuidance, doitPoserLaQuestionUtile } from "./tools/brief-tools";
import { findLeakedSyntax, malformedInput, type ToolOutcome, unreadableInput } from "./tools/types";
import { classifyTurnError } from "./turn-error";

/**
 * Un tour de conversation. Le modèle décide quoi faire ; le code tient les invariants :
 * - au plus `maxModelCalls` appels, le dernier forcé en texte (le voyageur récupère la main) ;
 * - un outil terminal (question à choix, récapitulatif) arrête le tour ;
 * - après un outil terminal, seuls les outils note_* du même appel s'exécutent ;
 * - en cas d'erreur d'API, l'état de la conversation revient à celui d'avant le tour.
 */

export interface LoopDeps {
  client: Anthropic;
  config: AgentConfig;
  now?: () => Date;
  /** Coupé quand le voyageur arrête la réponse ou ferme l'onglet : on cesse d'appeler le modèle. */
  signal?: AbortSignal;
}

/** Outils qui arrêtent le tour pour attendre le voyageur : le texte qui les précède compte. */
/**
 * Questions à choix acceptées d'affilée. Au-delà, le voyageur remplit un formulaire déguisé.
 * Sur une vraie conversation, le modèle a posé six questions de suite avant la moindre
 * proposition.
 */
const MAX_CHOICES_IN_A_ROW = 3;

const WAITS_FOR_TRAVELLER = new Set(["ask_choice", "present_brief"]);

function collectSources(message: Anthropic.Message): Source[] {
  const seen = new Map<string, Source>();
  for (const block of message.content) {
    if (block.type !== "text" || !block.citations) continue;
    for (const c of block.citations) {
      if (c.type === "web_search_result_location" && !seen.has(c.url)) {
        seen.set(c.url, { url: c.url, title: c.title ?? c.url });
      }
    }
  }
  return [...seen.values()];
}

/**
 * L'agent vient-il de poser une question au voyageur ? Sur une vraie conversation (tour 10,
 * 3 appels, 61 s), le brief est devenu complet et l'agent a demandé le budget. Le serveur a
 * quand même forcé le récapitulatif dans le même tour. Le voyageur a lu une question, puis une
 * minute plus tard un « vous voilà prêt ». Sa question d'abord ; le rappel du contexte serveur
 * représentera le carnet au tour suivant.
 */
/** Le voyageur n'a pas encore de lieu fixé : c'est le moment des fiches, pas des questions. */
function destinationOuverte(brief: TravelBrief): boolean {
  const slot = brief.mandatory.destination;
  return slot.status === "unknown" || slot.value === null || slot.value.mode === "open";
}

function finitParUneQuestion(message: Anthropic.Message): boolean {
  const texte = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  // La question n'est pas toujours le dernier caractère : « Combien de temps ? (pour affiner) ».
  // On regarde la fin du message, pas sa toute dernière lettre.
  return texte.slice(-FIN_DE_MESSAGE).includes("?");
}

/** Longueur de la fin de message examinée pour y trouver une question. */
const FIN_DE_MESSAGE = 100;

export async function runTurn(
  conversation: Conversation,
  request: TurnRequest,
  emit: (event: ServerEvent) => void,
  { client, config, now = () => new Date(), signal }: LoopDeps,
): Promise<Awaiting> {
  const startedAt = Date.now();
  // Le seuil du carnet complet est décidé en code : si le brief DEVIENT complet pendant ce tour et
  // que le modèle termine sans récapitulatif, le serveur le demande. Cas réel : "Vietnam, 3
  // semaines en novembre, à deux" complet 4/4 sans carnet présenté en fin de tour.
  const readyAtStart = computeCompleteness(conversation.brief).ready;
  /** Le texte du modèle avant le filtre des coulisses : ses défauts de ton lui sont renvoyés. */
  let texteEcrit = "";
  let forceToolNext: string | undefined;
  const snapshot = {
    briefOffered: conversation.briefOffered,
    messages: conversation.messages.length,
    brief: conversation.brief,
    pending: conversation.pending,
    playbooks: conversation.playbooks.length,
    nudgedPlaybooks: new Map(conversation.nudgedPlaybooks),
    turn: conversation.turn,
  };

  conversation.turn += 1;
  const turn = conversation.turn;
  const content = buildUserContent(conversation, request, now());
  conversation.pending = null;
  conversation.messages.push({ role: "user", content });

  const usage: TurnUsage = {
    model: config.model,
    apiCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    webSearches: 0,
    firstTextMs: null,
    durationMs: 0,
  };
  const stopReasons: string[] = [];
  let awaiting: Awaiting =
    request.kind === "brief_confirmation" && request.decision === "send" ? "done" : "text";

  try {
    for (let call = 1; call <= config.maxModelCalls; call++) {
      const forceText = call === config.maxModelCalls;
      const forceTool = forceToolNext;
      forceToolNext = undefined;
      // Un tour coupé ne doit pas continuer à payer des appels : le signal traverse jusqu'au SDK,
      // et le `catch` du tour remet la conversation dans son état d'avant.
      signal?.throwIfAborted();
      const stream = client.messages.stream(
        buildRequest(conversation, config, { forceText, forceTool }),
        signal ? { signal } : undefined,
      );
      const visible = createVisibleTextFilter();
      const coulisses = createCoulissesFilter();
      const emitText = (text: string) => {
        if (!text) return;
        usage.firstTextMs ??= Date.now() - startedAt;
        // Ce que le voyageur lit vraiment, gardé pour mesurer le ton du tour et le renvoyer au
        // modèle au tour suivant. Un rappel générique se dilue ; son propre défaut, non.
        emit({ type: "text_delta", text });
      };
      // Sans ça, chaque appel intermédiaire ajoute sa phrase d'annonce (« Voici trois
      // destinations », « Laissez-moi vous montrer... »), empilées avant la vraie réponse. Le
      // premier appel du tour s'affiche en direct : il rassure pendant l'attente. Les suivants
      // attendent la fin de l'appel ; leur texte ne s'affiche que s'il ne sert pas seulement à
      // préparer des outils.
      const live = call === 1;
      let held = "";
      stream.on("text", (text) => {
        const lu = visible.push(text);
        texteEcrit += lu;
        const clean = coulisses.push(lu);
        if (live) emitText(clean);
        else held += clean;
      });
      stream.on("contentBlock", (block) => {
        if (block.type === "server_tool_use" && block.name === "web_search") {
          const query = (block.input as { query?: string }).query ?? "";
          emit({ type: "tool_activity", tool: "web_search", label: `Recherche : ${query}` });
        } else if (block.type === "tool_use") {
          // Le libellé vient de l'entrée brute du modèle, avant tout garde-fou. Si l'entrée
          // fuite, le libellé reste générique.
          const tool = TOOLS_BY_NAME.get(block.name);
          let label = block.name;
          try {
            label = !tool
              ? block.name
              : findLeakedSyntax(block.input)
                ? "Préparation"
                : tool.activityLabel(block.input);
          } catch {
            // Un libellé d'affichage ne doit jamais faire échouer un tour : une entrée de forme
            // inattendue lèverait une exception dans l'écouteur du flux, et tout le tour serait
            // en erreur.
            label = "Préparation";
          }
          emit({ type: "tool_activity", tool: block.name, label });
        }
      });
      let message: Awaited<ReturnType<typeof stream.finalMessage>>;
      try {
        message = await stream.finalMessage();
      } catch (error) {
        // JSON d'entrée d'outil invalide écrit par le modèle : à la fin du bloc, le SDK décode
        // l'entrée et le flux échoue avant finalMessage(), avec tout le tour en erreur. Le
        // message reçu jusque-là reste dans `currentMessage` : on le reprend, l'appel cassé
        // recevra une erreur d'outil et le modèle pourra le réécrire. Le SDK enveloppe l'erreur
        // dans une AnthropicError : la SyntaxError est dans `cause`, prouvé par loop.sdk.test.ts
        // avec le vrai SDK.
        const jsonError =
          error instanceof SyntaxError ||
          (error instanceof Error && (error as { cause?: unknown }).cause instanceof SyntaxError);
        const partial = jsonError ? stream.currentMessage : undefined;
        if (!partial?.content.some((b) => b.type === "tool_use")) throw error;
        message = { ...partial, stop_reason: "tool_use" } as unknown as typeof message;
      }
      // Un bloc d'outil dont l'entrée ne se décode pas garde une entrée vide dans l'historique
      // et reçoit une erreur d'outil, comme toute autre entrée malformée.
      const unreadable = new Set<string>();
      for (const [i, block] of message.content.entries()) {
        if (block.type !== "tool_use") continue;
        try {
          void block.input;
        } catch {
          unreadable.add(block.id);
          const emptied = { type: "tool_use", id: block.id, name: block.name, input: {} };
          message.content[i] = emptied as unknown as (typeof message.content)[number];
        }
      }
      const finVisible = visible.flush();
      texteEcrit += finVisible;
      const tail = coulisses.push(finVisible) + coulisses.flush();
      if (live) {
        emitText(tail);
      } else {
        // Seule l'annonce de fiches est retenue : les fiches montrent ce qu'elle allait dire.
        // Une réponse suivie d'une simple note reste affichée : masquer sur la seule liste
        // d'outils cachait une vraie réponse, « un visa n'est pas nécessaire ».
        const toolNames = message.content.flatMap((b) => (b.type === "tool_use" ? [b.name] : []));
        const announcesCards =
          message.stop_reason === "tool_use" &&
          toolNames.includes("show_destination_cards") &&
          !toolNames.some((name) => WAITS_FOR_TRAVELLER.has(name));
        if (!announcesCards) emitText(held + tail);
      }
      if (coulisses.retirees > 0) {
        // Retirées aussi du texte stocké, avant l'ajout à l'historique : le modèle ne revoit pas
        // sa tournure, et ne la reprend pas au tour suivant.
        for (const block of message.content) {
          if (block.type === "text") block.text = retirerCoulisses(block.text);
        }
        conversation.coulissesRetirees += coulisses.retirees;
        void trace({
          conversationId: conversation.id,
          turn,
          at: now().toISOString(),
          kind: "coulisses_retirees",
          count: coulisses.retirees,
        });
      }
      if (visible.leaked) {
        // Le texte stocké est nettoyé AVANT d'entrer dans l'historique (ajout, pas réécriture),
        // pour que le modèle ne réapprenne pas la forme fautive au tour suivant.
        for (const block of message.content) {
          if (block.type === "text") block.text = stripForbiddenText(block.text);
        }
        void trace({
          conversationId: conversation.id,
          turn,
          at: now().toISOString(),
          kind: "text_leak",
        });
      }

      usage.apiCalls += 1;
      usage.inputTokens += message.usage.input_tokens;
      usage.outputTokens += message.usage.output_tokens;
      usage.cacheReadTokens += message.usage.cache_read_input_tokens ?? 0;
      usage.cacheWriteTokens += message.usage.cache_creation_input_tokens ?? 0;
      usage.webSearches += message.usage.server_tool_use?.web_search_requests ?? 0;
      stopReasons.push(message.stop_reason ?? "null");

      // L'API refuse un bloc de texte vide dans l'historique : « text content blocks must be
      // non-empty », vu en campagne sur un tour qui a ensuite échoué en 400. Le modèle ouvre
      // parfois un bloc de texte sans rien écrire avant son appel d'outil. On ne garde pas ce
      // vide ; le reste du message part inchangé.
      conversation.messages.push({
        role: "assistant",
        content: message.content.filter((b) => b.type !== "text" || b.text.trim() !== ""),
      });
      const sources = collectSources(message);
      if (sources.length > 0) emit({ type: "sources", sources });

      if (message.stop_reason === "pause_turn") continue; // recherche serveur à reprendre

      const toolUses = message.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      if (message.stop_reason !== "tool_use") {
        // Un appel d'outil peut être coupé (max_tokens) ou interrompu (refusal). L'API exige un
        // résultat pour chaque tool_use : sans lui, le tour suivant répondrait 400.
        if (toolUses.length > 0) {
          conversation.messages.push({
            role: "user",
            content: toolUses.map((t) => ({
              type: "tool_result" as const,
              tool_use_id: t.id,
              is_error: true,
              content:
                "Appel interrompu avant la fin, non exécuté. Si l'information compte, rappelle l'outil avec une entrée plus courte.",
            })),
          });
        }
        if (message.stop_reason === "refusal") {
          emit({
            type: "error",
            message: "Je ne peux pas répondre à ce message. Essayez de le formuler autrement.",
            // Refus du modèle : le même message repartirait au même endroit.
            retry: false,
            cause: "refusal",
          });
          break;
        }
        if (message.stop_reason === "max_tokens" && toolUses.length > 0) continue;
        if (
          message.stop_reason === "end_turn" &&
          !conversation.briefOffered &&
          call < config.maxModelCalls &&
          conversation.pending === null &&
          !finitParUneQuestion(message) &&
          computeCompleteness(conversation.brief).ready
        ) {
          conversation.messages.push({
            role: "user",
            content: [
              {
                type: "text",
                text: "<contexte_serveur>\nLe brief est complet : présente-le au voyageur avec present_brief, en une ou deux phrases, sans poser de question.\n</contexte_serveur>",
              },
            ],
          });
          forceToolNext = "present_brief";
          continue;
        }
        // Le tour se termine en texte : la série de questions à choix s'arrête ici.
        conversation.consecutiveChoices = 0;
        break; // end_turn, stop_sequence, max_tokens sans outil : on rend la main
      }
      const results: Anthropic.ToolResultBlockParam[] = [];
      let terminal: {
        toolUseId: string;
        awaiting: "choice" | "brief_confirmation";
        options?: string[];
      } | null = null;

      for (const toolUse of toolUses) {
        const tool = TOOLS_BY_NAME.get(toolUse.name);
        const leak = findLeakedSyntax(toolUse.input);
        const outcome: ToolOutcome = !tool
          ? { kind: "result" as const, isError: true, content: `Outil inconnu : ${toolUse.name}` }
          : unreadable.has(toolUse.id)
            ? unreadableInput()
            : leak
              ? malformedInput(leak)
              : terminal && !BRIEF_TOOL_NAMES.has(tool.definition.name)
                ? {
                    kind: "result" as const,
                    isError: true,
                    content: "Un seul élément interactif par tour : cet appel est ignoré.",
                  }
                : // Le cadrage produit demande une recommandation visuelle quand la destination est
                  // ouverte. Mesuré : l'agent cherche « Bénin Laos Cambodge mai », puis pose une
                  // question au lieu de montrer les fiches. Il a pourtant tout ce qu'il faut.
                  tool.definition.name === "ask_choice" &&
                    usage.webSearches > 0 &&
                    destinationOuverte(conversation.brief) &&
                    conversation.brief.mandatory.dates.status !== "unknown"
                  ? {
                      kind: "result" as const,
                      isError: true,
                      content:
                        "Refusé : tu viens de chercher, tu as de quoi recommander. Montre 2 ou 3 " +
                        "lieux avec show_destination_cards, en disant pourquoi chacun, à cette " +
                        "période, pour ces voyageurs.",
                    }
                  : // Sur une vraie conversation, le modèle a posé six questions à choix
                    // d'affilée. Le rappel textuel n'a pas suffi, le code tranche : après trois
                    // tours de suite, la quatrième question passe par du texte libre.
                    tool.definition.name === "ask_choice" &&
                      conversation.consecutiveChoices >= MAX_CHOICES_IN_A_ROW
                    ? {
                        kind: "result" as const,
                        isError: true,
                        content: `Refusé : ${conversation.consecutiveChoices} questions à choix d'affilée. Ce tour-ci, avance autrement : montre des destinations, cherche ce qui manque, ou pose ta question en texte libre dans ta réponse.`,
                      }
                    : // Le brief vient de devenir complet : présenter le carnet passe avant une
                      // question. Cas réel : Vietnam 4/4, question à choix sur les envies, carnet
                      // jamais présenté.
                      tool.definition.name === "ask_choice" &&
                        !readyAtStart &&
                        computeCompleteness(conversation.brief).ready
                      ? {
                          kind: "result" as const,
                          isError: true,
                          content:
                            "Refusé : le brief vient d'être complété. Appelle present_brief maintenant ; le voyageur pourra encore ajouter ses envies avant de télécharger son carnet.",
                        }
                      : await tool.run(toolUse.input, {
                          conversation,
                          emit,
                          toolUseId: toolUse.id,
                        });

        void trace({
          conversationId: conversation.id,
          turn,
          at: now().toISOString(),
          kind: "tool_call",
          tool: toolUse.name,
          input: toolUse.input,
          isError: outcome.kind === "result" && outcome.isError === true,
        });

        if (outcome.kind === "terminal") {
          terminal = {
            toolUseId: toolUse.id,
            awaiting: outcome.awaiting,
            options: outcome.options,
          };
        } else {
          results.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            // Un refus d'outil est une affaire interne : le voyageur ne doit jamais lire « le
            // serveur préfère une recherche plus ciblée, je m'excuse pour la complexité
            // technique ».
            content: outcome.isError
              ? `${outcome.content} Ne mentionne pas ce refus au voyageur : corrige et continue.`
              : outcome.content,
            ...(outcome.isError ? { is_error: true } : {}),
          });
        }
      }

      // Une seule consigne de suite par appel, sur l'état du brief après TOUS les note_* du lot.
      const lastBriefResult = results.findLast((r) =>
        toolUses.some((t) => t.id === r.tool_use_id && BRIEF_TOOL_NAMES.has(t.name)),
      );
      if (!terminal && lastBriefResult && !lastBriefResult.is_error) {
        const guidance = briefGuidance(conversation.brief, conversation.usefulAsked);
        // Comptée seulement quand elle part vraiment : sinon un tour où le brief devient complet
        // consommerait la question sans l'avoir posée.
        if (doitPoserLaQuestionUtile(conversation.brief, conversation.usefulAsked)) {
          conversation.usefulAsked += 1;
        }
        if (guidance.length > 0) {
          lastBriefResult.content = [lastBriefResult.content, ...guidance].join("\n");
        }
      }

      if (terminal) {
        conversation.consecutiveChoices =
          terminal.awaiting === "choice" ? conversation.consecutiveChoices + 1 : 0;
        if (terminal.awaiting === "brief_confirmation") conversation.briefOffered = true;
        conversation.pending = {
          toolUseId: terminal.toolUseId,
          kind: terminal.awaiting,
          otherResults: results,
          ...(terminal.options ? { options: terminal.options } : {}),
        };
        awaiting = terminal.awaiting;
        break;
      }
      conversation.messages.push({ role: "user", content: results });
    }
  } catch (error) {
    // Retour à l'état d'avant le tour : l'historique reste valide pour l'API.
    conversation.messages.length = snapshot.messages;
    conversation.brief = snapshot.brief;
    conversation.pending = snapshot.pending;
    conversation.briefOffered = snapshot.briefOffered;
    conversation.playbooks.length = snapshot.playbooks;
    conversation.nudgedPlaybooks = snapshot.nudgedPlaybooks;
    conversation.turn = snapshot.turn;
    emit({
      type: "brief_updated",
      brief: conversation.brief,
      completeness: computeCompleteness(conversation.brief),
    });
    const detail =
      error instanceof Anthropic.APIError ? `${error.status} ${error.message}` : String(error);
    void trace({
      conversationId: conversation.id,
      turn,
      at: now().toISOString(),
      kind: "error",
      message: detail,
    });
    console.error("[turn] échec", detail);
    const vue = classifyTurnError(error);
    emit({ type: "error", message: vue.message, retry: vue.retry, cause: vue.cause });
    awaiting = snapshot.pending ? snapshot.pending.kind : "text";
  }

  // Cas limite : si l'historique finit par des résultats d'outils (message user), le message du
  // tour suivant le suit directement ; l'API fusionne deux messages user consécutifs.
  usage.durationMs = Date.now() - startedAt;
  void trace({
    conversationId: conversation.id,
    turn,
    at: now().toISOString(),
    kind: "turn_usage",
    usage,
    stopReasons,
  });
  // Mesuré sur ce que le modèle a écrit, pas sur ce que le filtre a laissé passer : une phrase
  // de coulisses retirée reste un défaut à lui signaler au tour suivant.
  conversation.lastReplyDefects = defautsDeTon(texteEcrit);
  emit({
    type: "turn_end",
    awaiting,
    usage,
    expiresAt: expiresAtOf(conversation),
    turnsRemaining: Math.max(0, MAX_TURNS_PER_CONVERSATION - conversation.turn),
  });
  return awaiting;
}

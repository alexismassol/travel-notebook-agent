import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { TurnRequest } from "../shared/api";
import type { Contact } from "../shared/contact";
import type { ServerEvent } from "../shared/events";
import { cacheHitRate, formatCost, formatShare, turnCost } from "../shared/pricing";
import { ApiError, createConversation, getConversation, sendBrief, sendTurn } from "./api";
import { BriefPanel } from "./components/BriefPanel";
import type { ConfirmState } from "./components/BriefSummary";
import { Chat } from "./components/Chat";
import type { ChoiceAnswer } from "./components/ChoiceBlock";
import { Composer } from "./components/Composer";
import { Contours } from "./components/Contours";
import { Conversations } from "./components/Conversations";
import { Suggestions } from "./components/Suggestions";
import {
  type ConversationState,
  conversationReducer,
  createInitialState,
  reprendreLesIdentifiants,
} from "./lib/conversation";
import {
  type ConversationSauvee,
  lireDerniere,
  oublier,
  sauvegarder,
  titreDe,
} from "./lib/persistance";

/**
 * Première phrase lue par le voyageur : elle parle de SON voyage, pas de la mécanique derrière.
 * Le carnet y est nommé tout de suite : c'est ce qu'il emporte à la fin de la conversation.
 */
const WELCOME_TEXT =
  "Bonjour. Racontez-moi votre projet de voyage comme il vous vient, " +
  "même si vous ne savez pas encore où partir. " +
  "Je note tout au fur et à mesure dans votre carnet.";

const CHANGED_FIELDS_HIGHLIGHT_MS = 4000;

/**
 * La zone d'écriture reste ouverte pendant une question à choix : le voyageur qui ne sait pas
 * quoi répondre doit pouvoir demander plutôt que cliquer.
 */
function composerPlaceholder(awaiting: string): string {
  if (awaiting === "done") return "Votre carnet de voyage est prêt.";
  if (awaiting === "choice") return "Répondez ci-dessus, ou posez-moi une question";
  return "Écrivez votre message";
}

/**
 * Les récapitulatifs du fil, marqués comme validés. Sert quand le serveur dit que le carnet est
 * validé alors que le navigateur, coupé au mauvais moment, ne l'a jamais su.
 */
function confirmationsEnvoyees(etat: ConversationState): Record<string, ConfirmState> {
  const envoyes: Record<string, ConfirmState> = {};
  for (const entree of etat.timeline) {
    if (entree.type !== "agent") continue;
    for (const part of entree.parts) {
      if (part.kind === "ui_block" && part.block.kind === "brief_summary") {
        envoyes[part.block.toolUseId] = "sent";
      }
    }
  }
  return envoyes;
}

export function App() {
  const [state, dispatch] = useReducer(conversationReducer, createInitialState());
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [isTurnInFlight, setIsTurnInFlight] = useState(false);
  const [choiceAnswers, setChoiceAnswers] = useState<Record<string, ChoiceAnswer>>({});
  const [confirmStates, setConfirmStates] = useState<Record<string, ConfirmState>>({});
  const [sendErrors, setSendErrors] = useState<Record<string, string>>({});
  /**
   * Le contact donné à la validation vit ici, pas dans le récapitulatif : le carnet se retélécharge
   * après un rechargement de page, et il doit encore porter le prénom et l'adresse.
   */
  const [contactEnvoye, setContactEnvoye] = useState<Contact | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [firstMessageSent, setFirstMessageSent] = useState(false);
  /** Le navigateur a gardé le fil, mais le serveur ne l'a plus : on peut relire, pas continuer. */
  const [repriseImpossible, setRepriseImpossible] = useState(false);
  const debugRef = useRef<HTMLDivElement>(null);
  const dernierEnvoi = useRef<TurnRequest | null>(null);
  const tourEnCours = useRef<AbortController | null>(null);

  /**
   * Le panneau technique se pose par-dessus la page : tant qu'il est ouvert, il avale les clics
   * sur ce qu'il recouvre. Une option de choix peut ainsi devenir incliquable sur téléphone.
   * Il se ferme donc à la touche Échap et au clic à côté, et le focus revient sur son bouton.
   */
  useEffect(() => {
    if (!debugOpen) return;
    const fermer = () => {
      setDebugOpen(false);
      debugRef.current?.querySelector("button")?.focus();
    };
    const auClavier = (event: KeyboardEvent) => {
      if (event.key === "Escape") fermer();
    };
    const auClic = (event: PointerEvent) => {
      if (!debugRef.current?.contains(event.target as Node)) setDebugOpen(false);
    };
    document.addEventListener("keydown", auClavier);
    document.addEventListener("pointerdown", auClic);
    return () => {
      document.removeEventListener("keydown", auClavier);
      document.removeEventListener("pointerdown", auClic);
    };
  }, [debugOpen]);

  /**
   * Ouvre une conversation gardée par le navigateur. Le fil se réaffiche toujours ; ce que dit
   * le serveur décide seulement si elle peut continuer. Sert au chargement de la page comme au
   * choix dans la liste.
   */
  const ouvrir = useCallback(async (gardee: ConversationSauvee) => {
    // Un tour en vol écrirait ses événements dans la conversation qu'on vient d'ouvrir : le
    // flux ne sait pas qu'on a changé de fil. On le coupe avant de basculer.
    tourEnCours.current?.abort();
    const etatServeur = await getConversation(gardee.id).catch(() => null);
    reprendreLesIdentifiants(gardee.etat);
    // Le serveur sait si le carnet est déjà validé, même si le navigateur a raté la réponse.
    const envoyee = etatServeur?.sentAt != null;
    dispatch({
      type: "restore",
      state: gardee.etat,
      ...(envoyee ? { awaiting: "done" as const } : {}),
    });
    setConfirmStates(
      envoyee
        ? { ...gardee.confirmations, ...confirmationsEnvoyees(gardee.etat) }
        : gardee.confirmations,
    );
    setChoiceAnswers({});
    setSendErrors({});
    setContactEnvoye(gardee.contact ?? null);
    setFirstMessageSent(true);
    if (etatServeur === null) {
      setConversationId(null);
      setRepriseImpossible(true);
      return;
    }
    setRepriseImpossible(false);
    setConversationId(gardee.id);
  }, []);

  /**
   * Au chargement : reprendre d'abord, créer ensuite. Le navigateur garde le fil visible, le
   * serveur garde l'état du modèle ; on ne réaffiche un fil comme vivant qu'après avoir demandé
   * au serveur s'il le connaît encore. Une conversation neuve reste le chemin de repli.
   */
  useEffect(() => {
    let cancelled = false;

    const demarrerUneNeuve = async () => {
      const response = await createConversation();
      if (cancelled) return;
      setConversationId(response.id);
      dispatch({
        type: "hydrate",
        brief: response.brief,
        completeness: response.completeness,
        welcomeText: WELCOME_TEXT,
        expiresAt: response.expiresAt,
      });
    };

    const reprendre = async () => {
      const gardee = lireDerniere();
      if (!gardee) return false;
      await ouvrir(gardee);
      return true;
    };

    void reprendre()
      .then((repris) => (repris ? undefined : demarrerUneNeuve()))
      .catch((error: unknown) => {
        if (cancelled) return;
        setInitError(
          error instanceof ApiError
            ? error.message
            : "Impossible de démarrer la conversation. Vérifiez votre connexion et rechargez la page.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [ouvrir]);

  /**
   * Sauvegarde de confort, aux moments calmes seulement : un nouveau message, une fin de tour,
   * un carnet validé. Jamais pendant le flux, qui écrirait des dizaines de fois par
   * seconde pour rien.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: on sauvegarde l'état courant, pas chaque champ écouté
  useEffect(() => {
    // Une conversation où le voyageur n'a rien écrit n'a rien à garder : sans ce contrôle,
    // chaque chargement de page ajoutait une ligne « Nouvelle conversation » à la liste.
    const aParle = state.timeline.some((entree) => entree.type === "user");
    if (!conversationId || repriseImpossible || state.expiresAt === null || !aParle) return;
    sauvegarder({
      id: conversationId,
      expiresAt: state.expiresAt,
      savedAt: new Date().toISOString(),
      titre: titreDe(state),
      confirmations: confirmStates,
      contact: contactEnvoye,
      etat: state,
    });
  }, [
    conversationId,
    repriseImpossible,
    state.timeline.length,
    state.toursTermines,
    state.awaiting,
    state.expiresAt,
    confirmStates,
  ]);

  useEffect(() => {
    if (state.changedFields.length === 0) return;
    const timer = window.setTimeout(
      () => dispatch({ type: "clear_changed_fields" }),
      CHANGED_FIELDS_HIGHLIGHT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [state.changedFields]);

  const runTurn = useCallback(
    async (request: TurnRequest) => {
      if (!conversationId) return;
      // Gardé pour le bouton « Réessayer » : le voyageur ne doit pas retaper son message.
      dernierEnvoi.current = request;
      const controleur = new AbortController();
      tourEnCours.current = controleur;
      setIsTurnInFlight(true);
      try {
        await sendTurn(
          conversationId,
          request,
          (event: ServerEvent) => {
            dispatch({ type: "server_event", event });
          },
          controleur.signal,
        );
      } catch (error) {
        // Arrêt demandé par le voyageur : ce n'est pas une panne, on ne l'affiche pas comme telle.
        if (controleur.signal.aborted) return;
        // Le serveur ne connaît plus cette conversation : réessayer échouerait à l'identique,
        // pour toujours. Le fil reste lisible, et un bouton propose d'en commencer une autre.
        if (error instanceof ApiError && error.status === 404) {
          setRepriseImpossible(true);
          return;
        }
        const message =
          error instanceof ApiError
            ? error.message
            : "La connexion a été interrompue. Réessayez dans un instant.";
        dispatch({
          type: "server_event",
          event: { type: "error", message, retry: true, cause: "connexion" },
        });
      } finally {
        tourEnCours.current = null;
        setIsTurnInFlight(false);
        // Filet de sécurité : nettoie toute activité d'outil encore affichée même si le flux
        // SSE s'est fermé sans `turn_end` (voir lib/conversation.ts, action "turn_finished").
        dispatch({ type: "turn_finished" });
      }
    },
    [conversationId],
  );

  const handleComposerSend = useCallback(
    (text: string) => {
      if (isTurnInFlight) return;
      setFirstMessageSent(true);
      dispatch({ type: "user_message", text });
      void runTurn({ kind: "text", text });
    },
    [isTurnInFlight, runTurn],
  );

  /**
   * Couper la réponse en cours. Le serveur revient à l'état d'avant le tour, donc le carnet ne
   * garde rien de partiel, et le voyageur peut réécrire tout de suite.
   */
  const handleStop = useCallback(() => {
    tourEnCours.current?.abort();
  }, []);

  const handleRetry = useCallback(() => {
    const requete = dernierEnvoi.current;
    if (!requete || isTurnInFlight) return;
    void runTurn(requete);
  }, [isTurnInFlight, runTurn]);

  const handleChoiceSubmit = useCallback(
    (toolUseId: string, selected: string[], freeText: string | undefined) => {
      if (isTurnInFlight) return;
      setChoiceAnswers((prev) => ({ ...prev, [toolUseId]: { selected, freeText } }));
      void runTurn(
        freeText
          ? { kind: "choice", toolUseId, selected, freeText }
          : { kind: "choice", toolUseId, selected },
      );
    },
    [isTurnInFlight, runTurn],
  );

  const handleBriefDecision = useCallback(
    (toolUseId: string, decision: "send" | "edit", contact?: Contact) => {
      if (isTurnInFlight) return;
      if (contact) setContactEnvoye(contact);
      setConfirmStates((prev) => ({
        ...prev,
        [toolUseId]: decision === "edit" ? "edit" : "pending",
      }));
      setSendErrors((prev) => {
        if (!(toolUseId in prev)) return prev;
        const next = { ...prev };
        delete next[toolUseId];
        return next;
      });
      void (async () => {
        await runTurn({ kind: "brief_confirmation", toolUseId, decision, contact });
        if (decision !== "send" || !conversationId) return;
        try {
          const result = await sendBrief(conversationId, contact);
          if (result.ok) {
            setConfirmStates((prev) => ({ ...prev, [toolUseId]: "sent" }));
            return;
          }
          setConfirmStates((prev) => {
            const next = { ...prev };
            delete next[toolUseId];
            return next;
          });
          setSendErrors((prev) => ({ ...prev, [toolUseId]: result.error }));
        } catch (error) {
          setConfirmStates((prev) => {
            const next = { ...prev };
            delete next[toolUseId];
            return next;
          });
          const message =
            error instanceof ApiError
              ? error.message
              : "Le carnet n'a pas pu être préparé. Réessayez dans un instant.";
          setSendErrors((prev) => ({ ...prev, [toolUseId]: message }));
        }
      })();
    },
    [isTurnInFlight, runTurn, conversationId],
  );

  /**
   * Recommencer après un carnet validé. Une conversation vit côté serveur : on en demande une
   * neuve et on repart d'un carnet vide, plutôt que de laisser l'écran figé sur l'ancien.
   */
  const handleRestart = useCallback(() => {
    setConversationId(null);
    setChoiceAnswers({});
    setConfirmStates({});
    setSendErrors({});
    setFirstMessageSent(false);
    setRepriseImpossible(false);
    void createConversation()
      .then((response) => {
        setConversationId(response.id);
        dispatch({
          type: "hydrate",
          brief: response.brief,
          completeness: response.completeness,
          welcomeText: WELCOME_TEXT,
          expiresAt: response.expiresAt,
        });
      })
      .catch(() => {
        setInitError("Impossible de démarrer une nouvelle conversation. Rechargez la page.");
      });
  }, []);

  /**
   * Supprimer une conversation gardée. Sans compte ni corbeille, la perte est immédiate : la
   * liste demande confirmation avant d'appeler ceci. Supprimer celle qu'on lit en ouvre une
   * neuve, pour ne pas rester sur un fil qui n'existe plus nulle part.
   */
  const handleSupprimer = useCallback(
    (id: string) => {
      oublier(id);
      if (id === conversationId) handleRestart();
    },
    [conversationId, handleRestart],
  );

  if (initError) {
    return (
      <div className="app-error">
        <p role="alert">{initError}</p>
      </div>
    );
  }

  // Sans cet écran, le premier chargement montre une page vide : court en local, pas sur un
  // téléphone lent. Une conversation reprise que le serveur a oubliée s'affiche quand même :
  // il n'y a plus d'identifiant, mais il y a un fil à relire.
  if (conversationId === null && !repriseImpossible) {
    return (
      <div className="app-booting" role="status" aria-label="Chargement en cours">
        <span className="breathing-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>
    );
  }

  // Un tour en cours ne ferme plus la saisie : on peut écrire pendant que l'agent répond, et
  // le bouton « Arrêter » tient la place d'Envoyer jusqu'à la fin du tour.
  const composerDisabled =
    state.awaiting === "done" || conversationId === null || repriseImpossible;
  const showSuggestions = conversationId !== null && !firstMessageSent;

  const debugContent = (
    <>
      {state.lastUsage ? (
        <dl className="app__debug-grid tabular-nums">
          <div>
            <dt>Modèle</dt>
            <dd>{state.lastUsage.model}</dd>
          </div>
          <div>
            <dt>Appels</dt>
            <dd>{state.lastUsage.apiCalls}</dd>
          </div>
          <div>
            <dt>Jetons d'entrée</dt>
            <dd>{state.lastUsage.inputTokens}</dd>
          </div>
          <div>
            <dt>Jetons de sortie</dt>
            <dd>{state.lastUsage.outputTokens}</dd>
          </div>
          <div>
            <dt>Cache lu</dt>
            <dd>{state.lastUsage.cacheReadTokens}</dd>
          </div>
          <div>
            <dt>Cache écrit</dt>
            <dd>{state.lastUsage.cacheWriteTokens}</dd>
          </div>
          <div>
            <dt>Recherches web</dt>
            <dd>{state.lastUsage.webSearches}</dd>
          </div>
          <div>
            <dt>Premier mot</dt>
            <dd>
              {state.lastUsage.firstTextMs !== null ? `${state.lastUsage.firstTextMs} ms` : "—"}
            </dd>
          </div>
          <div>
            <dt>Durée du tour</dt>
            <dd>{state.lastUsage.durationMs} ms</dd>
          </div>
          {/* Le coût se montre à côté de la latence : les deux se décident ensemble. Tarifs et
              calcul dans shared/pricing.ts, les mêmes que pour le rejeu des scénarios. */}
          <div>
            <dt>Coût du tour</dt>
            <dd>{formatCost(turnCost(state.lastUsage))}</dd>
          </div>
          <div>
            <dt>Coût de la conversation</dt>
            <dd>
              {formatCost(state.coutCumule)}
              {state.toursTermines > 1 ? (
                <span className="app__debug-aside">
                  {" "}
                  soit {formatCost(state.coutCumule / state.toursTermines)} par tour
                </span>
              ) : null}
            </dd>
          </div>
          {/* Le cache est le premier levier de coût : le préfixe figé et l'historique repartent
              à chaque appel. Le taux dit s'il tient ; l'économie dit ce qu'il rapporte. */}
          <div>
            <dt>Entrée lue depuis le cache</dt>
            <dd>
              {formatShare(cacheHitRate(state.jetonsCache, state.jetonsEntree))}
              <span className="app__debug-aside"> de {state.jetonsEntree} jetons</span>
            </dd>
          </div>
          <div>
            <dt>Économisé par le cache</dt>
            <dd>
              {formatCost(state.economieCache)}
              <span className="app__debug-aside"> face au même trafic sans cache</span>
            </dd>
          </div>
          <div>
            <dt>Conversation gardée jusqu'à</dt>
            <dd>
              {state.expiresAt
                ? new Date(state.expiresAt).toLocaleString("fr-FR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Tours</dt>
            <dd>
              {state.toursTermines}
              {state.toursRestants !== null ? (
                <span className="app__debug-aside"> et {state.toursRestants} encore possibles</span>
              ) : null}
            </dd>
          </div>
        </dl>
      ) : (
        <p>Aucun tour terminé pour l'instant.</p>
      )}
      <p className="app__debug-subtitle">Playbooks chargés</p>
      {state.loadedPlaybooks.length > 0 ? (
        <ul className="app__debug-list">
          {state.loadedPlaybooks.map((p) => (
            <li key={`${p.name}-${p.turn}`}>
              {p.name} · tour {p.turn} · {p.origin === "spontaneous" ? "spontané" : "suggéré"} ·{" "}
              {p.reason}
            </li>
          ))}
        </ul>
      ) : (
        <p>Aucun.</p>
      )}
    </>
  );

  return (
    <div className="app">
      <header className="app__header">
        <Contours className="app__header-contours" />
        <div className="app__header-content">
          <h1>Préparer votre voyage</h1>
          <span className="app__header-sub">et créer votre carnet de voyage</span>
        </div>
        <Conversations
          courante={conversationId}
          onOuvrir={(gardee) => void ouvrir(gardee)}
          onSupprimer={handleSupprimer}
          onNouvelle={handleRestart}
        />
        {/* Les détails techniques vivaient sous la conversation : on arrivait « en bas », puis la
            page continuait. Ils sont ici, hors du fil, et s'ouvrent par-dessus sans le pousser. */}
        <div className="app__debug" ref={debugRef}>
          <button
            type="button"
            className="app__debug-toggle"
            aria-expanded={debugOpen}
            aria-label="Détails techniques"
            onClick={() => setDebugOpen((prev) => !prev)}
          >
            <span className="app__debug-toggle-long">Détails techniques</span>
            <span className="app__debug-toggle-short" aria-hidden="true">
              Détails
            </span>
          </button>
          {debugOpen ? <div className="app__debug-panel">{debugContent}</div> : null}
        </div>
      </header>
      <main className="app__layout">
        <section className="app__chat">
          <Chat
            timeline={state.timeline}
            choiceAnswers={choiceAnswers}
            confirmStates={confirmStates}
            sendErrors={sendErrors}
            turnInFlight={isTurnInFlight}
            lectureSeule={repriseImpossible}
            onChoiceSubmit={handleChoiceSubmit}
            onBriefDecision={handleBriefDecision}
            contactEnvoye={contactEnvoye}
            onRestart={handleRestart}
            onRetry={handleRetry}
          />
          {repriseImpossible ? (
            // Le fil est là, le serveur ne l'a plus : on le dit, plutôt que de laisser cliquer
            // sur des boutons dont la réponse partirait dans le vide.
            <p className="app__reprise">
              Cette conversation n'est plus disponible : le serveur a redémarré, ou six heures se
              sont écoulées. Vous pouvez relire ce fil.{" "}
              <button type="button" className="app__reprise-bouton" onClick={handleRestart}>
                Commencer un nouveau voyage
              </button>
            </p>
          ) : null}
          {showSuggestions ? (
            <Suggestions onPick={handleComposerSend} disabled={isTurnInFlight} />
          ) : null}
          <Composer
            running={isTurnInFlight}
            onStop={handleStop}
            disabled={composerDisabled}
            placeholder={composerPlaceholder(state.awaiting)}
            onSend={handleComposerSend}
          />
        </section>
        <BriefPanel
          brief={state.brief}
          completeness={state.completeness}
          changedFields={state.changedFields}
        />
      </main>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import type { Contact } from "../../shared/contact";
import type { TimelineEntry } from "../lib/conversation";
import { BriefSummary, type ConfirmState } from "./BriefSummary";
import { type ChoiceAnswer, ChoiceBlock } from "./ChoiceBlock";
import { DestinationCards } from "./DestinationCards";
import { MessageBubble } from "./MessageBubble";
import { PlaybookNotice } from "./PlaybookNotice";
import { Sources } from "./Sources";
import { BreathingDots, ToolActivity } from "./ToolActivity";

interface ChatProps {
  timeline: TimelineEntry[];
  choiceAnswers: Record<string, ChoiceAnswer>;
  confirmStates: Record<string, ConfirmState>;
  sendErrors: Record<string, string>;
  turnInFlight: boolean;
  /** Fil repris que le serveur a oublié : on peut le relire, aucun bouton ne répond plus. */
  lectureSeule?: boolean;
  onChoiceSubmit: (toolUseId: string, selected: string[], freeText: string | undefined) => void;
  onBriefDecision: (toolUseId: string, decision: "send" | "edit", contact?: Contact) => void;
  /** Le contact donné à la validation, imprimé sur le carnet à télécharger. */
  contactEnvoye: Contact | null;
  onRestart: () => void;
  onRetry: () => void;
}

/**
 * Le lecteur est-il assez bas pour que le fil puisse suivre sans le déranger ? La marge tient
 * compte de la zone d'écriture collée en bas et de la marge de respiration du fil : sans elle,
 * on se croit « remonté » alors qu'on lit la dernière ligne.
 */
function auBas(): boolean {
  return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 240;
}

/** Le vrai bas de la page, marges comprises. Un point d'ancrage dans le fil s'arrête trop tôt. */
function descendre(): void {
  window.scrollTo?.({ top: document.documentElement.scrollHeight, behavior: "smooth" });
}

/** Fil de conversation : bulles utilisateur/agent, blocs UI, activité d'outil, sources, playbooks. */
export function Chat({
  timeline,
  choiceAnswers,
  confirmStates,
  sendErrors,
  turnInFlight,
  lectureSeule = false,
  onChoiceSubmit,
  onBriefDecision,
  contactEnvoye,
  onRestart,
  onRetry,
}: ChatProps) {
  const conteneur = useRef<HTMLDivElement>(null);
  const blocsVus = useRef(0);
  /**
   * Le fil déjà traité par le suivi du défilement. On garde le tableau lui-même, pas sa
   * longueur : React rejoue les effets en mode strict, et une relecture à l'identique ne doit
   * pas passer pour un nouveau message.
   */
  const filSuivi = useRef<TimelineEntry[] | null>(null);
  const [nouveaute, setNouveaute] = useState(false);

  const versLeBas = () => {
    descendre();
    setNouveaute(false);
  };

  useEffect(() => {
    const surDefilement = () => {
      if (auBas()) setNouveaute(false);
    };
    window.addEventListener("scroll", surDefilement, { passive: true });
    return () => window.removeEventListener("scroll", surDefilement);
  }, []);

  /**
   * Le fil suit la conversation sans jamais voler le défilement : sans ça, il faut remonter
   * à la molette après chaque réponse.
   *
   * Si le lecteur est remonté pour lire, rien ne bouge : une pastille lui dit qu'il s'est passé
   * quelque chose, et c'est lui qui redescend. S'il était en bas, le fil suit. Et un bloc qui
   * attend une action se montre par le HAUT, sinon on atterrit sur la zone d'écriture et le
   * bouton « Valider » reste hors de vue.
   */
  useEffect(() => {
    const blocs = conteneur.current?.querySelectorAll("[data-bloc]") ?? [];
    const nouveauBloc = blocs.length > blocsVus.current;
    if (filSuivi.current === timeline) return;
    // Une reprise passe de rien au fil complet en un seul rendu. Un tour normal ajoute une
    // entrée à la fois : la distinction tient dans ce saut.
    const arriveeEnBloc = filSuivi.current === null && timeline.length > 1;
    filSuivi.current = timeline;
    blocsVus.current = blocs.length;
    // Une conversation reprise arrive d'un coup, et la page démarre en haut : sans ce cas, tout
    // le fil comptait pour du neuf, et la pastille s'affichait par-dessus la fin de l'échange.
    if (arriveeEnBloc) {
      const dernier = blocs[blocs.length - 1];
      if (dernier) dernier.scrollIntoView?.({ block: "start" });
      else descendre();
      return;
    }
    if (!auBas()) {
      // La pastille annonce ce qui arrive pendant que le lecteur est remonté. Hors d'un tour,
      // rien n'arrive : un fil rouvert n'est pas un nouveau message, et l'annoncer recouvrait la
      // fin de l'échange sur téléphone.
      if (turnInFlight) setNouveaute(true);
      return;
    }
    if (nouveauBloc) {
      blocs[blocs.length - 1]?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      return;
    }
    descendre();
  }, [timeline, turnInFlight]);

  const lastEntry = timeline[timeline.length - 1];
  const lastEntryHasText =
    lastEntry?.type === "agent" && lastEntry.parts.some((part) => part.kind === "text");
  const lastEntryEndsWithActivity =
    lastEntry?.type === "agent" &&
    lastEntry.parts[lastEntry.parts.length - 1]?.kind === "tool_activity";
  // Tant qu'aucun texte n'est arrivé dans le tour, et que la ligne d'activité d'outil ne porte
  // déjà ses propres points (elle a les siens), on montre le placeholder de réflexion.
  const showThinking = turnInFlight && !lastEntryHasText && !lastEntryEndsWithActivity;

  return (
    <div className="chat" ref={conteneur}>
      {timeline.map((entry) => {
        if (entry.type === "user") {
          return <MessageBubble key={entry.id} sender="user" text={entry.text} />;
        }
        if (entry.type === "playbook") {
          return <PlaybookNotice key={entry.id} label={entry.label} reason={entry.reason} />;
        }
        let firstTextSeen = false;
        return (
          <div className="chat__agent-turn" key={entry.id}>
            {entry.parts.map((part) => {
              if (part.kind === "text") {
                const showMarker = !firstTextSeen;
                firstTextSeen = true;
                return (
                  <MessageBubble
                    key={part.id}
                    sender="agent"
                    text={part.text}
                    showMarker={showMarker}
                  />
                );
              }
              if (part.kind === "tool_activity") {
                return <ToolActivity key={part.id} tool={part.tool} label={part.label} />;
              }
              if (part.kind === "sources") {
                return <Sources key={part.id} sources={part.sources} />;
              }
              if (part.kind === "error") {
                return (
                  <div className="chat__error" key={part.id} role="alert">
                    <p>{part.message}</p>
                    {/* Le bouton n'apparaît que si un nouvel essai peut marcher : le proposer
                        après un crédit épuisé ferait tourner le voyageur en rond. */}
                    {part.retry ? (
                      <button type="button" className="chat__error-retry" onClick={onRetry}>
                        Réessayer
                      </button>
                    ) : null}
                  </div>
                );
              }
              const block = part.block;
              // `data-bloc` marque ce qui attend une action : c'est là que le fil s'arrête, par
              // le haut, au lieu de filer jusqu'à la zone d'écriture.
              if (block.kind === "choice") {
                return (
                  <div data-bloc="choix" key={part.id}>
                    <ChoiceBlock
                      block={block}
                      answer={choiceAnswers[block.toolUseId]}
                      disabled={turnInFlight || lectureSeule}
                      onSubmit={onChoiceSubmit}
                    />
                  </div>
                );
              }
              if (block.kind === "cards") {
                return (
                  <div data-bloc="fiches" key={part.id}>
                    <DestinationCards block={block} />
                  </div>
                );
              }
              return (
                <div data-bloc="recapitulatif" key={part.id}>
                  <BriefSummary
                    block={block}
                    state={confirmStates[block.toolUseId]}
                    sendError={sendErrors[block.toolUseId]}
                    disabled={turnInFlight || lectureSeule}
                    onDecision={onBriefDecision}
                    contactEnvoye={contactEnvoye}
                    onRestart={onRestart}
                  />
                </div>
              );
            })}
          </div>
        );
      })}
      {showThinking ? (
        <p className="chat__thinking" role="status" aria-label="L'agent réfléchit">
          <BreathingDots />
        </p>
      ) : null}
      {nouveaute ? (
        <button type="button" className="chat__vers-le-bas" onClick={versLeBas}>
          Nouveau message ↓
        </button>
      ) : null}
    </div>
  );
}

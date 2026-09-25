import { useEffect, useRef, useState } from "react";
import { MANDATORY_FIELDS, USEFUL_FIELDS } from "../../shared/brief";
import { Contact, contactError } from "../../shared/contact";
import type { BriefSummaryBlock as BriefSummaryBlockData } from "../../shared/events";
import {
  FIELD_LABELS,
  formatAlternatives,
  formatFieldValue,
  getSlot,
  MANDATORY_FIELD_ICONS,
  SlotRow,
} from "../lib/briefFormat";
import { downloadCarnet } from "../lib/carnetPdf";
import { CheckIcon } from "./icons";
import { MessageBubble } from "./MessageBubble";

export type ConfirmState = "pending" | "edit" | "sent";

interface BriefSummaryProps {
  block: BriefSummaryBlockData;
  state?: ConfirmState;
  sendError?: string;
  disabled: boolean;
  onDecision: (toolUseId: string, decision: "send" | "edit", contact?: Contact) => void;
  /** Le contact déjà validé, gardé au-dessus : il survit à un rechargement, l'état local non. */
  contactEnvoye?: Contact | null;
  /** Recommencer une conversation après le carnet : sans ça, la page reste figée sur l'ancien. */
  onRestart: () => void;
}

/**
 * Récapitulatif lisible du brief + message de l'agent, avec deux issues : télécharger ou modifier.
 * « Télécharger » déclenche le tour `brief_confirmation`, puis l'appel `sendBrief` qui fait
 * revérifier le carnet par le serveur (voir App.tsx). Le PDF ne part qu'après une réponse
 * `{ ok: true }` : un carnet que le serveur refuse ne se télécharge pas.
 */
export function BriefSummary({
  block,
  state,
  sendError,
  disabled,
  onDecision,
  contactEnvoye = null,
  onRestart,
}: BriefSummaryProps) {
  const isPending = state === "pending";
  const isSent = state === "sent";
  const isEdit = state === "edit";
  const resolved = isSent || isEdit;
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [erreurContact, setErreurContact] = useState<string | null>(null);

  // Le téléchargement part tout seul au passage « en cours » -> « validé », une seule fois. Un
  // rechargement de page arrive directement sur « validé » : il ne relance rien, le bouton
  // « Télécharger à nouveau » reste là pour ça.
  const etatPrecedent = useRef(state);
  useEffect(() => {
    if (etatPrecedent.current === "pending" && state === "sent") {
      void downloadCarnet(block.brief, block.completeness, contactEnvoye);
    }
    etatPrecedent.current = state;
  }, [state, block.brief, block.completeness, contactEnvoye]);

  const telecharger = () => {
    // Le contrôle se fait ici, avant la requête : le voyageur voit sa faute de frappe tout de
    // suite, et le serveur revérifie de son côté.
    const saisie = { firstName: prenom, email };
    const faute = contactError(saisie);
    setErreurContact(faute);
    if (faute) return;
    onDecision(block.toolUseId, "send", Contact.parse(saisie));
  };

  return (
    <div className="brief-summary">
      <h3 className="brief-summary__title">Votre carnet de voyage est prêt</h3>
      <MessageBubble sender="agent" text={block.message} />
      <div className="brief-summary__recap">
        {MANDATORY_FIELDS.map((field) => {
          const slot = getSlot(field, block.brief);
          return (
            <SlotRow
              key={field}
              title={FIELD_LABELS[field]}
              status={slot.status}
              valueText={formatFieldValue(field, block.brief)}
              alternativesText={
                slot.status === "conflicting"
                  ? formatAlternatives(field, slot.alternatives)
                  : undefined
              }
              icon={MANDATORY_FIELD_ICONS[field]}
            />
          );
        })}
        {USEFUL_FIELDS.map((field) => {
          const valueText = formatFieldValue(field, block.brief);
          if (valueText === null) return null;
          const slot = getSlot(field, block.brief);
          return (
            <SlotRow
              key={field}
              title={FIELD_LABELS[field]}
              status={slot.status}
              valueText={valueText}
              alternativesText={
                slot.status === "conflicting"
                  ? formatAlternatives(field, slot.alternatives)
                  : undefined
              }
            />
          );
        })}
      </div>
      {resolved ? (
        <p
          className={
            isSent ? "brief-summary__status brief-summary__status--sent" : "brief-summary__status"
          }
        >
          {isSent ? (
            <>
              <CheckIcon className="brief-summary__status-icon" />
              Votre carnet de voyage est téléchargé. Bon voyage !
              {/* Le voyageur repart avec son carnet en PDF. Rien à installer, rien à rappeler. */}
              <button
                type="button"
                className="brief-summary__download"
                onClick={() => void downloadCarnet(block.brief, block.completeness, contactEnvoye)}
              >
                Télécharger à nouveau
              </button>
              <button type="button" className="brief-summary__restart" onClick={onRestart}>
                Préparer un autre voyage
              </button>
            </>
          ) : (
            "Vous avez choisi de modifier votre carnet."
          )}
        </p>
      ) : (
        <>
          {block.brief.useful.style.status === "unknown" &&
          block.brief.useful.interests.status === "unknown" &&
          block.brief.useful.constraints.status === "unknown" ? (
            <p className="brief-summary__hint">
              Vous pouvez encore dire vos envies ou votre style de voyage.
            </p>
          ) : null}
          <p className="brief-summary__hint">
            Vous pouvez encore modifier votre carnet avant de le télécharger.
          </p>
          <div className="brief-summary__contact">
            <label className="brief-summary__field">
              <span>Votre prénom</span>
              <input
                type="text"
                autoComplete="given-name"
                value={prenom}
                disabled={disabled || isPending}
                onChange={(e) => setPrenom(e.target.value)}
              />
            </label>
            <label className="brief-summary__field">
              <span>Votre adresse e-mail</span>
              <input
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                disabled={disabled || isPending}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <p className="brief-summary__hint">
              Votre prénom et votre adresse s'impriment en haut du carnet. Ils ne servent qu'à cela.
            </p>
          </div>
          <div className="brief-summary__actions">
            {erreurContact ? (
              <p className="brief-summary__error" role="alert">
                {erreurContact}
              </p>
            ) : null}
            {sendError ? (
              <p className="brief-summary__error" role="alert">
                {sendError}
              </p>
            ) : null}
            <button
              type="button"
              className="brief-summary__send"
              disabled={disabled || isPending}
              onClick={telecharger}
            >
              {isPending ? "Préparation de votre carnet…" : "Télécharger mon carnet de voyage"}
            </button>
            <button
              type="button"
              className="brief-summary__edit"
              disabled={disabled || isPending}
              onClick={() => onDecision(block.toolUseId, "edit")}
            >
              Modifier quelque chose
            </button>
          </div>
        </>
      )}
    </div>
  );
}

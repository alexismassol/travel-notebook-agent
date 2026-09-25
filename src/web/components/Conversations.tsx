import { useEffect, useRef, useState } from "react";
import type { ConversationSauvee } from "../lib/persistance";
import { lireTout } from "../lib/persistance";
import { ChatsIcon } from "./icons";

/**
 * Les conversations gardées par le navigateur, pour en rouvrir une.
 *
 * La liste est relue à chaque ouverture du panneau : elle change à chaque message, et une liste
 * figée au premier rendu montrerait un titre périmé. Une conversation que le serveur a oubliée
 * s'ouvre quand même, en lecture seule : c'est le panneau qui le dit, pas le voyageur qui le
 * découvre en cliquant sur un bouton mort.
 */

interface ConversationsProps {
  /** Identifiant de la conversation affichée, ou null si le serveur l'a oubliée. */
  courante: string | null;
  onOuvrir: (gardee: ConversationSauvee) => void;
  onSupprimer: (id: string) => void;
  onNouvelle: () => void;
}

function quand(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const aujourdhui = new Date();
  const memeJour =
    date.getDate() === aujourdhui.getDate() &&
    date.getMonth() === aujourdhui.getMonth() &&
    date.getFullYear() === aujourdhui.getFullYear();
  return memeJour
    ? `aujourd'hui à ${date.toLocaleTimeString("fr-FR", { timeStyle: "short" })}`
    : date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export function Conversations({ courante, onOuvrir, onSupprimer, onNouvelle }: ConversationsProps) {
  const [ouvert, setOuvert] = useState(false);
  const [gardees, setGardees] = useState<ConversationSauvee[]>([]);
  /**
   * Conversation dont on vient de demander la suppression. Rien ici ne part dans une corbeille :
   * sans compte ni serveur, la perte est immédiate, donc on demande avant.
   */
  const [aSupprimer, setASupprimer] = useState<string | null>(null);
  const bloc = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    setGardees(lireTout());
    setASupprimer(null);
    const fermer = () => {
      setOuvert(false);
      bloc.current?.querySelector("button")?.focus();
    };
    const auClavier = (event: KeyboardEvent) => {
      if (event.key === "Escape") fermer();
    };
    const auClic = (event: PointerEvent) => {
      if (!bloc.current?.contains(event.target as Node)) setOuvert(false);
    };
    document.addEventListener("keydown", auClavier);
    document.addEventListener("pointerdown", auClic);
    return () => {
      document.removeEventListener("keydown", auClavier);
      document.removeEventListener("pointerdown", auClic);
    };
  }, [ouvert]);

  return (
    <div className="conversations" ref={bloc}>
      <button
        type="button"
        className="conversations__toggle"
        aria-expanded={ouvert}
        aria-label="Mes conversations"
        onClick={() => setOuvert((prev) => !prev)}
      >
        <ChatsIcon className="conversations__toggle-icone" />
        <span className="conversations__toggle-long">Mes conversations</span>
      </button>
      {ouvert ? (
        <div className="conversations__panel">
          <p className="conversations__titre">Gardées par ce navigateur</p>
          {gardees.length === 0 ? (
            <p className="conversations__vide">Aucune conversation gardée pour l'instant.</p>
          ) : (
            <ul className="conversations__liste">
              {gardees.map((gardee) => {
                const expiree = Date.parse(gardee.expiresAt) < Date.now();
                if (gardee.id === aSupprimer) {
                  return (
                    <li key={gardee.id} className="conversations__confirme">
                      <span>Supprimer « {gardee.titre} » ?</span>
                      <span className="conversations__confirme-actions">
                        <button
                          type="button"
                          className="conversations__oui"
                          onClick={() => {
                            setASupprimer(null);
                            setGardees((liste) => liste.filter((c) => c.id !== gardee.id));
                            onSupprimer(gardee.id);
                          }}
                        >
                          Supprimer
                        </button>
                        <button
                          type="button"
                          className="conversations__non"
                          onClick={() => setASupprimer(null)}
                        >
                          Annuler
                        </button>
                      </span>
                    </li>
                  );
                }
                return (
                  <li key={gardee.id} className="conversations__ligne">
                    <button
                      type="button"
                      className={
                        gardee.id === courante
                          ? "conversations__item conversations__item--courante"
                          : "conversations__item"
                      }
                      onClick={() => {
                        setOuvert(false);
                        onOuvrir(gardee);
                      }}
                    >
                      <span className="conversations__item-titre">{gardee.titre}</span>
                      <span className="conversations__item-detail">
                        {quand(gardee.savedAt)}
                        {gardee.id === courante ? " · en cours" : expiree ? " · expirée" : ""}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="conversations__supprimer"
                      aria-label={`Supprimer la conversation « ${gardee.titre} »`}
                      onClick={() => setASupprimer(gardee.id)}
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <button
            type="button"
            className="conversations__nouvelle"
            onClick={() => {
              setOuvert(false);
              onNouvelle();
            }}
          >
            Commencer un nouveau voyage
          </button>
        </div>
      ) : null}
    </div>
  );
}

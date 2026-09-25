import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { SendIcon, StopIcon } from "./icons";

/**
 * La hauteur suit le texte ; le plafond est en CSS (`max-height`, en partie relatif à l'écran),
 * pour qu'un téléphone ne pousse jamais le bouton Envoyer hors de vue.
 */

interface ComposerProps {
  disabled: boolean;
  placeholder: string;
  onSend: (text: string) => void;
  /** Vrai pendant qu'un tour tourne : le bouton devient « Arrêter ». */
  running?: boolean;
  onStop?: () => void;
}

/**
 * Zone de saisie : Entrée envoie, Maj+Entrée va à la ligne. Elle reste ÉCRIVABLE pendant que
 * l'agent répond, pour que le voyageur ne se retrouve jamais bloqué en train d'écrire : seul
 * l'envoi attend la fin du tour, le temps qu'il prépare sa phrase.
 */
export function Composer({ disabled, placeholder, onSend, running, onStop }: ComposerProps) {
  const [value, setValue] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const bloc = useRef<HTMLDivElement>(null);

  /**
   * Publie sa hauteur réelle : la pastille « nouveau message » se pose juste au-dessus de la
   * ligne de séparation, et pas sur le champ, même quand la zone grandit avec le texte.
   */
  useEffect(() => {
    const noeud = bloc.current;
    if (!noeud || typeof ResizeObserver === "undefined") return;
    const publier = () =>
      document.documentElement.style.setProperty("--hauteur-composer", `${noeud.offsetHeight}px`);
    publier();
    const observateur = new ResizeObserver(publier);
    observateur.observe(noeud);
    return () => observateur.disconnect();
  }, []);

  // La zone grandit avec le texte : on raconte souvent un projet de voyage en un paragraphe, et
  // une zone de deux lignes cachait ce qu'on venait d'écrire.
  const fitToText = (field: HTMLTextAreaElement) => {
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  };

  const submit = () => {
    const trimmed = value.trim();
    if (disabled || running || trimmed.length === 0) return;
    onSend(trimmed);
    setValue("");
    if (input.current) input.current.style.height = "";
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="composer" ref={bloc}>
      <div className="composer__fade" aria-hidden="true" />
      <div className="composer__bar">
        <textarea
          ref={input}
          className="composer__input"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => {
            setValue(event.target.value);
            fitToText(event.target);
          }}
          onKeyDown={handleKeyDown}
          rows={2}
          aria-label="Votre message"
        />
        {running && onStop ? (
          // Pendant une réponse, le seul geste utile est d'arrêter : le voyageur qui s'est mal
          // exprimé n'attend pas la fin pour se reprendre.
          <button
            type="button"
            className="composer__send composer__send--stop"
            onClick={onStop}
            aria-label="Arrêter la réponse"
          >
            <StopIcon />
            <span>Arrêter</span>
          </button>
        ) : (
          <button
            type="button"
            className="composer__send"
            disabled={disabled || running || value.trim().length === 0}
            onClick={submit}
            aria-label="Envoyer"
          >
            <SendIcon />
            <span>Envoyer</span>
          </button>
        )}
      </div>
    </div>
  );
}

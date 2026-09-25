import ReactMarkdown from "react-markdown";
import { LeafIcon } from "./icons";

interface MessageBubbleProps {
  /** `sender`, pas `role` : évite toute confusion avec un rôle ARIA sur ce composant. */
  sender: "agent" | "user";
  text: string;
  /** Marque ronde (feuille) affichée seulement au premier message d'une série de l'agent. */
  showMarker?: boolean;
}

/** Rendu markdown du texte d'un message. `react-markdown` n'exécute jamais de html brut. */
export function MessageBubble({ sender, text, showMarker }: MessageBubbleProps) {
  if (sender === "agent") {
    return (
      <div className="bubble bubble--agent">
        {showMarker ? (
          <span className="bubble__marker" aria-hidden="true">
            <LeafIcon />
          </span>
        ) : (
          // Message suivant d'une même série : même retrait, sans rond (voir Chat.tsx et BriefSummary).
          <span className="bubble__marker-spacer" aria-hidden="true" />
        )}
        <div className="bubble__content">
          <ReactMarkdown>{text}</ReactMarkdown>
        </div>
      </div>
    );
  }
  return (
    <div className="bubble bubble--user">
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  );
}

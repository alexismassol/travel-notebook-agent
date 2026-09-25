import type { ReactNode } from "react";
import { LeafIcon, SearchIcon, SunIcon } from "./icons";

interface Suggestion {
  text: string;
  icon: ReactNode;
}

const SUGGESTIONS: Suggestion[] = [
  { text: "Du soleil en famille cet hiver, on ne sait pas où", icon: <SunIcon /> },
  { text: "Vietnam, 3 semaines en novembre, à deux, budget 4 000 €", icon: <LeafIcon /> },
  { text: "C'est où Zanzibar ?", icon: <SearchIcon /> },
];

interface SuggestionsProps {
  onPick: (text: string) => void;
  disabled: boolean;
}

/** 3 suggestions sous le message d'accueil, qui envoient leur texte comme un message. Disparaissent après le premier message. */
export function Suggestions({ onPick, disabled }: SuggestionsProps) {
  return (
    <ul className="suggestions">
      {SUGGESTIONS.map((suggestion) => (
        <li key={suggestion.text}>
          <button
            type="button"
            className="suggestions__item"
            disabled={disabled}
            onClick={() => onPick(suggestion.text)}
          >
            <span className="suggestions__icon" aria-hidden="true">
              {suggestion.icon}
            </span>
            {suggestion.text}
          </button>
        </li>
      ))}
    </ul>
  );
}

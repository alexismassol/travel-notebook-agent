import { LeafIcon, SearchIcon } from "./icons";

interface ToolActivityProps {
  tool: string;
  label: string;
}

/**
 * Une seule ligne vivante affichée pendant un tour, tant que l'agent travaille : loupe pour une
 * recherche web, feuille sinon. Disparaît du fil à la fin du tour (voir `stripToolActivity`).
 */
export function ToolActivity({ tool, label }: ToolActivityProps) {
  const Icon = tool === "web_search" ? SearchIcon : LeafIcon;
  return (
    <p className="tool-activity" role="status" aria-label={`Action en cours : ${label}`}>
      <Icon className="tool-activity__icon" />
      <span>{label}</span>
      <BreathingDots />
    </p>
  );
}

/** Trois points qui respirent ; figés si `prefers-reduced-motion` (voir app.css). */
export function BreathingDots() {
  return (
    <span className="breathing-dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

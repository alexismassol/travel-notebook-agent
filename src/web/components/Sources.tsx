import type { Source } from "../../shared/events";

interface SourcesProps {
  sources: Source[];
}

const MAX_VISIBLE = 3;

/** Trace laissée par une recherche web : puces discrètes, 3 visibles puis un compteur "+N". */
export function Sources({ sources }: SourcesProps) {
  if (sources.length === 0) return null;
  const visible = sources.slice(0, MAX_VISIBLE);
  const hiddenCount = sources.length - visible.length;
  return (
    <div className="sources">
      <span className="sources__label">Sources</span>
      <ul className="sources__list">
        {visible.map((source) => (
          <li key={source.url}>
            <a href={source.url} target="_blank" rel="noreferrer" title={source.title}>
              {source.title}
            </a>
          </li>
        ))}
        {hiddenCount > 0 ? <li className="sources__more">+{hiddenCount}</li> : null}
      </ul>
    </div>
  );
}

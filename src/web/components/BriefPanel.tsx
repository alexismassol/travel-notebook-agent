import { useEffect, useRef, useState } from "react";
import {
  type BriefField,
  type Completeness,
  MANDATORY_FIELDS,
  type TravelBrief,
  USEFUL_FIELDS,
} from "../../shared/brief";
import {
  FIELD_LABELS,
  formatAlternatives,
  formatFieldValue,
  getSlot,
  MANDATORY_FIELD_ICONS,
  SlotRow,
} from "../lib/briefFormat";
import { Contours } from "./Contours";
import { BookIcon, ChevronIcon } from "./icons";

interface BriefPanelProps {
  brief: TravelBrief;
  completeness: Completeness;
  changedFields: BriefField[];
}

function Segments({ filled }: { filled: number }) {
  return (
    <span className="brief-panel__segments" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={
            i < filled
              ? "brief-panel__segment brief-panel__segment--filled"
              : "brief-panel__segment"
          }
        />
      ))}
    </span>
  );
}

/**
 * Colonne de droite sur desktop (>= 1024px), bandeau collant repliable sous l'en-tête sur mobile
 * (voir app.css). Le repli est purement visuel : sur desktop, le contenu reste toujours affiché.
 */
export function BriefPanel({ brief, completeness, changedFields }: BriefPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [debordeEnBas, setDebordeEnBas] = useState(false);
  const isEmpty = brief.version === 0;

  /**
   * Le dégradé du bas ne s'affiche que s'il reste vraiment du contenu sous la pliure. Peint en
   * permanence, il annoncerait la suite même sur un carnet qui tient déjà en entier.
   * Recalculé quand le carnet change et quand la fenêtre bouge.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: déclencheurs de remesure, pas des valeurs lues
  useEffect(() => {
    const noeud = contentRef.current;
    if (!noeud) return;
    const mesurer = () =>
      setDebordeEnBas(noeud.scrollHeight - noeud.scrollTop - noeud.clientHeight > 8);
    mesurer();
    noeud.addEventListener("scroll", mesurer, { passive: true });
    window.addEventListener("resize", mesurer);
    return () => {
      noeud.removeEventListener("scroll", mesurer);
      window.removeEventListener("resize", mesurer);
    };
  }, [brief, expanded]);
  const missingByField = new Map(completeness.missing.map((item) => [item.field, item.reason]));
  const hasUsefulKnown = USEFUL_FIELDS.some((field) => getSlot(field, brief).status !== "unknown");

  return (
    <aside className={debordeEnBas ? "brief-panel brief-panel--deborde" : "brief-panel"}>
      <button
        type="button"
        className="brief-panel__toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className="brief-panel__toggle-label">
          Votre carnet · {completeness.mandatoryOk} sur 4 essentiels
        </span>
        <Segments filled={completeness.mandatoryOk} />
        <ChevronIcon
          className={expanded ? "brief-panel__chevron is-open" : "brief-panel__chevron"}
        />
      </button>
      <div
        ref={contentRef}
        className={expanded ? "brief-panel__content is-expanded" : "brief-panel__content"}
      >
        <h2 className="brief-panel__title">Votre carnet de voyage</h2>
        <div className="brief-panel__progress">
          <Segments filled={completeness.mandatoryOk} />
          <p className="brief-panel__progress-label tabular-nums">
            {completeness.mandatoryOk} sur 4 essentiels
          </p>
        </div>
        {isEmpty ? (
          <div className="brief-panel__empty">
            <Contours className="brief-panel__empty-contours" />
            <p>Votre projet se dessine ici au fil de la conversation.</p>
          </div>
        ) : (
          <div className="brief-panel__section">
            {MANDATORY_FIELDS.map((field) => {
              const slot = getSlot(field, brief);
              return (
                <SlotRow
                  key={field}
                  title={FIELD_LABELS[field]}
                  status={slot.status}
                  valueText={formatFieldValue(field, brief)}
                  alternativesText={
                    slot.status === "conflicting"
                      ? formatAlternatives(field, slot.alternatives)
                      : undefined
                  }
                  changed={changedFields.includes(field)}
                  icon={MANDATORY_FIELD_ICONS[field]}
                  reason={missingByField.get(field)}
                />
              );
            })}
          </div>
        )}
        {hasUsefulKnown ? (
          <details className="brief-panel__useful" open>
            <summary className="brief-panel__subtitle">Vos préférences</summary>
            <div className="brief-panel__section">
              {USEFUL_FIELDS.map((field) => {
                const slot = getSlot(field, brief);
                return (
                  <SlotRow
                    key={field}
                    title={FIELD_LABELS[field]}
                    status={slot.status}
                    valueText={formatFieldValue(field, brief)}
                    alternativesText={
                      slot.status === "conflicting"
                        ? formatAlternatives(field, slot.alternatives)
                        : undefined
                    }
                    changed={changedFields.includes(field)}
                  />
                );
              })}
            </div>
          </details>
        ) : null}
        {brief.nuances.length > 0 ? (
          <div className="brief-panel__nuances">
            <h3 className="brief-panel__subtitle">
              <BookIcon className="brief-panel__nuances-icon" />
              Vos mots
            </h3>
            <ul>
              {brief.nuances.map((nuance) => (
                <li key={`${nuance.turn}-${nuance.quote}`}>« {nuance.quote} »</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

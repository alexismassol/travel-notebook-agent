import type { ReactNode } from "react";
import {
  type BriefField,
  type BudgetValue,
  type DatesValue,
  type DestinationValue,
  type DurationValue,
  type Evidence,
  MANDATORY_FIELDS,
  type MandatoryField,
  type SlotStatus,
  type TravelBrief,
  type TravellersValue,
  type UsefulField,
} from "../../shared/brief";
import {
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  MapPinIcon,
  TravellersIcon,
} from "../components/icons";

/**
 * Rendu lisible des valeurs et statuts du brief, partagé par `BriefPanel` et `BriefSummary`.
 * Un statut `vague`/`inferred`/`conflicting` n'est jamais affiché comme confirmé : le badge
 * porte cette distinction, jamais la valeur seule.
 */

export const FIELD_LABELS: Record<BriefField, string> = {
  destination: "Destination",
  dates: "Dates",
  duration: "Durée",
  travellers: "Voyageurs",
  departure: "Ville de départ",
  budget: "Budget",
  style: "Style",
  interests: "Envies",
  constraints: "Contraintes",
};

export const STATUS_LABELS: Record<SlotStatus, string | null> = {
  unknown: "à définir",
  vague: "à préciser",
  inferred: "à confirmer",
  confirmed: null,
  conflicting: "à trancher",
};

/** Icône des 4 champs obligatoires dans le carnet. Les champs utiles n'en portent pas. */
export const MANDATORY_FIELD_ICONS: Record<MandatoryField, ReactNode> = {
  destination: <MapPinIcon />,
  dates: <CalendarIcon />,
  duration: <ClockIcon />,
  travellers: <TravellersIcon />,
};

function formatDestination(value: DestinationValue): string {
  if (value.mode === "open") {
    if (value.criteria.length > 0) return value.criteria.join(", ");
    if (value.zone) return value.zone;
    return "à définir";
  }
  if (value.places.length > 0) return value.places.join(", ");
  if (value.zone) return value.zone;
  return "à définir";
}

function formatDates(value: DatesValue): string {
  return value.label;
}

function formatDuration(value: DurationValue): string {
  if (value.minNights === value.maxNights) {
    return `${value.maxNights} nuit${value.maxNights > 1 ? "s" : ""}`;
  }
  return `${value.minNights} à ${value.maxNights} nuits`;
}

function formatTravellers(value: TravellersValue): string {
  return value.label;
}

const euroFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

function formatBudget(value: BudgetValue): string {
  const per = value.per === "person" ? "par personne" : "au total";
  if (value.min !== null && value.min > 0) {
    return `de ${euroFormatter.format(value.min)} à ${euroFormatter.format(value.max)} € ${per}`;
  }
  return `jusqu'à ${euroFormatter.format(value.max)} € ${per}`;
}

function formatTags(value: string[]): string {
  return value.join(", ");
}

export function formatFieldValue(field: BriefField, brief: TravelBrief): string | null {
  switch (field) {
    case "destination": {
      const value = brief.mandatory.destination.value;
      return value ? formatDestination(value) : null;
    }
    case "dates": {
      const value = brief.mandatory.dates.value;
      return value ? formatDates(value) : null;
    }
    case "duration": {
      const value = brief.mandatory.duration.value;
      return value ? formatDuration(value) : null;
    }
    case "travellers": {
      const value = brief.mandatory.travellers.value;
      return value ? formatTravellers(value) : null;
    }
    case "departure": {
      return brief.useful.departure.value;
    }
    case "budget": {
      const value = brief.useful.budget.value;
      return value ? formatBudget(value) : null;
    }
    case "style": {
      const value = brief.useful.style.value;
      return value && value.length > 0 ? formatTags(value) : null;
    }
    case "interests": {
      const value = brief.useful.interests.value;
      return value && value.length > 0 ? formatTags(value) : null;
    }
    case "constraints": {
      const value = brief.useful.constraints.value;
      return value && value.length > 0 ? formatTags(value) : null;
    }
    default:
      return null;
  }
}

export function formatAlternatives(field: BriefField, alternatives: unknown[]): string[] {
  switch (field) {
    case "destination":
      return (alternatives as DestinationValue[]).map(formatDestination);
    case "dates":
      return (alternatives as DatesValue[]).map(formatDates);
    case "duration":
      return (alternatives as DurationValue[]).map(formatDuration);
    case "travellers":
      return (alternatives as TravellersValue[]).map(formatTravellers);
    case "budget":
      return (alternatives as BudgetValue[]).map(formatBudget);
    case "departure":
      return alternatives as string[];
    case "style":
    case "interests":
    case "constraints":
      return (alternatives as string[][]).map(formatTags);
    default:
      return [];
  }
}

interface GenericSlot {
  status: SlotStatus;
  value: unknown;
  alternatives: unknown[];
  evidence: Evidence[];
}

export function getSlot(field: BriefField, brief: TravelBrief): GenericSlot {
  if ((MANDATORY_FIELDS as readonly string[]).includes(field)) {
    return brief.mandatory[field as MandatoryField];
  }
  return brief.useful[field as UsefulField];
}

interface SlotRowProps {
  title: string;
  status: SlotStatus;
  valueText: string | null;
  alternativesText?: string[];
  changed?: boolean;
  icon?: ReactNode;
  /** Raison de `completeness.missing` pour ce champ, affichée sous la ligne. */
  reason?: string;
}

export function SlotRow({
  title,
  status,
  valueText,
  alternativesText,
  changed,
  icon,
  reason,
}: SlotRowProps) {
  const badge = STATUS_LABELS[status];
  return (
    <div className={changed ? "slot-row slot-row--changed" : "slot-row"}>
      <div className="slot-row__head">
        {icon ? <span className="slot-row__icon">{icon}</span> : null}
        <span className="slot-row__title">{title}</span>
        {status === "confirmed" ? (
          // L'icône seule ne dit rien à un lecteur d'écran.
          <span className="slot-row__check" role="img" aria-label="confirmé">
            <CheckIcon />
          </span>
        ) : badge ? (
          <span className={`badge badge--${status}`}>{badge}</span>
        ) : null}
      </div>
      <p
        className={
          status === "unknown" ? "slot-row__value slot-row__value--muted" : "slot-row__value"
        }
      >
        {status === "unknown" ? "—" : (valueText ?? "—")}
      </p>
      {status === "conflicting" && alternativesText && alternativesText.length > 0 ? (
        <ul className="slot-row__alternatives">
          {alternativesText.map((alternative) => (
            <li key={alternative}>{alternative}</li>
          ))}
        </ul>
      ) : null}
      {reason ? <p className="slot-row__reason">{reason}</p> : null}
    </div>
  );
}

import {
  type BriefField,
  type Completeness,
  MANDATORY_FIELDS,
  type TravelBrief,
  USEFUL_FIELDS,
} from "../../shared/brief";
import { citationParleDe } from "../../shared/citation";
import type { Contact } from "../../shared/contact";
import { FIELD_LABELS, formatFieldValue, getSlot, STATUS_LABELS } from "./briefFormat";

/**
 * Le contenu du carnet que le voyageur emporte, sous forme de données. Le rendu PDF vit ailleurs
 * (`carnetPdf.ts`) : ici tout est vérifiable par un test, sans navigateur.
 *
 * Le carnet reprend ses propres phrases sous chaque information. C'est ce qui le distingue d'un
 * formulaire rempli : le voyageur doit s'y reconnaître, et voir d'où vient chaque valeur.
 */
export interface LigneCarnet {
  label: string;
  valeur: string;
  /** « à préciser », « à définir »… Vide quand l'information est sûre. */
  mention: string;
  /** La phrase du voyageur, sans guillemets. Vide s'il n'a rien dit là-dessus. */
  citation: string;
}

export interface SectionCarnet {
  titre: string;
  lignes: LigneCarnet[];
  /** Une phrase sous le titre, quand la section a besoin d'être expliquée. */
  note?: string;
}

export interface Carnet {
  titre: string;
  date: string;
  /** Le prénom et l'adresse du voyageur. Absent tant qu'il n'a pas validé son carnet. */
  contact: string | null;
  sections: SectionCarnet[];
  mots: string[];
  pied: string;
}

/**
 * Lignes qu'une phrase ne justifie que si elle nomme le lieu. Cas réel : « Vietnam » imprimé avec
 * « On aime la cuisine de rue et la baie d'Halong ». La durée ou les voyageurs, eux, se disent
 * souvent avec d'autres mots que la valeur (« 3 semaines » pour 21 nuits) : ils gardent leur
 * dernière phrase.
 */
const CITATION_STRICTE: ReadonlySet<BriefField> = new Set(["destination", "departure"]);

function ligne(champ: BriefField, brief: TravelBrief): LigneCarnet {
  const slot = getSlot(champ, brief);
  const valeur = formatFieldValue(champ, brief);
  // La phrase imprimée doit parler de ce qui est affiché : la plus récente qui en parle, sinon la
  // dernière, sauf pour les lignes strictes ci-dessus.
  const derniere = slot.evidence[slot.evidence.length - 1];
  const parlante = valeur
    ? [...slot.evidence].reverse().find((e) => citationParleDe([valeur], e.quote))
    : undefined;
  return {
    label: FIELD_LABELS[champ],
    valeur: valeur ?? "non précisé",
    mention: STATUS_LABELS[slot.status] ?? "",
    citation: (parlante ?? (CITATION_STRICTE.has(champ) ? undefined : derniere))?.quote ?? "",
  };
}

export function buildCarnet(
  brief: TravelBrief,
  completeness: Completeness,
  faitLe: Date,
  contact?: Contact | null,
): Carnet {
  const manquant = new Map(completeness.missing.map((m) => [m.field, m.reason]));
  const connus = USEFUL_FIELDS.filter((champ) => getSlot(champ, brief).status !== "unknown");
  // Seules les informations qui empêchent un carnet complet sont listées ici. Une information
  // utile non dite n'est pas un manque : le voyage s'organise sans.
  const aPreciser = MANDATORY_FIELDS.filter((champ) => manquant.has(champ)).map((champ) => ({
    label: FIELD_LABELS[champ],
    valeur: manquant.get(champ) ?? "",
    mention: "",
    citation: "",
  }));

  const sections: SectionCarnet[] = [
    {
      titre: "L'essentiel",
      lignes: MANDATORY_FIELDS.map((champ) => ligne(champ, brief)),
      // Ce qu'on suppose quand rien ne le contredit. Le dire au voyageur lui donne l'occasion de
      // corriger, plutôt que de le découvrir au moment de réserver.
      note: "Aller-retour, sauf indication contraire de votre part.",
    },
  ];
  if (connus.length > 0) {
    sections.push({
      titre: "Vos préférences",
      lignes: connus.map((champ) => ligne(champ, brief)),
    });
  }
  if (aPreciser.length > 0) {
    sections.push({
      titre: "Ce qui reste à préciser",
      lignes: aPreciser,
      note: "Ces informations manquent encore pour organiser votre voyage.",
    });
  }

  return {
    titre: "Votre carnet de voyage",
    date: `Préparé le ${faitLe.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`,
    contact: contact ? `pour ${contact.firstName}, ${contact.email}` : null,
    sections,
    mots: brief.nuances.map((n) => n.quote),
    pied: "Préparé à partir de vos propres mots. Bon voyage !",
  };
}

/**
 * Le nom du fichier téléchargé. Il porte la destination et le jour, parce qu'un nom fixe fait
 * ouvrir le mauvais carnet : le navigateur ajoute un numéro au deuxième téléchargement, et rien
 * ne distingue plus deux voyages dans un dossier.
 */
export function nomFichierCarnet(brief: TravelBrief, faitLe: Date): string {
  const lieu = sansAccent(formatFieldValue("destination", brief) ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  const jour = faitLe.toISOString().slice(0, 10);
  return `carnet-${lieu || "de-voyage"}-${jour}.pdf`;
}

function sansAccent(texte: string): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

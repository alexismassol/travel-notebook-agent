import { z } from "zod";
import { TravelBrief } from "../../shared/brief";
import { Contact } from "../../shared/contact";
import type { ConfirmState } from "../components/BriefSummary";
import type { ConversationState } from "./conversation";

/**
 * Le fil visible, gardé par le navigateur, pour qu'une actualisation ne reparte pas de zéro.
 *
 * Le serveur reste la seule source de vérité sur ce qui peut CONTINUER : il garde l'état du
 * modèle, et il l'oublie au bout de six heures. Ce stockage ne sert qu'à réafficher ce que le
 * voyageur avait sous les yeux pendant qu'on lui demande s'il existe encore.
 *
 * Règle tenue partout ici : une conversation gardée est un confort, jamais une condition pour
 * démarrer. Navigation privée, données de site bloquées, quota plein, fichier tronqué, forme
 * d'une version précédente : dans tous ces cas on repart d'une conversation neuve, sans erreur
 * affichée au voyageur.
 */

/** La version est dans le nom de la clé ET dans les données : changer de forme les ignore. */
export const CLE_STOCKAGE = "carnet-voyage:v1:conversations";
const VERSION = 1;

/** Assez pour retrouver ses essais de démonstration, assez peu pour ne pas gonfler le stockage. */
export const MAX_CONVERSATIONS_GARDEES = 5;

const TITRE_MAX = 80;

export interface ConversationSauvee {
  id: string;
  /** Échéance annoncée par le serveur, jamais recalculée ici : le délai est glissant. */
  expiresAt: string;
  savedAt: string;
  /** Première phrase du voyageur : de quoi reconnaître la conversation dans une liste. */
  titre: string;
  /** Carnets déjà validés. Hors de l'état du fil, et pourtant décisif : sans eux, une reprise
   *  réafficherait le bouton « Télécharger mon carnet de voyage » d'un carnet déjà validé. */
  confirmations: Record<string, ConfirmState>;
  /** Le contact donné à la validation : il fait partie du carnet que le voyageur retélécharge. */
  contact?: Contact | null;
  etat: ConversationState;
}

/**
 * On valide la forme, puis on garde l'objet d'origine. Passer par la sortie de Zod retirerait
 * les champs non décrits ici, donc une partie de l'état du fil.
 */
const EntreeSchema = z.object({
  id: z.string().min(1),
  expiresAt: z.string().min(1),
  savedAt: z.string().min(1),
  titre: z.string(),
  confirmations: z.record(z.string(), z.enum(["pending", "edit", "sent"])),
  /** Le contact donné à la validation, pour que le carnet le porte encore après un rechargement. */
  contact: Contact.nullable().optional(),
  etat: z.object({
    // Chaque entrée est validée avec ce qu'elle doit porter, pas seulement son type : une bulle
    // sans texte passerait le contrôle et s'afficherait vide.
    timeline: z.array(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("user"), id: z.string(), text: z.string() }),
        z.object({ type: z.literal("agent"), id: z.string(), parts: z.array(z.unknown()) }),
        z.object({
          type: z.literal("playbook"),
          id: z.string(),
          label: z.string(),
          reason: z.string(),
        }),
      ]),
    ),
    // Le carnet est validé par son vrai schéma : un carnet incomplet rendrait une page blanche,
    // puisque l'interface lit chaque emplacement sans se demander s'il existe.
    brief: TravelBrief,
    completeness: z.object({ ready: z.boolean(), mandatoryOk: z.number() }),
    awaiting: z.enum(["text", "choice", "brief_confirmation", "done"]),
    coutCumule: z.number(),
    toursTermines: z.number(),
  }),
});

const EnveloppeSchema = z.object({
  version: z.literal(VERSION),
  conversations: z.array(z.unknown()),
});

/** Le stockage du navigateur, ou rien du tout. Y accéder peut lever : c'est prévu. */
function parDefaut(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function lireBrut(stockage: Storage | null): ConversationSauvee[] {
  if (!stockage) return [];
  let texte: string | null;
  try {
    texte = stockage.getItem(CLE_STOCKAGE);
  } catch {
    return [];
  }
  if (texte === null) return [];
  let enveloppe: unknown;
  try {
    enveloppe = JSON.parse(texte);
  } catch {
    purger(stockage);
    return [];
  }
  const lue = EnveloppeSchema.safeParse(enveloppe);
  if (!lue.success) {
    purger(stockage);
    return [];
  }
  // Une entrée abîmée ne fait pas tomber les autres : elle est simplement écartée.
  return lue.data.conversations.filter(
    (entree): entree is ConversationSauvee => EntreeSchema.safeParse(entree).success,
  );
}

function purger(stockage: Storage | null): void {
  try {
    stockage?.removeItem(CLE_STOCKAGE);
  } catch {
    // Un stockage qui refuse d'effacer n'a rien à nous apprendre de plus.
  }
}

function ecrire(liste: ConversationSauvee[], stockage: Storage | null): boolean {
  if (!stockage) return false;
  const aEcrire = [...liste];
  // Quota plein : on sacrifie la plus ancienne et on réessaie, plutôt que de tout perdre.
  while (aEcrire.length > 0) {
    try {
      stockage.setItem(CLE_STOCKAGE, JSON.stringify({ version: VERSION, conversations: aEcrire }));
      return true;
    } catch {
      aEcrire.pop();
    }
  }
  return false;
}

/** Premier message du voyageur, quand le carnet ne dit encore rien du voyage. */
function premiereePhrase(etat: ConversationState): string | null {
  const premier = etat.timeline.find((entree) => entree.type === "user");
  if (premier?.type !== "user" || premier.text.trim() === "") return null;
  return premier.text.trim().replace(/\s+/g, " ");
}

/**
 * Comment reconnaître une conversation dans la liste, sans l'ouvrir.
 *
 * Le carnet dit déjà de quoi elle parle : le lieu, la période, le groupe. C'est plus parlant que
 * la première phrase, qui est souvent « bonjour » ou « je ne sais pas encore ». Et ça ne coûte
 * aucun appel au modèle : l'information est déjà structurée, il n'y a rien à résumer.
 */
export function titreDe(etat: ConversationState): string {
  const morceaux: string[] = [];
  const destination = etat.brief.mandatory.destination.value;
  const lieu =
    destination && destination.places.length > 0
      ? destination.places.slice(0, 2).join(" ou ")
      : (destination?.zone ?? null);
  if (lieu) morceaux.push(lieu);

  const dates = etat.brief.mandatory.dates.value;
  if (dates) morceaux.push(dates.label);

  const voyageurs = etat.brief.mandatory.travellers.value;
  if (morceaux.length < 2 && voyageurs) morceaux.push(voyageurs.label);

  const envies = etat.brief.useful.interests.value;
  if (morceaux.length === 0 && envies && envies.length > 0)
    morceaux.push(envies.slice(0, 2).join(", "));

  const titre = morceaux.length > 0 ? morceaux.join(", ") : premiereePhrase(etat);
  if (!titre) return "Nouvelle conversation";
  return titre.length > TITRE_MAX ? `${titre.slice(0, TITRE_MAX - 1)}…` : titre;
}

/** Les conversations gardées, la plus récemment écrite en premier. */
export function lireTout(stockage: Storage | null = parDefaut()): ConversationSauvee[] {
  return lireBrut(stockage);
}

export function lireDerniere(stockage: Storage | null = parDefaut()): ConversationSauvee | null {
  return lireBrut(stockage)[0] ?? null;
}

/** Écrit la conversation en tête de liste. Rend faux si le navigateur n'en a pas voulu. */
export function sauvegarder(
  entree: ConversationSauvee,
  stockage: Storage | null = parDefaut(),
): boolean {
  const autres = lireBrut(stockage).filter((gardee) => gardee.id !== entree.id);
  return ecrire([entree, ...autres].slice(0, MAX_CONVERSATIONS_GARDEES), stockage);
}

export function oublier(id: string, stockage: Storage | null = parDefaut()): void {
  const restantes = lireBrut(stockage).filter((gardee) => gardee.id !== id);
  if (restantes.length === 0) {
    purger(stockage);
    return;
  }
  ecrire(restantes, stockage);
}

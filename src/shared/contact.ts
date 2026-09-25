import { z } from "zod";

/**
 * Le prénom et l'adresse du voyageur, imprimés en tête de son carnet de voyage.
 *
 * Ces deux informations ne font pas partie du brief : le brief porte ce que le voyageur a dit de
 * son voyage, le contact n'est que l'enveloppe. Elles ne sont jamais écrites dans l'historique de
 * la conversation, donc jamais envoyées au modèle.
 *
 * Le prénom suffit à personnaliser le carnet, et l'adresse à le rattacher à son auteur. Rien de
 * plus : chaque champ de plus fait abandonner un voyageur.
 */
export const Contact = z.object({
  firstName: z.string().trim().min(1, "Indiquez votre prénom.").max(40),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(120, "Cette adresse est trop longue.")
    .pipe(z.email("Cette adresse e-mail semble incomplète. Vérifiez-la.")),
});
export type Contact = z.infer<typeof Contact>;

/** Le premier message d'erreur, prêt à afficher sous le champ fautif. */
export function contactError(donnees: unknown): string | null {
  const resultat = Contact.safeParse(donnees);
  return resultat.success ? null : (resultat.error.issues[0]?.message ?? "Vérifiez vos réponses.");
}

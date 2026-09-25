/**
 * Une citation parle-t-elle de l'une de ces valeurs ? Partagé entre le serveur, qui n'accroche une
 * phrase qu'aux cases dont elle parle, et le carnet, qui imprime sous chaque ligne la phrase qui
 * parle de ce qu'il affiche.
 */

/** Sans accents ni majuscules : « Baie d'Halong » et « la baie d'halong » se comparent. */
function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, " ");
}

/** Mots trop courants pour prouver qu'une phrase parle d'une valeur. */
const MOTS_VIDES = new Set([
  "avec",
  "dans",
  "pour",
  "sans",
  "plus",
  "tout",
  "tres",
  "vers",
  "chez",
]);

/**
 * Une citation parle-t-elle de l'une de ces valeurs ? `note_preferences` n'a qu'une citation par
 * appel, partagée entre le départ, le budget, le style, les envies et les contraintes. Cas réel :
 * « départ de Paris, budget autour de 4000 € » imprimé dans le carnet sous « Envies : cuisine de
 * rue ». On compare donc la phrase à chaque valeur : un mot de la valeur (ses quatre premières
 * lettres, pour « décos » et « décorations ») ou le montant, écrit « 4 000 » ou « 4k ».
 */
export function citationParleDe(valeurs: string[], citation: string): boolean {
  const texte = normaliser(citation);
  const chiffres = texte.replace(/(\d)[\s.\u00a0\u202f]+(?=\d{3}\b)/g, "$1");
  return valeurs.some((valeur) => {
    const brut = valeur.trim();
    if (/^\d+$/.test(brut)) {
      const n = Number(brut);
      const milliers = n % 1000 === 0 ? [`${n / 1000}k`, `${n / 1000} k`] : [];
      return (
        new RegExp(`\\b${brut}\\b`).test(chiffres) || milliers.some((m) => chiffres.includes(m))
      );
    }
    const mots = normaliser(brut)
      .split(/[^a-z0-9]+/)
      .filter((mot) => mot.length >= 4 && !MOTS_VIDES.has(mot));
    if (mots.length === 0) return texte.includes(normaliser(brut).trim());
    return mots.some((mot) => texte.includes(mot.slice(0, 4)));
  });
}

/**
 * Contrôle des renvois au code dans la documentation.
 *
 * Deux règles, tenues par une machine plutôt que par la mémoire :
 * 1. Aucun numéro de ligne (`fichier.ts:42`). Un numéro de ligne pourrit au premier changement de
 *    code, et une doc qui ment se retourne contre celui qui la présente. Un relevé a trouvé
 *    8 renvois faux, sur des lignes déplacées de quelques lignes seulement.
 * 2. Tout fichier cité doit exister. Un renvoi vers un fichier renommé est aussi mauvais.
 */
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const RACINE = new URL("..", import.meta.url).pathname;
// Deux formes vues en vrai : `App.tsx:195` et `App.tsx, 195`. La seconde a longtemps traversé
// le contrôle, et pointait dans le vide depuis plusieurs commits.
const LIGNE = /[\w/.-]+\.(?:tsx?|md)(?::|,\s?)\d+/g;
// Même défaut écrit en toutes lettres : « (lignes 55-68) » échappait au motif ci-dessus, et huit
// plages de lignes étaient devenues fausses sans que le contrôle ne le voie.
const LIGNES_EN_CLAIR = /\blignes?\s+\d+(?:\s*-\s*\d+)?/gi;
const CHEMIN = /`((?:src|scripts|tests|docs)\/[\w/.-]+\.(?:ts|tsx|md|json|css))`/g;

async function fichiersDoc() {
  const liste = ["README.md", "CONTRIBUTING.md", "CLAUDE.md"];
  for (const dossier of ["docs", "docs/scenarios"]) {
    for (const nom of await readdir(join(RACINE, dossier))) {
      if (nom.endsWith(".md")) liste.push(`${dossier}/${nom}`);
    }
  }
  return liste;
}

/**
 * Lisibilité : une phrase de plus de 30 mots se relit deux fois. Seuil repris du contrôle
 * « lisible par un lycéen » (US Federal Plain Language Guidelines : 20 en moyenne, jamais plus de
 * 40 ; 30 ici, pour un lecteur de 15 ans). Le contrôle vit DANS le dépôt : quelqu'un qui clone doit
 * pouvoir le lancer sans rien installer.
 */
const MAX_MOTS_PAR_PHRASE = 30;

function nettoyer(texte) {
  return texte
    .replace(/`[^`]*`/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Découpe un document en phrases, ligne par ligne, comme le fait le contrôle de référence
 * « lisible par un lycéen ». Une ligne de tableau compte pour une phrase : ses cellules se lisent
 * d'un bloc, et une ligne trop chargée fatigue autant qu'une phrase longue.
 */
function phrases(markdown) {
  const sansCode = markdown.replace(/```[\s\S]*?```/g, "\n");
  const morceaux = [];
  for (const ligne of sansCode.split("\n")) {
    const brute = ligne.trim();
    if (!brute || brute.startsWith("#") || /^\|[-: |]+\|$/.test(brute)) continue;
    const texte = nettoyer(brute);
    if (!texte) continue;
    for (const phrase of texte.split(/(?<=[.!?…])\s+/)) {
      const propre = phrase.trim();
      if (propre) morceaux.push(propre);
    }
  }
  return morceaux;
}

const problemes = [];
for (const doc of await fichiersDoc()) {
  const texte = await readFile(join(RACINE, doc), "utf8");
  for (const [i, ligne] of texte.split("\n").entries()) {
    for (const trouve of ligne.match(LIGNE) ?? []) {
      problemes.push(`${doc}:${i + 1} renvoi avec un numéro de ligne : ${trouve}`);
    }
    for (const trouve of ligne.match(LIGNES_EN_CLAIR) ?? []) {
      problemes.push(`${doc}:${i + 1} renvoi avec un numéro de ligne : ${trouve}`);
    }
    for (const m of ligne.matchAll(CHEMIN)) {
      if (!existsSync(join(RACINE, m[1]))) {
        problemes.push(`${doc}:${i + 1} fichier cité introuvable : ${m[1]}`);
      }
    }
  }
  // Les transcriptions de `docs/scenarios/` sont des mesures brutes : le texte vient du modèle,
  // on ne le réécrit pas, sinon ce ne serait plus une mesure.
  const estTranscription = /^docs\/scenarios\/\d/.test(doc);
  for (const phrase of estTranscription ? [] : phrases(texte)) {
    const mots = phrase.split(/\s+/).filter(Boolean).length;
    if (mots > MAX_MOTS_PAR_PHRASE) {
      problemes.push(
        `${doc} phrase de ${mots} mots (${MAX_MOTS_PAR_PHRASE} au plus) : « ${phrase.slice(0, 80)}… »`,
      );
    }
  }
}

if (problemes.length > 0) {
  console.error(`Renvois à corriger (${problemes.length}) :`);
  for (const p of problemes) console.error(`  ${p}`);
  console.error("\nCiter le fichier et le nom de la fonction, jamais un numéro de ligne.");
  console.error("Couper une phrase trop longue en deux : les faits restent, la lecture passe.");
  process.exit(1);
}
console.log("Documentation : renvois valides, aucune phrase de plus de 30 mots.");

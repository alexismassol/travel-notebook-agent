import { readFileSync } from "node:fs";

/**
 * Registre des playbooks : des jeux d'instructions chargés à la demande par l'outil
 * `load_playbook`, jamais placés dans le prompt système.
 *
 * Ce qui est en contexte permanent : le nom et le `whenToLoad` de chaque playbook, via la
 * description de l'outil. Le contenu, lui, n'est lu sur le disque qu'à l'appel de l'outil.
 */

export const PLAYBOOKS = {
  "voyage-en-famille": {
    file: new URL("./voyage-en-famille.md", import.meta.url),
    /** Libellé montré au voyageur quand le playbook est chargé. */
    label: "Conseils voyage en famille",
    whenToLoad:
      "dès que le voyage inclut des enfants ou que le voyageur parle de sa famille " +
      "(« avec les petits », « ma fille de 3 ans », « en famille »), avant de recommander ou de " +
      "poser d'autres questions",
  },
  "voyage-pour-une-fete": {
    file: new URL("./voyage-pour-une-fete.md", import.meta.url),
    label: "Conseils voyage pour une fête",
    whenToLoad:
      "dès que le voyage est posé sur une fête ou un événement daté (« pour Halloween », " +
      "« la Saint-Patrick », « les marchés de Noël », « le carnaval », « le Nouvel An »), " +
      "avant de proposer un lieu",
  },
  "voyage-surprise": {
    file: new URL("./voyage-surprise.md", import.meta.url),
    label: "Conseils voyage surprise",
    whenToLoad:
      "dès que le voyageur veut être surpris ou cherche l'inattendu (« surprenez-moi », « un " +
      "truc original », « quelque chose d'insolite », « une expérience inoubliable »), avant de " +
      "proposer des lieux",
  },
} as const;

export type PlaybookName = keyof typeof PLAYBOOKS;
export const PLAYBOOK_NAMES = Object.keys(PLAYBOOKS) as [PlaybookName, ...PlaybookName[]];

export function readPlaybook(name: PlaybookName): string {
  return readFileSync(PLAYBOOKS[name].file, "utf8");
}

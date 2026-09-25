---
name: implementeur-outil
description: Ajoute un outil d'agent de bout en bout dans src/server/agent/tools/. Couvre le schéma Zod des paramètres, et la définition d'outil, avec une description qui dit QUAND l'appeler. Couvre aussi le handler, le drapeau terminal ou non dans le registre index.ts, et l'événement SSE dédié si l'outil rend un UiBlock (src/shared/events.ts). Couvre enfin le test unitaire du handler. À utiliser pour tout nouvel outil ou toute modification d'un des neuf outils déjà listés dans ce registre. Ne touche jamais system-prompt.ts pour y mettre des instructions métier.
tools: Read, Edit, Write, Bash, Grep, Glob
model: sonnet
---

Un outil existe s'il change l'état du brief, va chercher ce que le modèle ne sait pas, ou
produit un rendu que le texte seul ne fait pas (`docs/plan-initial.md` §4). Si la demande ne
rentre dans aucun des trois, c'est du texte, pas un outil : le dire plutôt que d'en créer un.

## Entrées attendues

Le nom de l'outil, son rôle en une phrase, et s'il est terminal (le tour s'arrête, l'interface
attend le voyageur, comme `ask_choice`/`present_brief`) ou non (le modèle continue, comme
`note_*`/`load_playbook`/`show_destination_cards`).

## Procédure

1. Schéma Zod des paramètres dans le fichier de l'outil (`src/server/agent/tools/<nom>.ts`).
   Jamais un objet libre : chaque champ que le modèle peut envoyer doit être typé et validé.
2. Définition d'outil (nom, description, schéma JSON dérivé du Zod). La description dit QUAND
   l'appeler, avec un déclencheur concret ("dès que...", "quand le voyageur...").
   Jamais un résumé de ce qu'il fait en interne.
3. Handler : applique l'effet (patch du brief via `apply-patch.ts`, appel réseau, construction
   d'un `UiBlock`) et retourne un `tool_result` exploitable par le modèle. Pas de `console.log`
   à la place d'un retour structuré.
4. Registre `src/server/agent/tools/index.ts` : ajoute l'outil avec son drapeau terminal, et
   vérifie que `loop.ts` respecte ce drapeau (arrêt du tour, pas de relance après un outil
   terminal).
5. Si l'outil rend un `UiBlock` (`src/shared/events.ts`), ajoute ou réutilise l'événement SSE
   `ui_block` correspondant. Jamais un nouveau champ ad hoc en dehors de `ServerEvent`.
6. Test unitaire du handler (Zod invalide rejeté, effet correct sur un brief de test, `UiBlock`
   bien formé). Pas seulement un test qui vérifie que la fonction existe.
7. `npm run check`.

## Format de sortie

La liste des fichiers touchés, le résultat du test unitaire (sortie collée), et une phrase sur
le drapeau terminal choisi et pourquoi.

## Documentation de référence

Avant d'ajouter un outil, lire `docs/spec-technique.md` §2 "Outils" (le tableau complet) et
`docs/choix-techniques.md` décision 7 (mode strict, limite de 16 paramètres union, garde-fou de
syntaxe). Un outil `strict: true` à objets imbriqués a déjà cassé Haiku 4.5 (décision 7, mesuré).
Une fois l'outil livré, ajoute sa ligne au tableau de `docs/spec-technique.md` §2, ou signale-le
pour `gardien-docs` si cette tâche ne te charge pas de toucher aux docs.

## Interdits

- N'ajoute aucune instruction métier (ton, checklist, règle produit) dans `system-prompt.ts`.
  Ça part dans un playbook (skill `ajouter-un-playbook`) si elle ne concerne pas 100 % des
  conversations, ou en 1-2 lignes seulement si elle les concerne toutes.
- Ne construis pas les coordonnées ou la photo d'une destination à partir d'un texte du modèle.
  Ça reste résolu côté serveur (Wikipédia), jamais écrit par le modèle.

---
name: synchroniser-docs
description: Lancer l'agent gardien-docs pour aligner docs/ sur le code après une tranche qui touche src/server/agent/, src/shared/, src/web/ ou scripts/. Se déclenche aussi quand .githooks/commit-msg refuse un commit avec "ce commit touche le coeur de l'agent [...] sans mettre a jour la documentation". À utiliser en fin de tranche (skill tranche, avant le commit) ou dès ce refus.
---

# Synchroniser docs

`docs/` ne se corrige pas de mémoire : ce skill dit quand lancer `gardien-docs` et comment
vérifier que le résultat est vrai, pas seulement qu'il a été écrit.

## Quand

- Fin d'une tranche (skill `tranche`) qui touche `src/server/agent/`, `src/shared/`,
  `src/web/` ou `scripts/` : avant le commit, pas après coup.
- Le hook `.githooks/commit-msg` refuse un commit avec la règle "Regle docs a jour" (il touche
  `src/server/agent/` ou `src/shared/` sans qu'un document de `docs/` soit dans le même commit).
  Le message du hook cite déjà `.claude/agents/gardien-docs.md`.
- Un rappel de session (hook Claude Code local) signale une dérive.

## Comment

1. Lister les fichiers modifiés non encore commités : `git diff --stat` (ou la liste que la
   tranche a déjà en main, ne pas la redemander).
2. Lancer l'agent `gardien-docs` avec cette liste précise : jamais "relis toute la doc".
3. Lire son rapport en entier : quels documents corrigés, quel avant/après, quelle entrée
   de `docs/choix-techniques.md` modifiée si une décision a changé. Un rapport qui ne cite aucun `fichier:ligne`
   n'est pas vérifiable, le redemander.
4. `npm run check`.

## Critère de fin, vérifiable par machine

- Tout nom d'outil cité dans `docs/*.md` existe dans `src/server/agent/tools/` :
  `grep -rohE '"(note_destination|note_dates|note_duration|note_travellers|note_preferences|load_playbook|ask_choice|show_destination_cards|present_brief)"' docs/*.md | sort -u`
  puis vérifier chaque nom avec `grep -rl "<nom>" src/server/agent/tools/`.
- Tout chemin `src/...` cité dans `docs/*.md` existe :
  `grep -ohE 'src/[A-Za-z0-9_./-]+\.tsx?' docs/*.md | sort -u | xargs -I{} test -e {}`.
  Lister les manquants, ne pas les deviner.
- `npm run check` termine vert (lint, typecheck, tests).

Les trois doivent être vrais en même temps. Un seul manquant = la synchronisation n'est pas
terminée, même si `gardien-docs` a rendu un rapport.

## Interdits

- Ne pas lancer `gardien-docs` sur l'intégralité de `docs/` sans liste de fichiers modifiés :
  ça revient à lui faire deviner ce qui a changé.
- Ne pas marquer terminé sur la seule confiance dans le rapport de l'agent : les trois contrôles
  ci-dessus sont la preuve, le rapport est l'hypothèse.

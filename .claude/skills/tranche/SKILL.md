---
name: tranche
description: Procédure d'une tranche de construction sur ce projet (découpage T0-T6 de docs/plan-initial.md). Étapes : décision expliquée avant le code, TDD rouge puis vert, npm run check, doc à jour si un comportement change, commit conventionnel court. À utiliser à chaque tranche ou sous-tâche de code touchant src/, tests/ ou scripts/.
---

# Tranche

Une tranche ne commence jamais par du code. Elle finit toujours par une trace vérifiable :
un test vert montré, une doc à jour si un comportement change, un commit.

## Procédure

1. **Nommer le problème.** Une phrase : ce que le voyageur, son carnet ou le code actuel ne
   peuvent pas faire aujourd'hui.
2. **Lister les options réelles**, pas une seule option déguisée en évidence. Pour chaque
   option : pour / contre, en une ligne chacun. Si une option a déjà été tranchée dans
   `docs/plan-initial.md` ou dans le registre `docs/choix-techniques.md`, le dire et ne pas la
   rejouer.
3. **Choisir et chiffrer le coût.** Le choix et ce qu'il coûte (tokens, tests à écrire, dette
   assumée) s'écrivent avant la première ligne de code. Rien qui ne s'explique pas en
   quelques lignes. Une décision structurante (nouvel outil, choix
   d'architecture) devient une entrée de `docs/choix-techniques.md`, pas seulement un commentaire.
4. **Écrire le test rouge.** Un test qui échoue pour la bonne raison : lancer
   `npm test -- <fichier>` et montrer l'échec, pas le décrire.
5. **Écrire le code minimal** qui fait passer ce test, rien de plus. Pas de gestion d'un cas
   que le test ne couvre pas.
6. **Montrer le test vert.** Même commande, même fichier, sortie verte collée telle quelle.
7. **`npm run check`** (lint + typecheck + test) sur l'ensemble du dépôt, pas seulement le
   fichier touché. Un échec ailleurs bloque la tranche.
8. **Issue dans `.claude/ACTION_PLAN.md`** (plan local, non versionné) : la tranche et son
   issue, notée `fait`, `a résisté` (partiel, raison) ou `abandonné` (raison, option retenue à la place).
9. **`git status --short`** avant tout `git add` : lire la liste, ajouter des chemins
   explicites, jamais `-A` ni `.`.
10. **Commit court**, anglais, conventionnel (`feat:`, `fix:`, `test:`, `chore:`...), sans
    `Co-Authored-By`. `.githooks/commit-msg` refuse tout
    commit qui touche `src/server/agent/` ou `src/shared/` sans doc à jour dans le même commit :
    le vérifier avant de committer, pas après un rejet.

## Documentation de référence

Avant de nommer le problème, vérifier si `docs/spec-technique.md`, `docs/spec-fonctionnelle.md`
ou `docs/choix-techniques.md` décrivent déjà l'état actuel. Une tranche part de ce qui est
vrai, pas de ce qu'on suppose. Si la tranche change un comportement documenté, corriger la
section concernée dans le même commit (ou déléguer à `gardien-docs`), jamais après coup.

## Critère de fin

La tranche est finie quand les quatre sont vrais en même temps : test vert affiché,
`npm run check` sans erreur, doc à jour si un comportement change, commit passé (hook inclus).
Un seul manquant = tranche non close.

# Essai de robustesse : 12 intentions jamais vues

## À quoi sert ce document

Les 16 scénarios de référence ont servi à régler l'agent. Un agent réglé sur ses propres cas
peut très bien s'écrouler ailleurs : c'est le piège classique de l'évaluation. Cet essai rejoue
donc 12 intentions nouvelles, écrites sans regarder les réponses, 2 fois chacune, sur le vrai
modèle et la vraie recherche web. On y lit ce qui tient hors du terrain d'entraînement, et ce qui
craque.

Les messages du voyageur sont dans [`scripts/spikes/robustesse.json`](../../scripts/spikes/robustesse.json).
Commande : `SCENARIO_FILE=scripts/spikes/robustesse.json SCENARIO_REPEAT=2 npm run scenarios`. Les
transcriptions complètes s'écrivent dans `data/spikes/`, hors dépôt ; le tableau ci-dessous en est
la copie, mesure du 2026-09-25 sur le code final. Une réponse peut contenir le mot « brief » parce
que le voyageur l'a écrit lui-même (tentative d'injection).

Comment lire les colonnes : voir [`README.md`](README.md). « Superlatif », « Narration », « brief » et
« Réponse > 80 mots » sont comptés en code (`src/server/agent/reply-metrics.ts`).

## Taux sur 2 passages par scénario

| Scénario | 4/4 atteint | Carnet validé | Fiche affichée | Question à choix | Recherche web | Tutoiement | Superlatif | Narration | « brief » | 2 questions | Réponse > 80 mots | Coût moyen | Tour le plus long (ms) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Hésitation entre deux pays | 0/2 | 0/2 | 0/2 | 1/2 | 2/2 | 0/2 | 2/2 | 1/2 | 0/2 | 0/2 | 2/2 | 0.0315 $ | 15844 |
| Voyage de noces sans destination | 0/2 | 0/2 | 0/2 | 1/2 | 0/2 | 0/2 | 1/2 | 2/2 | 0/2 | 0/2 | 0/2 | 0.0146 $ | 13321 |
| Contrainte de mobilité | 0/2 | 0/2 | 0/2 | 1/2 | 0/2 | 0/2 | 0/2 | 2/2 | 0/2 | 0/2 | 0/2 | 0.0152 $ | 12864 |
| Budget déconnecté de la réalité | 2/2 | 0/2 | 0/2 | 0/2 | 2/2 | 0/2 | 0/2 | 2/2 | 0/2 | 0/2 | 2/2 | 0.0245 $ | 11751 |
| Envie qui se heurte à la réalité | 0/2 | 0/2 | 0/2 | 0/2 | 1/2 | 0/2 | 2/2 | 1/2 | 0/2 | 1/2 | 2/2 | 0.0186 $ | 9777 |
| Aucune idée | 0/2 | 0/2 | 0/2 | 1/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0.0091 $ | 5011 |
| Message long et désordonné | 0/2 | 0/2 | 0/2 | 2/2 | 2/2 | 0/2 | 2/2 | 1/2 | 0/2 | 0/2 | 2/2 | 0.0346 $ | 13182 |
| Message en anglais | 0/2 | 0/2 | 0/2 | 2/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0.0151 $ | 13006 |
| Question hors sujet | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0.0070 $ | 1994 |
| Tentative d'injection | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 1/2 | 0/2 | 0.0071 $ | 3623 |
| Correction au deuxième message | 2/2 | 0/2 | 0/2 | 1/2 | 0/2 | 0/2 | 2/2 | 1/2 | 0/2 | 1/2 | 1/2 | 0.0219 $ | 13009 |
| Question de formalités | 0/2 | 0/2 | 0/2 | 0/2 | 2/2 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 | 1/2 | 0.0204 $ | 10543 |

Total de tous les passages : 0.4393 $ en tokens, 13 recherche(s) web.

## Avant et après ce round (même essai, même nombre de passages)

| Mesure | Avant | Après |
|---|---|---|
| Question à choix posée | 5 passages sur 24 | 9 sur 24 |
| Recherche web lancée | 7 passages sur 24 | 9 sur 24 |
| Fiches pour le voyage de noces | 0 sur 2 | 0 sur 2 |
| Tutoiement | 0 sur 24 | 0 sur 24 |

« Avant » : même essai lancé le 2026-09-17, avant les correctifs de fidélité, de question
suivante et de fiches (`docs/choix-techniques.md`, décisions 9, 15, 17 et 18). « Après » : la
mesure du 2026-09-25 ci-dessus, sur le code final.

# Scénarios rejoués sur l'agent réel

Généré par `npm run scenarios`. Chaque ligne renvoie à la transcription complète.

Trois mesures réelles du 2026-09-25 composent cette page, sur le même code de scénarios.

- Le tableau des taux vient de la campagne du filtre des phrases de coulisses (décision 44).
- Le premier passage et ses transcriptions viennent de la campagne précédente, avant ce filtre.
- L'annexe mesure le prompt de la décision 46, sur 48 passages de plus.

Les transcriptions des deux dernières campagnes n'ont pas été gardées : seuls leurs tableaux le sont.
Le code livré ajoute les décisions 44 à 47 durcies : une nouvelle campagne n'a pas été lancée depuis.

## Taux sur 3 passages par scénario

| Scénario | 4/4 atteint | Carnet validé | Fiche affichée | Question à choix | Recherche web | Tutoiement | Superlatif | Narration | « brief » | 2 questions | Réponse > 80 mots | Coût moyen | Tour le plus long (ms) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Destination ouverte, en famille | 0/3 | 0/3 | 3/3 | 2/3 | 3/3 | 0/3 | 3/3 | 1/3 | 0/3 | 0/3 | 0/3 | 0.0474 $ | 40593 |
| Informations déjà complètes | 3/3 | 3/3 | 0/3 | 0/3 | 2/3 | 0/3 | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0.0223 $ | 11045 |
| Demande de conseil qui se heurte à la réalité | 0/3 | 0/3 | 0/3 | 2/3 | 3/3 | 0/3 | 1/3 | 0/3 | 0/3 | 0/3 | 3/3 | 0.0206 $ | 11235 |
| Envie floue à ancrer | 0/3 | 0/3 | 3/3 | 0/3 | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0.0266 $ | 23834 |
| Dépaysement sans la foule | 0/3 | 0/3 | 1/3 | 1/3 | 1/3 | 0/3 | 1/3 | 1/3 | 0/3 | 0/3 | 0/3 | 0.0205 $ | 28882 |
| Contradiction dans la durée | 1/3 | 0/3 | 0/3 | 2/3 | 0/3 | 0/3 | 1/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0.0161 $ | 9874 |
| Composition variable (question à choix attendue) | 0/3 | 0/3 | 0/3 | 3/3 | 0/3 | 0/3 | 1/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0.0114 $ | 10113 |
| Tout donné dès le premier message | 3/3 | 3/3 | 0/3 | 0/3 | 1/3 | 0/3 | 3/3 | 0/3 | 0/3 | 1/3 | 1/3 | 0.0205 $ | 12615 |
| Le voyageur ne sait pas et le dit | 0/3 | 0/3 | 0/3 | 3/3 | 0/3 | 0/3 | 1/3 | 2/3 | 0/3 | 3/3 | 0/3 | 0.0198 $ | 6792 |
| Le voyageur hésite à partir | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 2/3 | 0/3 | 0.0096 $ | 5788 |
| Demande hors sujet, puis retour au voyage | 0/3 | 0/3 | 0/3 | 2/3 | 0/3 | 0/3 | 3/3 | 0/3 | 0/3 | 1/3 | 0/3 | 0.0121 $ | 7895 |
| Le voyageur se contredit dans la même phrase | 0/3 | 0/3 | 0/3 | 2/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0.0100 $ | 7866 |
| Le voyageur pressé veut son carnet tout de suite | 0/3 | 0/3 | 0/3 | 3/3 | 1/3 | 0/3 | 1/3 | 1/3 | 0/3 | 2/3 | 0/3 | 0.0182 $ | 10052 |
| Le voyageur écrit en anglais | 0/3 | 0/3 | 0/3 | 2/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 1/3 | 0/3 | 0.0130 $ | 9128 |
| Le voyageur pose les questions | 0/3 | 0/3 | 3/3 | 3/3 | 3/3 | 0/3 | 3/3 | 1/3 | 0/3 | 1/3 | 2/3 | 0.0611 $ | 20172 |
| Le voyageur veut être surpris | 0/3 | 0/3 | 2/3 | 0/3 | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | 2/3 | 0/3 | 0.0668 $ | 54570 |

Total de tous les passages : 1.1883 $ en tokens, 26 recherche(s) web.

## Premier passage (transcriptions)

| Scénario | Tours | Obligatoires | Carnet validé | Playbook | Recherches | Question à choix | Tutoiement | Durée par tour (ms) | Coût tokens |
|---|---|---|---|---|---|---|---|---|---|
| [Destination ouverte, en famille](1-destination-ouverte-famille.md) | 2 | 2/4 | non | voyage-en-famille (spontaneous) | 0 | oui | 0 | 10898 / 42720 | 0.0592 $ |
| [Informations déjà complètes](2-infos-completes.md) | 2 | 4/4 | oui | - | 0 | non | 0 | 14228 / 2195 | 0.0286 $ |
| [Demande de conseil qui se heurte à la réalité](3-conseil-trek-nepal.md) | 1 | 2/4 | non | - | 1 | oui | 0 | 8443 | 0.0283 $ |
| [Envie floue à ancrer](4-envie-floue-zanzibar.md) | 1 | 0/4 | non | - | 1 | non | 0 | 10728 | 0.0252 $ |
| [Dépaysement sans la foule](5-depaysement-sans-la-foule.md) | 1 | 3/4 | non | - | 2 | non | 0 | 29485 | 0.0704 $ |
| [Contradiction dans la durée](6-contradiction.md) | 2 | 4/4 | non | - | 0 | non | 0 | 11829 / 5947 | 0.0244 $ |
| [Composition variable (question à choix attendue)](7-composition-variable.md) | 1 | 3/4 | non | - | 0 | oui | 0 | 11254 | 0.0189 $ |
| [Tout donné dès le premier message](9-tout-dun-coup.md) | 2 | 4/4 | oui | - | 1 | non | 0 | 16312 / 1789 | 0.0338 $ |
| [Le voyageur ne sait pas et le dit](10-je-ne-sais-pas.md) | 4 | 0/4 | non | - | 0 | oui | 0 | 5702 / 3351 / 6167 / 7096 | 0.0264 $ |
| [Le voyageur hésite à partir](11-pas-sur-de-partir.md) | 2 | 0/4 | non | - | 0 | non | 0 | 3516 / 7986 | 0.0179 $ |
| [Demande hors sujet, puis retour au voyage](12-hors-sujet-puis-retour.md) | 2 | 3/4 | non | - | 0 | oui | 0 | 1643 / 6295 | 0.0199 $ |
| [Le voyageur se contredit dans la même phrase](13-contradictions-dans-une-phrase.md) | 1 | 0/4 | non | - | 0 | oui | 0 | 10596 | 0.0182 $ |
| [Le voyageur pressé veut son carnet tout de suite](14-voyageur-presse.md) | 2 | 2/4 | non | - | 1 | oui | 0 | 9717 / 2366 | 0.0331 $ |
| [Le voyageur écrit en anglais](15-voyageur-en-anglais.md) | 1 | 1/4 | non | voyage-en-famille (spontaneous) | 0 | oui | 0 | 12929 | 0.0210 $ |
| [Le voyageur pose les questions](8-le-voyageur-interroge.md) | 4 | 3/4 | non | - | 2 | oui | 0 | 5752 / 16127 / 6206 / 16260 | 0.0708 $ |
| [Le voyageur veut être surpris](16-surprenez-moi.md) | 1 | 3/4 | non | voyage-surprise (spontaneous) | 1 | non | 0 | 35268 | 0.0521 $ |

Total : 0.5481 $ en tokens, 9 recherche(s) web facturées en plus. Durées mesurées côté serveur, du message reçu à la fin du tour.

## Annexe : taux après le prompt de la décision 46

Même campagne de 48 passages, avec le nouveau prompt et la première version du filtre. Un
passage du mode surprise s'est arrêté sur une recherche web illisible, corrigée ensuite (décision 47).

| Scénario | 4/4 atteint | Carnet validé | Fiche affichée | Question à choix | Recherche web | Tutoiement | Superlatif | Narration | « brief » | 2 questions | Réponse > 80 mots | Coût moyen | Tour le plus long (ms) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Destination ouverte, en famille | 0/3 | 0/3 | 3/3 | 0/3 | 3/3 | 0/3 | 3/3 | 0/3 | 0/3 | 0/3 | 1/3 | 0.0418 $ | 33042 |
| Informations déjà complètes | 3/3 | 3/3 | 0/3 | 0/3 | 2/3 | 0/3 | 1/3 | 1/3 | 0/3 | 0/3 | 2/3 | 0.0219 $ | 15716 |
| Demande de conseil qui se heurte à la réalité | 0/3 | 0/3 | 0/3 | 1/3 | 3/3 | 0/3 | 1/3 | 0/3 | 0/3 | 0/3 | 3/3 | 0.0197 $ | 12439 |
| Envie floue à ancrer | 0/3 | 0/3 | 3/3 | 0/3 | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0.0253 $ | 17795 |
| Dépaysement sans la foule | 0/3 | 0/3 | 1/3 | 0/3 | 1/3 | 0/3 | 1/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0.0257 $ | 43658 |
| Contradiction dans la durée | 1/3 | 0/3 | 0/3 | 2/3 | 0/3 | 0/3 | 2/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0.0166 $ | 12000 |
| Composition variable (question à choix attendue) | 0/3 | 0/3 | 0/3 | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0.0114 $ | 11763 |
| Tout donné dès le premier message | 3/3 | 3/3 | 0/3 | 0/3 | 2/3 | 0/3 | 2/3 | 0/3 | 0/3 | 0/3 | 2/3 | 0.0226 $ | 18227 |
| Le voyageur ne sait pas et le dit | 0/3 | 0/3 | 0/3 | 3/3 | 0/3 | 0/3 | 1/3 | 0/3 | 0/3 | 3/3 | 0/3 | 0.0193 $ | 7400 |
| Le voyageur hésite à partir | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 3/3 | 0/3 | 0.0117 $ | 8112 |
| Demande hors sujet, puis retour au voyage | 0/3 | 0/3 | 0/3 | 1/3 | 0/3 | 0/3 | 0/3 | 1/3 | 0/3 | 0/3 | 0/3 | 0.0119 $ | 10174 |
| Le voyageur se contredit dans la même phrase | 0/3 | 0/3 | 0/3 | 2/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 1/3 | 0/3 | 0.0096 $ | 8961 |
| Le voyageur pressé veut son carnet tout de suite | 0/3 | 0/3 | 0/3 | 3/3 | 0/3 | 0/3 | 1/3 | 2/3 | 0/3 | 0/3 | 0/3 | 0.0136 $ | 10335 |
| Le voyageur écrit en anglais | 0/3 | 0/3 | 0/3 | 2/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0.0145 $ | 14998 |
| Le voyageur pose les questions | 0/3 | 0/3 | 3/3 | 2/3 | 3/3 | 0/3 | 2/3 | 1/3 | 0/3 | 1/3 | 3/3 | 0.0633 $ | 27830 |
| Le voyageur veut être surpris | 0/3 | 0/3 | 1/3 | 0/3 | 2/3 | 0/3 | 2/3 | 0/3 | 0/3 | 1/3 | 1/3 | 0.0524 $ | 52144 |

Total de tous les passages : 1.1447 $ en tokens, 25 recherche(s) web.

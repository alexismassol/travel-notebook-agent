# Scénarios rejoués sur l'agent réel

Généré par `npm run scenarios`. Chaque ligne renvoie à la transcription complète.

## Taux sur 3 passages par scénario

| Scénario | 4/4 atteint | Carnet validé | Fiche affichée | Question à choix | Recherche web | Tutoiement | Superlatif | Narration | « brief » | 2 questions | Réponse > 80 mots | Coût moyen | Tour le plus long (ms) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Destination ouverte, en famille | 0/3 | 0/3 | 3/3 | 2/3 | 2/3 | 0/3 | 3/3 | 2/3 | 0/3 | 0/3 | 0/3 | 0.0446 $ | 42720 |
| Informations déjà complètes | 3/3 | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | 3/3 | 2/3 | 0/3 | 0/3 | 1/3 | 0.0171 $ | 14228 |
| Demande de conseil qui se heurte à la réalité | 0/3 | 0/3 | 0/3 | 1/3 | 3/3 | 0/3 | 3/3 | 0/3 | 0/3 | 0/3 | 3/3 | 0.0196 $ | 8443 |
| Envie floue à ancrer | 0/3 | 0/3 | 3/3 | 0/3 | 3/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0.0229 $ | 18677 |
| Dépaysement sans la foule | 0/3 | 0/3 | 2/3 | 0/3 | 2/3 | 0/3 | 0/3 | 0/3 | 0/3 | 1/3 | 0/3 | 0.0461 $ | 31391 |
| Contradiction dans la durée | 1/3 | 0/3 | 1/3 | 1/3 | 1/3 | 0/3 | 3/3 | 2/3 | 0/3 | 0/3 | 0/3 | 0.0226 $ | 20824 |
| Composition variable (question à choix attendue) | 0/3 | 0/3 | 0/3 | 1/3 | 0/3 | 0/3 | 3/3 | 1/3 | 0/3 | 0/3 | 0/3 | 0.0110 $ | 11254 |
| Tout donné dès le premier message | 3/3 | 3/3 | 0/3 | 0/3 | 2/3 | 0/3 | 3/3 | 2/3 | 0/3 | 0/3 | 2/3 | 0.0226 $ | 16312 |
| Le voyageur ne sait pas et le dit | 0/3 | 0/3 | 1/3 | 3/3 | 1/3 | 0/3 | 2/3 | 3/3 | 0/3 | 3/3 | 0/3 | 0.0292 $ | 31029 |
| Le voyageur hésite à partir | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 0/3 | 3/3 | 0/3 | 0.0094 $ | 7986 |
| Demande hors sujet, puis retour au voyage | 0/3 | 0/3 | 0/3 | 3/3 | 0/3 | 0/3 | 1/3 | 2/3 | 0/3 | 0/3 | 0/3 | 0.0125 $ | 6295 |
| Le voyageur se contredit dans la même phrase | 0/3 | 0/3 | 0/3 | 2/3 | 0/3 | 0/3 | 0/3 | 1/3 | 0/3 | 1/3 | 0/3 | 0.0095 $ | 10596 |
| Le voyageur pressé veut son carnet tout de suite | 0/3 | 0/3 | 0/3 | 3/3 | 2/3 | 0/3 | 2/3 | 0/3 | 0/3 | 1/3 | 0/3 | 0.0212 $ | 9717 |
| Le voyageur écrit en anglais | 0/3 | 0/3 | 0/3 | 1/3 | 1/3 | 0/3 | 0/3 | 0/3 | 0/3 | 1/3 | 0/3 | 0.0161 $ | 15393 |
| Le voyageur pose les questions | 0/3 | 0/3 | 3/3 | 2/3 | 3/3 | 0/3 | 3/3 | 2/3 | 0/3 | 2/3 | 2/3 | 0.0651 $ | 22810 |
| Le voyageur veut être surpris | 0/3 | 0/3 | 2/3 | 0/3 | 3/3 | 0/3 | 1/3 | 2/3 | 0/3 | 2/3 | 1/3 | 0.0613 $ | 48125 |

Total de tous les passages : 1.2928 $ en tokens, 30 recherche(s) web.

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

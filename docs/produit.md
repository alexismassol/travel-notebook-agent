# Choix produit

L'essentiel tient dans le README, section « Choix produit » : l'arbitrage, le seuil du carnet
complet et le risque principal, en trois paragraphes. Ce document-ci est le détail, pour qui veut
les hypothèses et le raisonnement derrière.

Les chiffres cités sont des **ordres de grandeur supposés**, pas des mesures.
Les mots techniques sont expliqués dans le [glossaire](glossaire.md).

## L'arbitrage que l'agent incarne

Les ordres de grandeur ci-dessous sont des **hypothèses de travail** sur la préparation d'un voyage
en ligne. Ce ne sont pas des mesures, et ils ne se citent jamais comme telles.

Un long formulaire de voyage perd environ 80 % des visiteurs en route. À l'inverse, environ 30 % des
projets notés restent trop flous pour organiser quoi que ce soit : pas de dates, pas de nombre de
voyageurs, une destination encore hésitante. Ces deux chiffres tirent en sens inverse. Chaque
question en plus coûte des voyageurs. Chaque question en moins donne un carnet inutilisable.

L'agent ne cherche donc pas le carnet le plus complet possible. Il cherche **le carnet le plus court
qui permet d'organiser le voyage sans rien avoir à redemander**. Deux règles en découlent :

1. **Ne jamais poser une question dont la réponse est déjà dite ou se déduit.** L'agent déduit,
   affiche la déduction « à confirmer », et la fait valider ensuite.
2. **Ne bloquer que sur les quatre informations obligatoires** : destination, dates, durée,
   voyageurs. Le budget, le style et les envies enrichissent le carnet sans jamais le retarder.

Le test : un voyageur décidé qui écrit « Vietnam, 3 semaines en novembre, on est 2, ~4000 € » doit
pouvoir télécharger son carnet dès le premier tour. Mesuré sur 3 passages : carnet validé
3 fois sur 3 (`docs/scenarios/README.md`).

## Quand un carnet est complet

Le seuil est calculé en code, pas laissé au modèle. C'est une décision produit : elle doit être la
même dans toutes les conversations, se tester, et se régler sans toucher au prompt.

Un carnet est complet quand les quatre informations obligatoires **suffisent à organiser le
voyage**, pas quand elles sont précises au jour près :

| Obligatoire | Suffisant quand | Pourquoi ce seuil (hypothèse) |
|---|---|---|
| Destination | Un seul pays ou une seule région | Un carnet décrit un voyage ; « Japon ou Corée » reste un choix à faire |
| Dates | Fenêtre de départ de 45 jours au plus | Au-delà, la saison reste inconnue, donc le climat et les prix aussi |
| Durée | Écart de 7 nuits au plus, cohérent avec les dates | Une semaine d'écart change le détail du voyage, pas sa structure |
| Voyageurs | Nombre à une personne près, âge de chaque enfant | « 4 ou 6 » change les chambres et les véhicules ; l'âge change tout pour une famille |

Trois règles s'ajoutent :
- le voyageur doit confirmer toute valeur **déduite** par l'agent ;
- une **contradiction** doit être tranchée ;
- une fenêtre de dates **entièrement passée** ne compte pas. Cas réel : « juin 2026 » noté en
  septembre 2026. Si le voyageur n'a pas dit l'année, le code la décale à l'année suivante
  (`docs/choix-techniques.md`, décision 18).

En revanche, une valeur **floue mais dite par le voyageur** (« plutôt fin octobre, on est
flexibles ») est acceptée si elle passe les seuils. La flexibilité est une information utile dans
un carnet, pas un manque.

Ces seuils sont des hypothèses à valider avec des voyageurs. Ce sont eux qui savent à partir de
quelle précision un carnet les aide vraiment à réserver.

## Le risque clé en production

**Un carnet faux qui a l'air sûr.** Un carnet faux coûte plus cher qu'un carnet pauvre. Le voyageur
organise son voyage sur une information qu'il n'a jamais donnée, sans s'en rendre compte. Il ne se
reconnaît plus dans son propre projet, et il cesse de faire confiance à l'outil.

La construction a montré que ce risque est réel avec un petit modèle. Haiku 4.5 a :
- écrit des entrées d'outil abîmées (décision 7) ;
- affirmé une saison sans chercher (décision 15) ;
- oublié une information dite, comme la ville de départ (`docs/scenarios/relecture.md`) ;
- marqué « confirmé » un nombre d'adultes jamais dit. Exemple réel : le voyageur donne l'âge de ses
  deux enfants, et le brief affiche « 2 adultes et 2 enfants » confirmé.

Chaque cas a reçu un garde-fou en code. Le dernier est contrôlé depuis le 2026-09-17 : un nombre de
voyageurs confirmé doit correspondre à des mots du voyageur, sinon il repasse « à confirmer »
(`docs/choix-techniques.md`, décision 17).

Une durée dite en ordre de grandeur est contrôlée depuis le même jour : « une dizaine de jours »
reste « à préciser » au lieu de devenir « 9 nuits, confirmé » (décision 19). Restent sans garde-fou
la date et la destination : rien ne vérifie encore qu'une valeur **plausible et bien formée** a
vraiment été dite.

La même relecture a montré qu'une information utile pouvait disparaître sans bruit : « on part de
Paris » n'apparaissait nulle part dans le carnet. La ville de départ est devenue un champ du brief
(décision 20). Avant une mise en production, il faudrait donc :
1. mesurer la fidélité du carnet sur des conversations réelles (valeur confirmée sans citation qui
   la justifie) ;
2. faire relire un échantillon de carnets par les voyageurs qui les ont produits.

C'est la première priorité de `docs/evaluation.md` et le premier indicateur de
`docs/observabilite.md`.

**Risque secondaire : l'attente peut recréer l'abandon que l'agent doit éviter.** Un tour qui
enchaîne recherches web et fiches destination est le plus long. Sur la mesure finale, le tour le
plus long dure 54,6 s ; mais un tour où des fiches sont refusées puis refaites a déjà duré
98,9 s (`docs/choix-techniques.md`, décision 11). Un voyageur qui abandonne pendant cette attente
reproduit, pour une autre raison, la perte que le formulaire cause déjà.

## Hypothèses retenues

- Le troisième ordre de grandeur (environ 50 % des projets de voyage qui ne partent jamais) vient
  en partie de projets pas assez mûrs. Un agent qui aide à trancher (recommandation, alerte
  réalité) devrait réduire ce taux. C'est une hypothèse, mesurable par un test A/B formulaire
  contre agent.

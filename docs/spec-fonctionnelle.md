# Spécification fonctionnelle : Travel Notebook Agent

Décrit le comportement observé du code au 2026-09-25 (projet en développement actif : certains
fichiers changent d'une lecture à l'autre). Cadrage produit : `docs/produit.md`.
Preuves : lecture du code, et transcriptions réelles `docs/scenarios/*.md` (générées par
`npm run scenarios`, vrais appels à l'API Haiku 4.5, coût mesuré à chaque tour).

## En bref

- Ce document explique ce que voit et fait un voyageur qui parle avec l'agent.
- Il montre chaque écran de l'interface, puis 8 conversations réelles rejouées sur le vrai modèle.
- Les mots techniques (token, cache, playbook...) sont expliqués dans le glossaire, juste en dessous.
- L'agent aide un voyageur à préparer son carnet de voyage.
- Il ne calcule ni itinéraire ni prix : c'est au voyageur d'organiser son voyage avec le carnet.
- Un panneau affiche ce qui est déjà su, et ce qui manque encore, avec un badge sur chaque case incertaine.
- Le carnet ne se présente que si 4 informations sont assez sûres : où, quand, combien de temps, avec qui.
- Chaque chiffre cité vient d'un vrai essai sur le modèle, jamais d'une estimation.

Glossaire des mots techniques : [glossaire.md](glossaire.md).

## 1. Acteurs et résultat

| Acteur | Rôle | Dans ce projet |
|---|---|---|
| Voyageur | Dialogue en texte libre, répond aux questions à choix, décide de télécharger son carnet | Interface `src/web/` |
| Agent | Dialogue, récolte le brief (la fiche de voyage, voir glossaire), ne construit ni itinéraire ni prix (`system-prompt.ts`) | `src/server/agent/` |

Résultat produit : un brief structuré (`TravelBrief`, `src/shared/brief.ts`), affiché au voyageur
comme « Votre carnet de voyage est téléchargé » (`BriefSummary.tsx`) et écrit dans `data/briefs/<id>.json`
(`conversation.ts`). Ce fichier porte aussi le prénom et l'adresse donnés au moment de valider,
rangés à côté du brief. Rien n'est transmis à un tiers : le carnet est écrit en local, puis
téléchargé par le navigateur.

## 2. Les écrans du voyageur

### Accueil et suggestions de départ

Le premier message de l'agent est toujours le même : « Bonjour. Racontez-moi votre projet de
voyage comme il vous vient, même si vous ne savez pas encore où partir. Je note tout au fur et à
mesure dans votre carnet. » (`App.tsx`, constante `WELCOME_TEXT`).

Trois suggestions cliquables s'affichent en dessous, avant le premier message du voyageur
(`Suggestions.tsx`). Cliquer en envoie le texte, comme si le voyageur l'avait écrit :
- « Du soleil en famille cet hiver, on ne sait pas où »
- « Vietnam, 3 semaines en novembre, à deux, budget 4 000 € »
- « C'est où Zanzibar ? »

Elles disparaissent dès que le voyageur envoie un premier message (`App.tsx`).

### Le fil de conversation

Les messages du voyageur et de l'agent s'affichent en bulles, l'une après l'autre
(`MessageBubble.tsx`, `Chat.tsx`). Le texte de l'agent arrive mot par mot (streaming, voir
glossaire), au lieu d'attendre la fin de sa réponse. Trois points qui respirent montrent que
l'agent réfléchit, tant qu'aucun mot n'est encore arrivé (`Chat.tsx`).

### L'activité en cours

Une ligne discrète montre ce que fait l'agent pendant qu'il travaille. Une icône l'accompagne : une
loupe pour une recherche, une feuille sinon. Exemple : « Recherche : Népal trek juillet mousson »
(`ToolActivity.tsx`, libellé construit en `loop.ts`). Elle disparaît à la fin du tour.

Un bandeau distinct, séparé des bulles, apparaît quand un playbook (un jeu d'instructions
spécialisées, voir glossaire) se charge. Il affiche un titre, « {nom} activés », par exemple
« Conseils voyage en famille activés », suivi de la raison donnée par l'agent
(`PlaybookNotice.tsx`). Trois playbooks existent : « Conseils voyage en famille »,
« Conseils voyage pour une fête » et « Conseils voyage surprise ».

### Les questions à choix

Des cartes cliquables, une par réponse possible, avec parfois un champ « Autre : précisez ici »
(`ChoiceBlock.tsx`). Un bouton « Valider » envoie la réponse choisie. Une fois répondu, les cartes
restent visibles mais ne sont plus cliquables : celle choisie reste en surbrillance, les autres
s'estompent.

### Les fiches destination

1 à 3 fiches s'affichent, chacune avec une photo (ou un fond de courbes de niveau si aucune photo
fiable n'a été trouvée). Chaque fiche donne le nom du lieu, le pays, un résumé, et trois
informations : « Pourquoi ici », « Quand partir », « Pour vous » (`DestinationCards.tsx`). Un
point d'attention honnête s'affiche
si l'agent en a noté un (saison, foule, trajet). Un bouton « Voir sur la carte » ouvre une carte
(OpenStreetMap) ; un lien renvoie vers la page Wikipédia du lieu, quand elle existe.

### Le carnet et ses statuts

Un panneau (colonne de droite sur ordinateur, bandeau repliable sous l'en-tête sur mobile) titré
« Votre carnet de voyage », avec un compteur « {N} sur 4 essentiels » et 4 repères qui se
remplissent (`BriefPanel.tsx`). Tant que rien n'est encore dit : « Votre projet se dessine ici au
fil de la conversation. »

Chaque information obligatoire affiche sa valeur et un badge. La valeur seule ne s'affiche jamais
si elle est incertaine : « à définir », « à préciser », « à confirmer », « à trancher », ou une
coche verte si elle est sûre (`STATUS_LABELS`, `src/web/lib/briefFormat.tsx`). Les informations utiles
(ville de départ, budget, style, envies, contraintes) s'affichent sous « Vos préférences » dès
qu'une est connue. Les phrases du voyageur qui ne rentrent dans aucune case s'affichent sous
« Vos mots ».

### Le récapitulatif et le téléchargement

Titré « Votre carnet de voyage est prêt », il reprend le message de l'agent et les 4 informations
obligatoires, plus les informations utiles déjà connues (`BriefSummary.tsx`). Avant de télécharger,
deux champs demandent le prénom et l'adresse e-mail : ils s'impriment en haut du carnet, et ne
servent qu'à cela (`BriefSummary.tsx`, `shared/contact.ts`). Deux boutons :
« Télécharger mon carnet de voyage » et « Modifier quelque chose ». Pendant la préparation :
« Préparation de votre carnet… ». Une fois téléchargé : « Votre carnet de voyage est téléchargé.
Bon voyage ! », avec les boutons « Télécharger à nouveau » et « Préparer un autre voyage ». Si le
voyageur choisit de modifier : « Vous avez choisi de modifier votre carnet. » Une erreur de
préparation s'affiche juste au-dessus des boutons.

### La zone d'écriture

Un champ de texte et un bouton « Envoyer » (`Composer.tsx`). Entrée envoie le message,
Majuscule+Entrée va à la ligne.

**Le champ reste écrivable pendant que l'agent répond.** Le voyageur peut préparer sa phrase
sans attendre. Seul l'envoi attend la fin du tour : à la place du bouton « Envoyer », un bouton
carré « Arrêter » coupe la réponse en cours. Le serveur revient alors à l'état d'avant le tour,
donc le carnet ne garde rien de partiel.

Le champ n'est fermé que dans deux cas : le carnet est téléchargé, et son texte devient « Votre
carnet de voyage est prêt. » ; ou la conversation n'est plus disponible côté serveur, et un bandeau
l'explique juste au-dessus.

### Retrouver une conversation

**Actualiser la page ne perd plus rien.** Le navigateur garde le fil visible, le serveur garde
l'historique envoyé au modèle. Au chargement, la page relit le fil gardé puis demande au serveur
s'il connaît encore cette conversation (`persistance.ts`, `App.tsx`).

Trois cas pour le voyageur :

| Ce que dit le serveur | Ce qu'il voit |
|---|---|
| Il a encore la conversation | Elle reprend là où il en était, question à choix comprise |
| Il l'a oubliée, après six heures ou un redémarrage | Le fil se relit, les boutons sont éteints, un bandeau propose de repartir |
| Rien n'était gardé | Une conversation neuve, comme au premier jour |

**Un bouton « Mes conversations » dans le bandeau** liste les cinq dernières, gardées par ce
navigateur (`Conversations.tsx`). Chaque ligne porte un titre, la date de la dernière écriture, et
l'état : « en cours » ou « expirée ».

**Une conversation où rien n'a été écrit n'est pas gardée.** Ouvrir la page sans rien taper
n'ajoute donc pas de ligne « Nouvelle conversation » à la liste.

**Chaque ligne a un bouton pour la supprimer.** Un clic demande d'abord confirmation, avec le
titre de la conversation : « Supprimer « {titre} » ? ». Il n'y a pas de compte ni de corbeille
ici, donc pas de correction possible après coup. Le bouton rouge et le titre repris dans la
question suffisent à dire ce qui va disparaître, sans alourdir la phrase. Supprimer la conversation
affichée à l'écran en ouvre une neuve à la place.

**Le titre vient du carnet, pas de la première phrase.** Il prend le lieu, puis la période ou le
groupe, et les envies quand le lieu n'est pas connu : « Martinique, fin octobre », « Japon ou
Corée du Sud, 2 adultes », « musées, plage » (`persistance.ts`, `titreDe`). Tant que le carnet ne
dit rien, la première phrase du voyageur sert de titre. Aucun appel au modèle n'est fait pour
titrer : l'information est déjà structurée.

**Ce que le navigateur garde** : le fil affiché, le carnet, les cumuls du panneau technique, et
les récapitulatifs déjà validés. **Ce qu'il ne garde jamais** : l'historique envoyé au modèle,
que seul le serveur possède. Un fil gardé ne prouve donc jamais qu'une conversation peut
continuer, seulement qu'on peut la relire.

**Si le navigateur refuse d'écrire** (navigation privée, données de site bloquées, espace plein),
l'application démarre normalement sur une conversation neuve, sans message d'erreur.

### Le panneau « Détails techniques »

Replié par défaut. Un bouton du bandeau l'ouvre en superposition, sans rallonger la page
(`App.tsx`). Une fois
ouvert, il affiche le modèle utilisé, le nombre d'appels, et les jetons d'entrée et de sortie. Il
montre aussi les jetons lus et écrits en cache, le nombre de recherches web, le temps jusqu'au
premier mot et la durée totale du tour. Viennent ensuite le coût du tour et celui de la
conversation. Puis la part de l'entrée relue depuis le cache, et ce que ce cache a évité de
payer. Enfin la date d'expiration de la conversation, et le nombre de tours déjà faits et encore
possibles. En dessous, la liste des playbooks chargés (nom, tour, « spontané » ou
« suggéré », raison), ou « Aucun. » s'il n'y en a pas.

Ce panneau sert à la démonstration et à la revue : il rend visibles la trace du chargement des
instructions famille et le coût de chaque tour. Ses libellés sont techniques, à dessein. En
production, il serait réservé à l'équipe (derrière un réglage interne), pas montré aux voyageurs.

## 3. Les parcours de référence

Chaque tour se déroule pareil. Le voyageur écrit, ou répond à un bloc. Le texte de l'agent
s'affiche mot par mot. Une ligne d'activité apparaît pendant qu'un outil travaille, et le carnet se
met à jour dès qu'une information change.

Les 8 parcours détaillés ci-dessous font partie des 16 intentions de référence du projet. La
liste complète et ses taux vivent dans `docs/scenarios/README.md` ; les huit autres couvrent le
voyageur difficile, décrit en section 8. Chacun a été rejoué 3 fois
sur le vrai modèle (`npm run scenarios`), avec un coût réel à chaque passage. Le modèle n'est pas
déterministe (voir glossaire) : le même message peut donner deux réponses différentes. Chaque
paragraphe donne donc un taux mesuré sur 3 passages, jamais une garantie. Sur deux mesures du même
agent, un taux peut bouger d'un passage sur trois. Le scénario « Contradiction dans la durée »
atteignait 4/4 sur les 3 passages lors d'une mesure précédente, contre 1 sur 3 sur celle-ci.
Tableau des huit, reproduit depuis `docs/scenarios/README.md` (campagne du 2026-09-25) :

| Scénario | 4/4 atteint | Carnet validé | Fiche affichée | Question à choix | Recherche web | Superlatif |
|---|---|---|---|---|---|---|
| 1. Destination ouverte, en famille | 0/3 | 0/3 | 3/3 | 2/3 | 2/3 | 3/3 |
| 2. Informations déjà complètes | 3/3 | 3/3 | 0/3 | 0/3 | 0/3 | 3/3 |
| 3. Conseil qui se heurte à la réalité | 0/3 | 0/3 | 0/3 | 1/3 | 3/3 | 3/3 |
| 4. Envie floue à ancrer | 0/3 | 0/3 | 3/3 | 0/3 | 3/3 | 0/3 |
| 5. Dépaysement sans la foule | 0/3 | 0/3 | 2/3 | 0/3 | 2/3 | 0/3 |
| 6. Contradiction dans la durée | 1/3 | 0/3 | 1/3 | 1/3 | 1/3 | 3/3 |
| 7. Composition variable | 0/3 | 0/3 | 0/3 | 1/3 | 0/3 | 3/3 |
| 16. Le voyageur veut être surpris | 0/3 | 0/3 | 2/3 | 0/3 | 3/3 | 1/3 |

« Superlatif » et les autres dérives de ton sont détaillées dans `docs/scenarios/README.md` :
tutoiement, narration des coulisses, mot « brief », réponse de plus de 80 mots. Sur les 48
passages, aucun tutoiement et aucun mot « brief » dit au voyageur.

### 1. Destination ouverte, en famille (`docs/scenarios/1-destination-ouverte-famille.md`)

« On veut du soleil en famille cet hiver, mais on sait pas où » (`:7`). L'agent note destination
(ouverte, envie « soleil »), dates et voyageurs, détecte la famille et charge lui-même le playbook
`voyage-en-famille` (`spontaneous`, raison « en famille », `:15`). Il pose une vraie question
à choix sur le nombre d'enfants (« Combien d'enfants voyagent avec vous, et quel est leur âge ? »,
3 options, `:17`), et redemande la même chose en texte libre : « D'abord, quel âge ont vos
enfants ? » (`:19-20`).

Au tour 2, le voyageur précise les âges (4 et 7 ans), la période (« vacances de février »), la
durée (« une dizaine de jours ») et le point de départ (« on part de Paris », `:26`). L'agent
cherche en nommant quatre lieux : « Guadeloupe Maroc Canaries climat février plages famille »
(`:34`). Il tente d'abord quatre fiches, en retire une au second appel, puis n'en affiche
finalement que deux, sans photo pour aucune des deux : Guadeloupe et les îles Canaries (`:35-38`).
Costa Rica, cité dans les deux appels, ne fait partie d'aucune fiche affichée.

Le brief final (`:47-56`) confirme le mécanisme de fidélité (règle plus bas) : le voyageur n'a
jamais dit combien d'adultes partent, seulement l'âge des enfants. Le nombre de voyageurs reste
donc noté `inferred` (« à confirmer »), pas `confirmed` : « 2 adultes et 2 enfants (4 et 7 ans) ->
manque : déduit de vos messages : à confirmer » (`:52`). « Paris », lui, est retenu comme point de
départ confirmé (`:53`). Sur 3 passages : fiche affichée 3/3, question à choix 2/3, recherche web
2/3 (`docs/scenarios/README.md`).

### 2. Informations déjà complètes (`docs/scenarios/2-infos-completes.md`)

« Vietnam, 3 semaines en novembre, on est 2, budget ~4000€ » en un seul message (`:7`). Les 4
champs obligatoires passent à 4/4 dès le tour 1, sans le moindre appel `web_search` (`:11-18`, 0
recherche mesurée sur ce tour). L'agent tente un `ask_choice` sur le budget (`:17`), sans qu'aucune
carte n'apparaisse : le brief venant de devenir complet, le serveur le rejette au profit du
récapitulatif (règle plus bas). Il demande alors en clair, dans son texte : « votre budget de
4000€, c'est par personne ou pour vous deux ? » (`:21`). Il présente pourtant déjà le récapitulatif,
« Votre projet est complet : Vietnam, trois semaines en novembre, deux adultes. » (`:19`).

Au tour 2, le voyageur valide son carnet (`decision: send`, `:30`) : le carnet est marqué validé
et le tour se termine sur des conseils pratiques, sans repasser par l'enregistrement (`:32`). Le
serveur ne dépend pas que le modèle pense à présenter le récapitulatif. Si le brief devient
complet en cours de tour sans que `present_brief` ait été appelé, un message `<contexte_serveur>`
force cet appel au tour suivant (`loop.ts`). Sur 3 passages : brief 4/4 et carnet validé 3/3,
recherche web 0/3 (`docs/scenarios/README.md`).

### 3. Conseil qui se heurte à la réalité (`docs/scenarios/3-conseil-trek-nepal.md`)

« Le trek au Népal en juillet, c'est jouable ? » (`:7`). L'agent cherche d'abord (« trek Népal
juillet saison mousson faisabilité », `:11`). Il répond en s'appuyant sur cette recherche :
« C'est possible, mais juillet n'est pas l'idéal. Le pire de la mousson se situe en juillet et
août : fortes pluies, peu de visibilité, boue et sangsues. » (`:19`). Il propose une alternative de
zone, le Haut-Dolpo et le Mustang au nord du Dhaulagiri, épargnés par les pluies. Il signale aussi
que le printemps et l'automne offrent de meilleures conditions si les dates sont flexibles. Il pose
ensuite une vraie question à choix sur la composition du voyage, pas sur la saison : « Vous partez
seul, en couple, en famille, ou entre amis ? » (`:16`). C'est exactement ce qu'exige le prompt
système : ne jamais affirmer une saisonnalité de mémoire (`system-prompt.ts`).

Le comportement n'est pas garanti à chaque appel (modèle non déterministe) :
`tests/integration/agent.test.ts` ne teste pas un passage unique sur cette question mais un taux,
au moins 2 recherches sur 3 essais. Sur les 3 passages mesurés, la recherche a lieu 3 fois sur 3,
la question à choix 1 fois sur 3 (`docs/scenarios/README.md`).

### 4. Envie floue à ancrer (`docs/scenarios/4-envie-floue-zanzibar.md`)

« C'est où Zanzibar ? Ça ressemble à quoi ? » (`:7`). L'agent cherche d'abord (« Zanzibar île
Tanzanie », `:11`), puis affiche directement la fiche Zanzibar, avec photo (`:12-13`). Aucune
information de brief n'est déduite de cette seule question de projection (0/4, `:24-33`).

Une fiche est refusée si aucune recherche de la conversation ne cite un mot significatif du lieu ou
de son pays (4 lettres ou plus, hors mots génériques). Le serveur bloque l'affichage avant même de
le montrer (`ungroundedCards`, `show-destination-cards.ts`, appelé `:176`). Ce garde-fou a
été ajouté après qu'un passage antérieur ait affiché une fiche Zanzibar sans recherche
(`docs/choix-techniques.md`, décision 15) : sur ce passage-ci, la recherche précède bien
l'affichage. Mesuré sur 3 passages : fiche affichée 3/3, recherche web 3/3
(`docs/scenarios/README.md`).

### 5. Dépaysement sans la foule (`docs/scenarios/5-depaysement-sans-la-foule.md`)

« Un truc dépaysant mais sans les foules, en mai, deux semaines à deux » (`:7`). Sur ce passage,
l'agent note dates, durée, voyageurs et, cette fois, destination : l'envie « dépaysant, sans les
foules » est conservée comme critère d'une destination encore ouverte, sans nuance à part
(`Nuances notées : 0`, `:11-14, 38`). Il cherche à trois reprises, Albanie et Macédoine,
Monténégro, Islande (`:15-17`), puis affiche deux fiches sans photo, Albanie et Monténégro
(`:21-22`). Sa question reste ouverte : « Vous reconnaissez l'envie dans l'une de ces deux, ou vous
penchez plutôt vers quelque chose d'autre : montagne, côte, culture, randonnée ? » (`:25`). La
destination reste affichée « à préciser » dans le carnet, statut `vague`, mode encore ouvert
(`:33`).

Le résultat varie d'un passage à l'autre : `note_destination` n'est pas toujours appelé sur ce
scénario. Sur les 3 passages mesurés : fiche affichée 2/3, recherche web 2/3 ; avant la mise à jour
du rappel de tour, les deux taux étaient à 0/3 (`context.ts`, `docs/scenarios/README.md`).

### 6. Contradiction dans la durée (`docs/scenarios/6-contradiction.md`)

« On part 3 semaines en Grèce en juin, on sera 4 adultes » (`:7`). Au tour 1, le brief atteint
directement 4/4 et l'agent présente le récapitulatif : « Vous partez 3 semaines en Grèce en juin
avec 3 autres adultes. Votre carnet de voyage est prêt à télécharger, et vous pourrez le compléter
ultérieurement avec votre ville de départ et votre budget si vous le souhaitez. » (`:16`). Sur la
mesure du 2026-09-17, le carnet affichait `confirmed juin 2026` alors que le code avait déjà décalé
les dates en 2027 (décision 18) : il gardait le libellé écrit par le modèle. Corrigé depuis, et la
transcription actuelle affiche `dates [confirmed] juin 2027` (`:45`).

Au tour 2, « Finalement ce sera plutôt 10 jours » (`:27`) remplace directement la durée sur ce
passage, sans question à choix. L'agent enregistre la nouvelle valeur et représente le
récapitulatif : « Vous partez dix jours en Grèce en juin avec trois autres adultes. » (`:33`). Le
brief final garde la durée `confirmed` à 9 nuits, sans conflit avec les 20 à 21 nuits dites au
tour 1 (`:46`). Le mécanisme `conflicting` existe bien en code (`apply-patch.ts` : une seule valeur
active, l'ancienne gardée en alternative), mais ce passage précis ne le déclenche pas. Sur 3
passages, la question à choix apparaît 1 fois sur 3 : c'est là qu'il se déclenche. Le brief atteint
4/4 sur 1 passage sur 3, et il n'est jamais validé (0/3). Le script de mesure ne valide le carnet
que sur le scénario 2, par construction (`docs/scenarios/README.md`).

### 7. Composition variable (`docs/scenarios/7-composition-variable.md`)

« On part à Bali, 10 jours en juin, mais on sera 4 ou 6 personnes, ça dépend des amis » (`:7`).
L'agent note destination, dates et durée, puis pose une vraie question à choix plutôt que de
redemander en texte libre : « Combien de personnes compter pour planifier le voyage ? », avec
3 options dont « J'attends la confirmation de mes amis » (`:16`). Les voyageurs restent `vague`
(4 à 6, écart au-delà du seuil de 1 personne, `completeness.ts`, `:30`) sans être forcés à une
valeur unique.

Cette consigne de question est nommée dans le résultat des outils de notes. Elle est calculée après
l'enregistrement du message plutôt que dans le rappel générique de début de tour (règle plus bas,
décision 9, `docs/choix-techniques.md`). Sur la campagne finale, la question à choix n'apparaît
toutefois que sur 1 passage sur 3, contre 3/3 lors d'une mesure antérieure.
`tests/integration/agent.test.ts` vérifie un seuil plus permissif, au moins 1 essai sur 3, pour
tenir compte de cette variation (`docs/scenarios/README.md`).

### 16. Le voyageur veut être surpris (`docs/scenarios/16-surprenez-moi.md`)

« Surprenez-moi : dix jours en mars, on est trois amis et on a déjà fait les grandes capitales
d'Europe. » (`:7`). L'agent note dates, durée, voyageurs et l'envie comme nuance, détecte la
demande de surprise et charge lui-même le playbook `voyage-surprise` (`spontaneous`, raison
« surprenez-moi », `:16`). Il ne note à ce stade ni ville de départ ni budget. Il cherche
directement trois lieux rares (« Salar de Uyuni Maroc Cappadoce voyage mars climat saison »,
`:17`). Il tente d'abord trois fiches, en renomme une au second appel, puis affiche les trois, sans
photo pour aucune : Salar d'Uyuni, Cappadoce, Sahara marocain (`:18-23`). Une seule question suit,
ouverte sur ces trois pistes : « Vous voyez le contraste ? [...] Lequel vous parle le plus pour
cette surprise en mars ? » (`:26`).

Le brief final garde la destination `unknown`, faute de choix du voyageur à ce stade (`:33-40`),
avec la nuance « déjà fait les grandes capitales d'Europe » conservée telle quelle (`:45`). Sur 3
passages : fiche affichée 2/3, recherche web 3/3, carnet validé 0/3, narration 2/3
(`docs/scenarios/README.md`). Le chargement du playbook `voyage-surprise` est vérifié par un taux,
pas un passage unique : au moins 2 essais sur 3 dans `tests/integration/agent.test.ts`.

### Tenue sur des intentions nouvelles (essai de robustesse)

Les 8 scénarios ci-dessus ont servi à régler l'agent : un agent réglé sur ses propres cas peut
échouer ailleurs. `docs/scenarios/robustesse.md` rejoue 12 intentions jamais vues (hésitation entre
deux pays, voyage de noces, contrainte de mobilité, budget irréaliste, message en anglais, question
hors sujet, tentative d'injection...), 2 fois chacune, sur le vrai modèle. Un essai antérieur du
même jour, sur le même nombre de passages, sert de comparaison. Question à choix posée : 5 fois sur
24 puis 9 sur 24. Recherche web lancée : 7 puis 9 fois sur 24. Fiches pour le voyage de noces :
0 sur 2 dans les deux essais. Aucun tutoiement sur les 48 passages des deux essais
(`docs/scenarios/robustesse.md`).

## 4. Règles fonctionnelles

**Obligatoire vs utile.** `MANDATORY_FIELDS` (destination, dates, duration, travellers) bloquent
le carnet ; `USEFUL_FIELDS` (departure, budget, style, interests, constraints) ne bloquent jamais
(`src/shared/brief.ts`).

**Affichage des incertitudes.** Chaque champ affiche un badge selon son statut, jamais la valeur
seule : « à définir » (`unknown`), « à préciser » (`vague`), « à confirmer » (`inferred`),
« à trancher » (`conflicting`), une coche verte si `confirmed`
(`src/web/lib/briefFormat.tsx`, `formatAlternatives`). Un statut `conflicting` affiche aussi la ou les valeurs
concurrentes en liste (`briefFormat.tsx`).

**Seuil du carnet complet** (`src/server/agent/brief/completeness.ts`), calculé en code ; le
modèle ne le décide jamais :
- destination : pas `open`, et une seule zone (pays ou région) désignée
- dates : fenêtre de départ de 45 jours au plus (`MAX_DATE_WINDOW_DAYS` : « au-delà d'un mois et
  demi, la saison reste inconnue, donc le climat et les prix aussi »). Pas de fenêtre entièrement
  passée par rapport à aujourd'hui non plus : une fenêtre déjà passée signale une année devinée,
  pas une vraie date
- durée : écart de 7 nuits au plus (`MAX_DURATION_SPREAD_NIGHTS` : « change l'itinéraire mais pas
  sa structure ») et compatible avec la fenêtre de dates
- voyageurs : écart d'une personne au plus (`MAX_TRAVELLERS_SPREAD`), âge de chaque enfant connu
- statut acceptable : `confirmed` ou `vague` (`SENDABLE_STATUSES`) ; `inferred` doit être validé
  par le voyageur, `conflicting` et `unknown` bloquent toujours

**Fidélité des voyageurs (décision 17).** Un nombre de voyageurs ne peut être noté `confirmed` que
si le voyageur l'a vraiment dit. Avant d'enregistrer, le code relit tout ce que le voyageur a écrit
ou cliqué, et rien d'autre (`travellerText`, `traveller-text.ts`) : ni l'état du serveur, ni
les résultats d'outils, ni le texte de l'agent. Deux conditions gardent la valeur `confirmed`.
Les adultes et les enfants notés doivent faire le total dit. Le voyageur doit aussi avoir donné un
nombre de personnes (« on est 2 ») ou un mot qui désigne les adultes (« ma femme », « couple »)
(`travellersDoubt`, `brief/fidelity.ts`). Sinon, elle est ramenée à `inferred`, et l'agent
reçoit la consigne de la faire valider (`brief-tools.ts`). Mesuré sur le scénario famille
(parcours 1 ci-dessus) : le contrôle fonctionne, le nombre d'adultes jamais dit reste « à
confirmer » plutôt que d'apparaître comme sûr.

**Fidélité de la durée (décision 19).** Même règle sur la durée : « une dizaine de jours »,
« deux semaines à peu près », « around 3 weeks » ou « 10 jours max » ne donnent pas une durée
`confirmed`
(`durationDoubt`, `brief/fidelity.ts`). Elle est enregistrée `vague`, c'est-à-dire « à préciser »
dans le panneau. Les nuits notées ne bougent pas, et `vague` n'empêche pas le carnet d'être
complet : le voyageur n'est pas bloqué pour avoir parlé comme on parle. Dès qu'il donne un nombre
(en l'écrivant ou en cliquant une réponse), la durée peut redevenir `confirmed`.

**Ce qui ne se répète pas.** La ville de départ et le budget ont leur propre ligne : ils ne sont
pas recopiés dans les contraintes, où ils s'affichaient deux fois.

**Avant de télécharger.** Le récapitulatif rappelle que le carnet reste modifiable. Si aucune
envie, aucun style et aucune contrainte ne sont notés, une ligne invite à les dire. Deux champs
demandent le prénom et l'adresse : ils s'impriment en haut du carnet.

**Après le téléchargement.** Le bandeau « Votre carnet de voyage est téléchargé » passe sur fond
vert profond : c'est le seul moment de récompense du parcours, il doit se voir.

**Recommencer après un téléchargement.** L'écran « Votre carnet de voyage est téléchargé » porte
un bouton « Préparer un autre voyage ». Il demande une conversation neuve au serveur et vide le
carnet, le fil et les playbooks chargés. Sans lui, l'écran restait figé sur le carnet téléchargé
(audit parcours du 2026-09-17).

**Zone de saisie.** Elle grandit avec le texte, jusqu'à un tiers de la hauteur de l'écran sur
téléphone, puis défile. Mesuré : sans ce plafond, un paragraphe poussait le bouton « Envoyer » hors
de l'écran sur iPhone.

**Année non dite (décision 18).** Si la période notée est entièrement passée et que le voyageur
n'a écrit aucune année, le code la décale à l'année suivante avant de l'enregistrer
(`brief-tools.ts`, `nextYear` et `SAID_YEAR`). Une année écrite par le voyageur
n'est jamais changée, même passée. Le libellé suit l'année décalée : sur la mesure du 2026-09-17,
le carnet du scénario 6 affichait encore « juin 2026 » pour des dates déjà décalées en 2027
(`docs/scenarios/6-contradiction.md:47`). Ce défaut, trouvé par la relecture des briefs, est corrigé
et couvert par un test sur l'entrée réelle (`brief-tools.test.ts`).

**Hésitation entre lieux, pas une contradiction.** Si le voyageur hésite entre plusieurs
destinations déjà citées, ce n'est pas un conflit : le code ramène le statut à `vague` plutôt qu'à
`conflicting` (`brief-tools.ts`). Le prompt système porte la même règle en clair pour le
modèle (`system-prompt.ts`).

**Question suivante calculée après l'enregistrement.** La consigne de question à poser est ajoutée
au résultat des outils de notes, une fois le message du voyageur enregistré, pas avant
(`nextQuestionHint`, `brief/next-question.ts`). Elle est calculée une seule fois par appel au
modèle, après tous les enregistrements de cet appel (`briefGuidance`, appelée depuis `loop.ts`).
Une version antérieure calculait cette consigne avant l'enregistrement et faisait reposer une
question déjà répondue. Une autre la calculait après chaque enregistrement, et deux consignes
contradictoires pouvaient arriver ensemble.

**Récapitulatif forcé si le brief devient complet en cours de tour.** Le brief peut devenir complet
en cours de tour, sans que le récapitulatif ait été présenté. Dans ce cas, le serveur insère un
message `<contexte_serveur>` et force cet appel à l'itération suivante (`loop.ts`,
`readyAtStart`). Un brief déjà complet AVANT le tour n'est
pas concerné : le voyageur a pu vouloir revenir dessus sans qu'on le pousse vers le carnet.

**Une question à choix est refusée si le brief vient de devenir complet.** Dans le même cas, un
appel à `ask_choice` est rejeté par le serveur au profit du récapitulatif : proposer le carnet
passe avant une nouvelle question (`loop.ts`). Sans ce garde-fou, un brief Vietnam complet
recevait une question sur les envies au lieu de se voir proposer son carnet
(`docs/choix-techniques.md`, décision 16).

**Fiche destination refusée sans recherche.** Une fiche est rejetée par le serveur si aucune
recherche web de la conversation ne cite le lieu ou son pays. Le mot cité doit compter 4 lettres ou
plus. Il ne doit pas non plus être un mot générique comme « île » ou « grande ». Un nom court sans
mot de cette taille (« Hội An ») retombe sur le nom entier comme terme à chercher
(`ungroundedCards`, `show-destination-cards.ts`, appelé `:176`). Une version antérieure
comparait le nom entier du lieu à la requête. Elle refusait à tort toutes les fiches d'un passage
(« Îles Canaries » absent de « Canaries climat février »), corrigée depuis en comparant des mots
pris séparément. Depuis un ajustement mesuré à l'écran, seules
les fiches non étayées sont refusées : celles qui le sont s'affichent quand même
(`show-destination-cards.ts`). Le refus donne au modèle la requête à lancer.

**Une entrée d'outil illisible ou fuitée n'entre jamais dans le brief.** Un contrôle refuse toute
valeur qui contient de la syntaxe d'appel d'outil ou un accent mal écrit avant qu'elle n'entre dans
le brief (`findLeakedSyntax`, `tools/types.ts`). Un JSON d'entrée invalide ne fait plus
échouer le tour entier : l'appel cassé reçoit une erreur d'outil et le modèle peut le réécrire
(récupération en `loop.ts`, erreur renvoyée en `loop.ts`).

**Un appel d'outil écrit en texte n'atteint jamais la bulle du voyageur.** `findLeakedSyntax`
protège l'entrée des outils, pas le texte libre : un modèle peut aussi écrire une syntaxe d'appel
directement dans sa réponse (observé sur Haiku 4.5, scénario contradiction). Le flux visible coupe
dès qu'une balise interdite apparaît, l'historique déjà stocké est nettoyé après coup, et la fuite
est tracée (`createVisibleTextFilter`, `stripForbiddenText`, `src/server/agent/text-guard.ts`,
appelés en `loop.ts` et `loop.ts`).

**Hors sujet.** Une demande sans lien avec un voyage (poème, devoir, code) est déclinée en une
phrase, sans être réalisée, avant de revenir au projet de voyage (`system-prompt.ts`).
Mesuré sur l'essai de robustesse : la réponse à une question hors sujet est la plus courte et la
moins chère de tout l'essai. C'est le signe d'un refus bref, plutôt que d'une tentative de réponse
(`docs/scenarios/robustesse.md`).

**Langue.** L'interface (boutons, textes fixes, messages d'erreur) reste en français quoi que le
voyageur écrive. L'agent, lui, doit répondre dans la langue du voyageur s'il n'écrit pas en
français (`system-prompt.ts`). Les résultats de recherche web sont traités comme des données à
vérifier, jamais comme des instructions à suivre, même si un texte qui s'y trouve ressemble à un
ordre (`system-prompt.ts`).

**Rien n'est transmis à un tiers.** Le brief final est écrit dans `data/briefs/<id>.json`, en
local (commentaire explicite `conversation.ts`). Le téléchargement se déclenche au choix
« Télécharger mon carnet de voyage » du récapitulatif. Le serveur écrit d'abord le fichier ; la
date de validation n'est posée qu'après une écriture réussie (`app.ts`). L'interface appelle
ensuite `POST /send` : il renvoie la même date si le carnet est déjà validé, sans le réécrire, ou
une erreur lisible si l'écriture échoue (`app.ts`).

**Une conversation terminée n'accepte plus de message.** Une fois la date de validation posée,
toute requête sur `/turns` est refusée avec l'erreur « Ce carnet est déjà prêt. Préparez un autre
voyage pour en créer un nouveau. » (`app.ts`, `API_ERRORS.alreadySent`). Côté interface, le champ
de saisie est aussi désactivé quand l'état attendu est `done` (`App.tsx`).

**Un seul tour à la fois.** Une conversation porte un indicateur posé avant tout traitement, sans
attente entre la vérification et la pose (`app.ts`, drapeau `conversation.busy`). Deux requêtes simultanées sur la
même conversation ne peuvent donc pas démarrer deux tours.

**Message et conversation bornés.** Un corps de requête de plus de 16 Ko sur une route `/api/*`
est refusé avant tout traitement (413, « message trop long », `app.ts`). Cela couvre aussi la
création d'une conversation : ce contrôle est désormais posé avant toutes les routes, alors qu'une
version antérieure ne couvrait pas cette route-là. Au-delà de 40 tours
sans que le voyageur ait téléchargé son carnet, `/turns` refuse tout nouveau tour (429, « conversation
très longue ») mais le brief déjà construit reste téléchargeable (`app.ts`, `conversation.ts`).
Une conversation inactive depuis plus de 6 h, sans tour en cours, est aussi oubliée côté serveur
(`conversation.ts`).

### Le fil ne vole jamais le défilement

Trois règles, écrites après un usage réel où il fallait remonter à la molette après chaque réponse.

1. **Un bloc qui attend une action** (choix, fiches, récapitulatif) se montre par le haut. Sinon on
   atterrit sur la zone d'écriture, et le bouton « Valider » reste hors de vue.
2. **Pendant que le texte arrive**, le fil ne suit que si le lecteur était déjà en bas.
3. **S'il est remonté pour lire**, rien ne bouge. Une pastille « Nouveau message » se pose au-dessus
   de la zone d'écriture, et c'est lui qui décide de redescendre.

La pastille se place à la hauteur réelle de la zone d'écriture, publiée par le composant lui-même,
donc elle reste au-dessus de la ligne même quand le champ grandit.

### Une seule zone pour écrire

Une question à choix affiche ses options et un bouton « Valider ». Elle ne porte pas de champ de
texte. La zone d'écriture de la page fait déjà ce travail. Deux endroits pour écrire la même
chose obligent à choisir lequel utiliser. Une ligne sous les options le dit.

### Arrêter une réponse en cours

Pendant qu'un tour tourne, le bouton « Envoyer » devient « Arrêter », au même endroit et à la même
taille. Un clic abandonne la requête côté navigateur. Le serveur reçoit l'abandon, cesse d'appeler
le modèle, et remet la conversation dans l'état d'avant le tour : rien de partiel n'entre dans le
carnet. Le voyageur peut réécrire tout de suite.

Ce n'est pas traité comme une panne : aucun message d'erreur ne s'affiche, puisque c'est lui qui a
décidé.

### Le carnet à emporter

Le prénom et l'adresse donnés à la validation s'affichent en tête du carnet téléchargé. Dès que
le carnet est validé, le PDF se télécharge automatiquement une fois ; un bouton « Télécharger à
nouveau » le reproduit ensuite à la demande (`carnet.ts` pour le contenu, `carnetPdf.ts` pour le
rendu). Il contient jusqu'à quatre sections : l'essentiel, vos préférences (si au moins une est
connue), ce qui reste à préciser (s'il en manque), et vos mots.

**Sous chaque information, sa phrase à lui**, précédée de « vous avez dit ». C'est ce qui sépare
ce carnet d'un formulaire rempli : le voyageur doit s'y reconnaître, et voir d'où vient chaque
valeur. Les mentions « à préciser » ou « à définir » sont les mêmes qu'à l'écran.

**Sous « L'essentiel », une note dit ce que le carnet suppose par défaut** : « Aller-retour, sauf
indication contraire de votre part. » Un aller simple, un retour depuis une autre ville ou une
arrivée imposée se disent alors comme une contrainte, en phrase lisible.

**Ce qui manque est écrit**, avec sa raison, au lieu d'un tiret, sous la note « Ces informations
manquent encore pour organiser votre voyage. »

Le contenu est calculé par une fonction testée, sans navigateur. Le moteur PDF n'est chargé qu'au
clic, pour que personne ne télécharge une bibliothèque de rendu sans avoir demandé son carnet.

### Le voyageur qui ne sait pas, ou qui doute

« Je ne sais pas », « peu importe », « je n'ai pas de budget », « je suis flexible » sont des
réponses. L'agent les enregistre telles quelles, avec le statut qui convient, et ne repose pas la
question (`system-prompt.ts`). Le serveur l'y aide : il nomme à chaque tour les informations déjà
suffisantes, pour qu'il n'y revienne pas (`context.ts`, `dejaSuffisant`).

Un voyageur peut aussi douter du voyage lui-même. L'agent ne le pousse pas : il l'aide à y voir
clair, et lui dit qu'il peut s'arrêter là et revenir plus tard.

Trois scénarios de référence couvrent ces cas : le message qui donne tout d'un coup, le voyageur
qui ne sait rien, et celui qui hésite à partir (`scripts/scenarios.ts`).

## 5. Messages d'erreur visibles

| Situation | Message | Source |
|---|---|---|
| Conversation inconnue ou expirée, pendant un message | Pas de bouton « Réessayer ». L'interface passe en lecture seule. Un bandeau dit « Cette conversation n'est plus disponible », et propose « Commencer un nouveau voyage » | `App.tsx` |
| Conversation inconnue ou expirée, ailleurs | « Cette conversation n'existe plus. Rechargez la page pour en commencer une nouvelle. » | `shared/api.ts` |
| Tour déjà en cours | « Un message est déjà en cours de traitement. Attendez la réponse avant d'écrire. » | `shared/api.ts` |
| Requête invalide | « Ce message n'a pas pu être envoyé. Réessayez. » | `shared/api.ts` |
| Brief pas complet à la validation | « Votre carnet n'est pas encore complet : il manque des informations essentielles. » | `shared/api.ts` |
| Carnet déjà validé | « Ce carnet est déjà prêt. Préparez un autre voyage pour en créer un nouveau. » | `shared/api.ts` |
| Erreur serveur générique | « Une erreur est survenue. Réessayez dans un instant. » | `shared/api.ts` |
| Appel au modèle trop lent, trop fréquent, ou service en panne | « Le service met plus de temps que prévu. Réessayez dans un instant. Votre projet est gardé. » avec un bouton « Réessayer » | `turn-error.ts` |
| Clé refusée, droits manquants, crédit épuisé | « Le service est indisponible pour le moment. Revenez dans quelques minutes. Votre projet est gardé. » sans bouton | `turn-error.ts` |
| Requête refusée par l'API pour une autre raison | « Je n'arrive pas à traiter ce message. Reformulez-le autrement. Votre projet est gardé. » | `turn-error.ts` |
| Le modèle refuse de répondre | « Je ne peux pas répondre à ce message. Essayez de le formuler autrement. » | `loop.ts` |
| Message trop long (corps de requête > 16 Ko) | « Votre message est trop long. Raccourcissez-le un peu. » | `shared/api.ts`, 413, `app.ts` |
| Conversation trop longue (40 tours atteints sans validation) | « Cette conversation est très longue. Rechargez la page pour repartir d'un projet neuf, ou téléchargez votre carnet s'il est prêt. » | `shared/api.ts`, 429, `app.ts` |
| Écriture du brief impossible au moment de la validation | « Une erreur est survenue. Réessayez dans un instant. » (même message que l'erreur générique) | `shared/api.ts`, 500, `app.ts` |
| La conversation n'a pas pu démarrer (premier chargement de la page) | « Impossible de démarrer la conversation. Vérifiez votre connexion et rechargez la page. » | `App.tsx` |
| Le flux d'un tour s'interrompt sans message d'erreur du serveur | « La connexion a été interrompue. Réessayez dans un instant. » | `App.tsx` |
| La préparation du carnet échoue sans message d'erreur du serveur | « Le carnet n'a pas pu être préparé. Réessayez dans un instant. » | `App.tsx` |
| Prénom ou adresse e-mail mal saisis, contrôlés dans le navigateur | « Indiquez votre prénom. » ou « Cette adresse e-mail semble incomplète. Vérifiez-la. » | `shared/contact.ts` |
| Contact refusé par le serveur à la validation | « Vérifiez votre prénom et votre adresse e-mail. » | `shared/api.ts`, 400, `app.ts` |

Sur une erreur d'appel API pendant un tour, l'état de la conversation revient exactement à celui
d'avant le tour : messages, brief, tour, playbooks, rappels de playbook (`loop.ts`). Rien
de partiel n'est gardé.

**Le bouton « Réessayer » n'apparaît que si un nouvel essai peut marcher** (`classifyTurnError`).
Le proposer après un crédit épuisé ferait tourner le voyageur en rond. Il rejoue le dernier
message sans le retaper. Aucun message visible ne reprend les mots de l'API : un problème de
compte ou de facturation ne regarde pas le voyageur. Le code et le type d'erreur partent dans le
panneau « Détails techniques » et dans les traces, pour celui qui exploite le service.

## 6. Hors périmètre explicite

- Construire l'itinéraire ou annoncer un prix (`system-prompt.ts`).
- Transmettre le carnet à un tiers : il reste en local, sur le poste du voyageur (`conversation.ts`).
- Toute devise autre que l'euro (`BudgetValue.currency` est le littéral `"EUR"`, `brief.ts`).
- Un message voyageur de plus de 2000 caractères, une réponse à choix de plus de 6 éléments, un
  commentaire de plus de 500 caractères (`app.ts`, `TurnRequestSchema:22-36`).
- Une chaîne d'outils de plus de 6 appels par tour : au-delà, le dernier appel est forcé en texte
  et rend la main, même si une tâche restait en cours (`config.ts`, `loop.ts`).
- Une conversation de plus de 40 tours sans validation, ou inactive plus de 6 h : refusée ou
  oubliée côté serveur (`conversation.ts`, `MAX_TURNS_PER_CONVERSATION`).
- Comptes voyageur et persistance durable. Le navigateur garde les cinq dernières conversations
  pour les relire et les reprendre (`persistance.ts`), mais l'historique envoyé au modèle vit en
  mémoire serveur, pour la durée du processus (`conversation.ts`, `CONVERSATION_TTL_MS`). Rien ne
  suit le voyageur d'un appareil à l'autre.
- Toute langue autre que le français dans l'interface (boutons, textes fixes) : elle reste en
  français quoi que le voyageur écrive. Ce n'est pas un hors périmètre pour l'agent lui-même, qui
  doit s'adapter à la langue du voyageur (règle plus haut, `system-prompt.ts`).

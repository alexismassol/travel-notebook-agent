# Observabilité

## En bref

Ce document explique comment surveiller l'agent une fois qu'il parle à de vrais voyageurs.
Il liste ce qui peut mal tourner, précisément pour cet agent. Il décrit ce qui est déjà
enregistré dans le code, et ce qui reste à construire pour la mise en service.
Le mot le plus important : `confirmed`. Une valeur marquée confirmée doit venir des mots du
voyageur, jamais d'une supposition du modèle : c'est le risque numéro un du produit.
La plupart des chiffres viennent de vrais essais sur le modèle réel, datés, avec leur source.
Chaque section dit clairement si elle décrit du code qui tourne déjà ou une proposition.
Les mots techniques (agent, outil, trace, [mode strict](glossaire.md)...) sont expliqués dans
le [glossaire](glossaire.md) : ce document n'y renvoie pas à chaque fois pour rester lisible.

Les chiffres viennent de trois sources. Des mesures manuelles datées du 2026-09-16. Le taux
mesuré sur 3 passages par scénario, généré le 2026-09-25 (`docs/scenarios/README.md`, section
« Taux sur 3 passages par scénario »). Ce sont 48 vraies conversations, produites par
`scripts/scenarios.ts` avec `SCENARIO_REPEAT=3`, avec de vrais appels au modèle : la référence
pour tout taux cité ici. Les transcriptions du premier passage (`docs/scenarios/[1-16]-*.md`,
régénérées le 2026-09-25), citées comme exemples concrets, jamais comme mesure de fréquence.
Les chiffres produit (environ 80 %, 30 %, 50 %) sont des hypothèses
du cadrage produit, pas des mesures : chaque mention le rappelle.

## 1. Ce qui peut mal tourner, spécifique à cet agent

Classé par impact produit décroissant.

**Un carnet faux qui a l'air sûr.** Un statut `confirmed` sur une valeur que le voyageur n'a pas
dite l'engage sur une fausse base : il organise son voyage dessus. C'est le risque
le plus grave, parce qu'un carnet déjà téléchargé ne se corrige plus à distance. Il ne se voit nulle part à
l'écran (règle produit : jamais une valeur inventée affichée comme confirmée,
`docs/produit.md`). On ne le voit qu'en comparant `evidence.quote` au
message d'origine du voyageur.

Un contrôle en code corrige un cas précis, mesuré à plusieurs reprises : le nombre de voyageurs
(décision 17 du [registre des choix techniques](choix-techniques.md)). Sur le scénario
« destination ouverte, en famille », le voyageur donne l'âge des enfants mais ne dit jamais
combien d'adultes partent. Sur la transcription rejouée le 2026-09-17, le brief note bien
`travellers [inferred]`, avec la raison « déduit de vos messages : à confirmer »
(`docs/scenarios/1-destination-ouverte-famille.md`), pas `confirmed`. Ce correctif précis
tient sur ce cas.

Il reste volontairement étroit. Deux des quatre informations obligatoires ont un contrôle en code :
le nombre de voyageurs (décision 17) et la durée (décision 19). Depuis le 2026-09-17, « une dizaine
de jours » ne s'affiche donc plus « confirmé ». La destination et les dates n'ont pas d'équivalent :
leur statut `confirmed` dépend du seul jugement du modèle, jamais revérifié. Le risque numéro un
reste donc réel sur ces deux informations.

**Playbook famille chargé trop tard, ou jamais.** Les instructions `voyage-en-famille` portent
des alertes de sécurité et de rythme (`src/server/agent/playbooks/voyage-en-famille.md`). Si
l'agent recommande déjà une destination avant de les charger, elles arrivent trop tard pour
corriger la réponse.

Un filet de sécurité existe côté serveur (`src/server/agent/tools/brief-tools.ts`). Si le
brief contient des enfants et qu'aucun playbook n'est chargé, l'agent reçoit un rappel dans le
résultat d'un outil `note_*`. Mais `origin` ne vaut `nudged` que si le modèle a vu ce rappel
avant de charger le playbook (`nudgeSeenByModel`, `src/server/agent/tools/load-playbook.ts`).
Un chargement décidé dans le même appel que celui qui déclenche le rappel reste marqué
`spontaneous` : le rattrapage devient alors invisible dans les traces.

**Une affirmation factuelle sans recherche.** Sur le passage régénéré du 2026-09-17, l'agent
cherche avant de répondre dans les deux cas qui l'exigent. Pour « Le trek au Népal en juillet,
c'est jouable ? », `web_search` est appelé avant toute affirmation sur la saison
(`docs/scenarios/3-conseil-trek-nepal.md`).

Pour « C'est où Zanzibar ? », l'agent cherche d'abord, puis la fiche Zanzibar s'affiche
(`docs/scenarios/4-envie-floue-zanzibar.md`). Le garde-fou décrit plus bas reste en place : sur
une autre campagne, il a refusé une fiche tentée avant toute recherche. Le modèle ne cherche donc
pas toujours de lui-même.

Le risque n'a pas disparu pour autant : le modèle n'est pas déterministe (voir le
[glossaire](glossaire.md)). `tests/integration/agent.test.ts` ne vérifie donc plus un seul essai,
mais un taux : au moins 2 recherches sur 3 essais. Une fiche destination sans recherche qui cite
le lieu ou son pays est refusée en code, pas seulement par une règle du prompt. `ungroundedCards`
(`src/server/agent/tools/show-destination-cards.ts`, appelée par l'outil) renvoie une
erreur d'outil tant qu'aucune requête `web_search` de la conversation ne cite le
lieu ou son pays. Ce garde-fou a été ajouté après qu'un essai antérieur ait affiché une fiche Zanzibar sans
aucune recherche (décision 15 du [registre des choix techniques](choix-techniques.md)).

**Fiches refusées à tort (corrigé).** Sur un essai antérieur, le scénario famille perdait toutes
ses fiches : le contrôle comparait le nom entier du lieu à la requête de recherche. « Îles
Canaries » n'apparaît jamais tel quel dans « Canaries climat février soleil », donc la fiche
était jugée non cherchée, alors que la recherche portait bien sur ce lieu.

Corrigé par `placeWords` (`src/server/agent/tools/show-destination-cards.ts`) :
`ungroundedCards` compare maintenant des mots significatifs, quatre lettres ou plus, en écartant
les mots trop génériques comme « îles » ou « saint ». Le message de refus donne en plus la
requête à lancer (`src/server/agent/tools/show-destination-cards.ts`).

Sur la transcription du premier passage, deux fiches s'affichent au tour 2 : Guadeloupe et Îles
Canaries (`docs/scenarios/1-destination-ouverte-famille.md`). La troisième, Costa Rica, n'est pas
montrée. Sur les 3 passages répétés
de ce scénario, la fiche s'affiche maintenant 3 fois sur 3 (`docs/scenarios/README.md`), contre
2 fois sur 3 avant ce correctif. C'est un net progrès, mais l'échantillon reste petit : 3
passages ne suffisent pas à garantir que ça tienne sur un vrai volume de conversations.

**Un formulaire déguisé.** Poser une question déjà répondue dans le brief, ou enchaîner les
questions dans un ordre fixe, reproduit l'échec du formulaire que l'agent doit éviter
(`docs/produit.md`). La règle vit surtout dans le prompt système :
« Jamais une question dont la réponse est déjà dans le brief »
(`src/server/agent/system-prompt.ts`). Ce n'est pas un contrôle en code.

Un calcul aide dans ce sens. `nextQuestionHint` choisit la question suivante après
l'enregistrement du message du voyageur, sur l'état à jour du brief
(`src/server/agent/brief/next-question.ts`). Il passe par `briefGuidance`, appelée une fois par
appel au modèle depuis `src/server/agent/loop.ts`.
Mesuré sur 3 passages : la question à choix est passée de 2 essais sur 21 à 8 sur 21 quand ce
calcul est arrivé (décision 9 du [registre des choix techniques](choix-techniques.md)). La
campagne du 2026-09-25, plus large, en compte 25 sur 48. Ça reste une aide, pas une
garantie : rien n'empêche le modèle de reposer ailleurs une question déjà répondue.

**Abandon.** Le voyageur ferme l'onglet. Rien ne mesure encore la fidélisation tour par
tour. Un abandon par lassitude et un abandon parce que la conversation a atteint son but sans
passer par `present_brief` sont donc indistinguables.

**Entrées d'outils abîmées.** Trois formes mesurées. La première : une entrée rejetée par Zod,
avec de la syntaxe d'appel d'outil recopiée dedans (schéma imbriqué du premier essai). La
deuxième : la même syntaxe, mais dans le texte envoyé au voyageur, pas dans un paramètre d'outil
(cas du 2026-09-16, `src/server/agent/text-guard.test.ts`). La troisième, mesurée le
2026-09-17 : un JSON d'entrée mal écrit par le modèle, illisible, qui faisait échouer tout le
tour.

`findLeakedSyntax` (`src/server/agent/tools/types.ts`) intercepte la syntaxe fuitée avant
qu'elle entre dans le brief, appelée en `src/server/agent/loop.ts`. Depuis le 2026-09-17, il
refuse aussi un accent écrit en code au lieu du caractère (cas réel `Cor\"{e du Sud` pour
« Corée du Sud », qui serait parti tel quel dans le carnet).

Pour le JSON illisible, le tour ne s'arrête plus en entier. Le message reçu jusque-là est repris
(`src/server/agent/loop.ts`). L'appel cassé garde une entrée vide dans l'historique
(`:149-161`) et reçoit une erreur d'outil (`unreadableInput`,
`src/server/agent/tools/types.ts`, renvoyée `src/server/agent/loop.ts`). Le modèle peut
alors réécrire son appel dans le même tour.

Une quatrième forme, plus fine, touche `show_destination_cards` : le modèle envoie parfois la
liste des fiches en texte JSON, avec des balises de citation recopiées d'une recherche web.
`repairCardsInput` (`src/server/agent/tools/show-destination-cards.ts`) répare l'entrée
avant de la vérifier, sans changer le schéma envoyé au modèle.

C'est plus grave qu'une fuite dans un paramètre d'outil quand elle passe directement dans le
texte affiché au voyageur : `findLeakedSyntax` ne regarde que les entrées d'outils, jamais le
texte du message. Ce trou a été comblé par `createVisibleTextFilter`
(`src/server/agent/text-guard.ts`). Il coupe le texte visible dès qu'une balise d'appel d'outil
commence à apparaître, nettoie le texte déjà gardé dans l'historique, et trace la fuite
(`text_leak`, `src/server/agent/loop.ts`). Sur les 16 transcriptions du passage final,
aucune ne montre cette fuite dans le texte visible : le garde-fou tient, sur ce jeu de scénarios.

Ce garde-fou ne filtre que la syntaxe d'appel d'outil, pas le vocabulaire interne. Sur un essai
antérieur, l'agent avait dit lui-même « Votre brief est complet » au voyageur : le mot technique
fuitait dans une phrase par ailleurs correcte. Le prompt système porte maintenant une règle
explicite : ne jamais dire « brief » au voyageur, dire « votre projet »
(`src/server/agent/system-prompt.ts`). Sur la mesure finale des 48 passages, ce mot
n'apparaît plus une seule fois dans une réponse visible (`docs/scenarios/README.md`, colonne
« brief », 0 sur 48). C'est une règle de prompt suivie par le modèle, pas un contrôle en code :
rien n'empêche le mot de revenir si le modèle change de comportement.

**Généralisation limitée aux scénarios de référence.** Les 16 scénarios de référence ont servi à
régler l'agent. Un agent réglé sur ses propres cas peut échouer ailleurs
(`docs/scenarios/robustesse.md`). Un essai a rejoué 12 intentions jamais vues, deux fois chacune,
sur le vrai modèle et la vraie recherche web.

Les mêmes correctifs (décisions 9, 15, 17 et 18) tiennent en partie sur ce jeu inconnu. La
question à choix passe de 5 passages sur 24 à 9 sur 24. La recherche web passe de 7 sur 24 à 9 sur
24. Les fiches pour un voyage de noces restent à 0 sur 2 : ce cas ne progresse pas. Le tutoiement
reste à 0 sur 24 sur les deux mesures (`docs/scenarios/robustesse.md`).

Un point reste faible : sur l'intention « contrainte de mobilité » (fauteuil roulant), aucun des
2 passages ne déclenche de recherche web (une question à choix, elle, est posée sur 1 passage sur
2). La transcription complète est hors du dépôt (`data/spikes/`) : impossible de dire ici si
l'information a au moins été notée dans le brief.

**Un coût qui dérive.** Une recherche web coûte environ 10 000 tokens d'entrée pour une seule
requête (`src/server/config.ts`, décision 8 du [registre des choix techniques](choix-techniques.md)),
et ce coût reste dans l'historique pour tous les tours suivants. `webSearchMaxUses` limite chaque
appel au modèle à 2 recherches (`src/server/config.ts`). Mais rien ne limite le nombre
d'appels au modèle qui peuvent chacun chercher, dans la limite de `maxModelCalls` (6,
`src/server/config.ts`).

**Latence, dont la préparation du schéma après une mise à jour.** Mesuré le 2026-09-16 : le
premier appel après un changement de schéma en [mode strict](glossaire.md) a pris 67,5 secondes,
le temps de préparer la grammaire contrainte. L'appel suivant a pris 6 secondes (décision 7 du
[registre des choix techniques](choix-techniques.md)). Une mise à jour du schéma dégrade donc le
premier appel de chaque tour, pendant une fenêtre de 24 heures où l'API garde la grammaire en
mémoire.

Le serveur prépare maintenant les schémas à son démarrage (`src/server/agent/warm-up.ts`, appelé
par `src/server/index.ts`) : c'est la mise à jour, pas le premier voyageur, qui absorbe ce délai.
Le client Anthropic attend au plus 120 secondes et retente une seule fois en cas d'échec réseau
court (`src/server/index.ts`). Au-delà, le message d'erreur générique de la section
fonctionnelle s'affiche.

**Injection par un résultat de recherche web.** Le prompt système dit que les résultats de
recherche sont des données à vérifier, jamais des instructions
(`src/server/agent/system-prompt.ts`). C'est une consigne donnée au modèle, pas un filtre en
code. Rien ne détecte, côté serveur, qu'une page indexée contenait une instruction adressée à
l'agent.

## 2. La trace d'un tour

Ce qui s'enregistre déjà en code, par `trace()` (`src/server/conversation.ts`) : une
ligne par événement, dans un fichier JSONL par conversation (voir le [glossaire](glossaire.md)).

Les appels ne font jamais attendre l'écriture d'une trace : une trace ne doit pas ralentir un
tour. Sans précaution, deux écritures en même temps sur le même fichier pourraient inverser
l'ordre des lignes. Une file d'écriture par conversation (`traceQueues`,
`src/server/conversation.ts`) empêche ça : les écritures s'enchaînent dans l'ordre des
appels. Un test réel le vérifie, en lançant 30 écritures sans attendre puis en relisant le
fichier (`src/server/conversation.test.ts`), pas seulement supposé à la lecture du code.

- `tool_call` : nom de l'outil, entrée brute, `isError` (`src/server/conversation.ts`,
  `src/server/agent/loop.ts`). Reconstitue ce que le modèle a tenté, y compris les
  tentatives rejetées par la validation.
- `playbook_loaded` : nom, raison donnée par le modèle, `origin` (`spontaneous` ou `nudged`)
  (`src/shared/events.ts`). Seule trace qui distingue un playbook chargé par décision
  propre de l'agent d'un playbook chargé après un rappel serveur. Encore faut-il que ce rappel
  ait été lu par le modèle avant le chargement (`nudgeSeenByModel`,
  `src/server/agent/tools/load-playbook.ts`).
- `playbook_nudge` : le serveur a détecté des enfants dans le brief sans playbook chargé
  (`src/server/agent/tools/brief-tools.ts`). Sans elle, on ne verrait que le chargement
  final, jamais qu'il a fallu un rappel.
- `turn_usage` : la structure `TurnUsage` (appels au modèle, tokens d'entrée et de sortie, cache
  lu et écrit, recherches web, délai avant le premier texte, durée) plus les `stopReasons` de
  chaque appel (`src/shared/events.ts`, `src/server/conversation.ts`). Les
  `stopReasons` disent pourquoi la boucle s'est arrêtée (outil demandé, fin normale, pause,
  refus, ou coupure à `maxModelCalls`) : deux tours au même coût peuvent avoir des `stopReasons`
  très différents.
- `brief_state` : version du brief, nombre d'obligatoires suffisants, `ready`, écrit à chaque
  mise à jour du brief (`src/server/agent/tools/brief-tools.ts`, test réel
  `src/server/conversation.test.ts`). Rend calculables deux métriques de la section 3 :
  « conversations qui atteignent le seuil du carnet complet » et « tours jusqu'au seuil ». Elles ne
  l'étaient pas avant cette trace. L'événement `brief_updated` qu'elles supposaient rejouable
  n'est qu'un événement envoyé à l'interface, jamais écrit sur disque.
- `error` : message d'erreur, à l'endroit exact où le tour a échoué
  (`src/server/agent/loop.ts`). La conversation revient à l'état d'avant le tour. Cette
  trace est donc le seul endroit où l'on voit qu'un tour a été annulé sans laisser de suite
  visible dans le brief.
- `text_leak` : le texte visible contenait une balise d'appel d'outil, coupée avant l'affichage
  (`src/server/agent/text-guard.ts`, tracé en `src/server/agent/loop.ts`). Sans elle,
  cette fuite ne se verrait qu'en relisant les transcriptions à la main (section 4).

Ce qui manque encore, à ajouter à `TraceRecord` (une proposition, pas du code existant) :

- **Une empreinte du prompt système et du schéma d'outils.** Le prompt est figé dans le code
  (`src/server/agent/system-prompt.ts`), sans empreinte ni numéro de version dans la trace.
  Le cache de prompt d'Anthropic est une correspondance de préfixe. Une empreinte par tour
  montrerait deux choses : une chute du taux de cache au moment exact d'une mise à jour, et quel
  prompt un tour a réellement exécuté.
- **La version exacte du modèle réellement utilisée.** `TurnUsage.model` porte le nom configuré
  (`src/server/config.ts`), pas nécessairement la version que l'API sert à cet instant.

## 3. Métriques

Chaque métrique : sa définition, calculable depuis les traces ; pourquoi elle compte ; un seuil
d'alerte (toujours une hypothèse, à ajuster sur du vrai volume de conversations).

**Le ton, mesuré automatiquement par `reply-metrics.ts`.** Chaque réponse visible est comptée
par des motifs de texte, pas relue à la main : un motif se rejoue sur 48 passages, une relecture
non (`src/server/agent/reply-metrics.ts`). Cinq compteurs : les superlatifs publicitaires, les
phrases qui racontent les coulisses (« je vais enregistrer », « je note »...), le mot « brief »,
le tutoiement, et le nombre de mots. Les motifs viennent d'un audit du 2026-09-17 sur les 7
premières transcriptions : superlatif dans 6 sur 7, narration dans 2 sur 7, « brief » dans 1 sur
7 (`src/server/agent/reply-metrics.ts`).

Sur la mesure finale de 48 passages (`docs/scenarios/README.md`) : superlatif 21 sur 48,
phrase de coulisses visible 6 sur 48, « brief » 0 sur 48, tutoiement 0 sur 48, réponse de plus de
80 mots 6 sur 48. Les phrases de coulisses retirées par le filtre se comptent à part, dans la trace
`coulisses_retirees` : 30 sur les deux campagnes. Un compteur à zéro ne prouve pas que le ton est bon partout : il prouve que ce défaut précis
est absent sur ce jeu de scénarios précis. Le modèle n'est pas déterministe : sur deux mesures du
même agent, un taux comme celui-ci peut bouger d'un passage sur trois.

**Taux de conversations qui atteignent le seuil du carnet complet.** Part des conversations où
`computeCompleteness(brief).ready` devient vrai au moins une fois, calculable depuis la trace
`brief_state` (section 2). Sépare une conversation utile d'un abandon avant que le carnet soit
complet. Hypothèse de seuil d'alerte : une baisse de plus de 10 points sur 7 jours glissants
déclenche une revue (pas de valeur absolue tant qu'on n'a pas de vrai volume pour la calibrer).

**Tours médians jusqu'au seuil du carnet complet.** Médiane du numéro de tour où le brief devient
prêt, elle aussi calculable depuis `brief_state`. Sur la campagne du 2026-09-25 (3 passages par
scénario, `docs/scenarios/README.md`), trois scénarios sur seize atteignent ce seuil au moins une
fois. Informations déjà complètes et tout donné dès le premier message : 3 fois sur 3 chacun, les
deux dès le tour 1. Contradiction dans la durée : 1 fois sur 3. Les treize autres scénarios ne
l'atteignent jamais (0 sur 3), y compris destination ouverte en famille malgré la correction du
refus de fiches (section 1). C'est la mesure directe de la tension entre abandon (environ 80 %,
chiffre produit supposé, moins de tours) et pauvreté du brief (environ 30 %, supposé, plus de
tours). Une médiane qui grimpe sans que le taux d'atteinte baisse signale des questions
redondantes plutôt qu'un gain de qualité.

**Taux de chargement `nudged` contre `spontaneous` du playbook famille.** Part des chargements
`playbook_loaded` dont `origin = "nudged"`. `nudged` veut dire que le code a rattrapé une
omission du modèle après coup, potentiellement après une recommandation déjà donnée sans les
instructions de sécurité famille. Hypothèse de seuil : au-delà de 20 % de `nudged`, revoir le
prompt ou la description de `load_playbook` plutôt que de compter sur le rattrapage serveur.

**Taux d'erreur d'outils.** Part des `tool_call` avec `isError: true`, décomposée par cause :
validation Zod contre fuite de syntaxe (`findLeakedSyntax`). Les deux causes ont des remèdes
différents : la première se corrige en clarifiant le schéma, la seconde a déjà motivé un
changement d'architecture (des objets imbriqués vers des outils plats,
`src/server/agent/tools/brief-tools.ts`). Premier essai (schéma imbriqué) : taux d'erreur
élevé, au point de laisser un brief vide en famille après 8 appels. Essais avec les outils
plats : aucune erreur Zod relevée, et aucune fuite de narration dans le texte visible (section
1). Ce taux, mesuré seulement sur les entrées d'outils, ne verrait de toute façon pas ce second
type de défaut. La trace `text_leak` (section 2) est le seul signal dédié à cet angle-là.

**Taux de refus de fiches destination.** Part des `tool_call` sur `show_destination_cards` avec
`isError: true`, calculable depuis la même trace `tool_call` filtrée sur ce nom d'outil : le
signal direct du garde-fou `ungroundedCards` (`src/server/agent/tools/show-destination-cards.ts`).
Pas encore isolé dans un tableau de suivi, seulement filtrable à la main sur le nom d'outil et
`isError`. En creux, le taux de fiche effectivement affichée le donne déjà. Sur 48 passages
(`docs/scenarios/README.md`), sept scénarios affichent leurs fiches au moins une fois sur trois.
Destination ouverte en famille, envie floue Zanzibar et le voyageur qui pose les questions sont à
3 sur 3. Dépaysement sans la foule et le mode surprise sont à 2 sur 3. Contradiction dans la durée
et le voyageur qui ne sait pas sont à 1 sur 3. Les neuf autres scénarios restent à 0 sur 3.
L'outil n'y a probablement jamais été appelé, faute de destination ouverte à illustrer (la trace
`tool_call` lèverait l'ambiguïté). Un taux de refus qui grimpe après une mise à jour signale soit
une régression du garde-fou, soit un modèle qui a cessé de chercher avant de proposer des fiches.

**Recherches web par conversation, et part de tokens liée.** Nombre de `webSearches` cumulés
(`TurnUsage.webSearches`) et tokens d'entrée qu'elles représentent, sachant qu'une recherche
coûte environ 10 000 tokens d'entrée et reste dans l'historique de tous les tours suivants.
C'est le poste de coût le moins prévisible : un voyageur qui pose plusieurs questions factuelles
dans la même conversation peut la faire grimper de façon disproportionnée. Sur 48 passages
(`docs/scenarios/README.md`), trois scénarios ont une recherche systématique, 3 sur 3 : conseil
trek Népal, envie floue Zanzibar et le voyageur qui pose les questions. Le mode surprise l'a
aussi, à 3 sur 3. Cinq scénarios n'en lancent aucune sur leurs trois passages. Ce sont
informations déjà complètes, composition variable, le voyageur hésite à partir, la demande hors
sujet et le voyageur qui se contredit dans la même phrase. 23 recherches web au total sur les
48 passages, facturées 30 fois par l'API.

**Coût par conversation et par carnet validé, pas par requête.** Somme des coûts en tokens
agrégée par conversation, puis divisée par le nombre de carnets effectivement validés
(`persistSentBrief` appelé, `src/server/conversation.ts`). Par conversation et non par
requête, parce qu'une requête isolée ne dit rien du coût d'aller jusqu'au bout. Par carnet validé,
parce qu'une conversation qui n'aboutit jamais à une validation a un coût mais aucun résultat pour
le voyageur. Sur 48 passages (`docs/scenarios/README.md`), le coût moyen va de 0,0096 $ à 0,0668 $ selon
le scénario. Le moins cher est le voyageur qui hésite à partir, sans recherche ni fiche. Le plus
cher est le voyageur qui veut être surpris, avec recherche web et plusieurs fiches. Total :
1,1883 $ pour les 48 passages, plus 26 recherches web facturées à part.

**Latence, temps au premier texte et temps total.** `TurnUsage.durationMs` donne la durée totale
du tour ; `TurnUsage.firstTextMs` donne le délai avant le premier fragment de texte envoyé au
voyageur (`src/shared/events.ts`, calculé en `src/server/agent/loop.ts`, affiché dans les
« Détails techniques » de l'interface, `src/web/App.tsx`). Le voyageur juge la réactivité
sur ce qu'il voit, pas sur la durée totale côté serveur : c'est `firstTextMs` qui s'en approche
le plus.

**Relevé sur 611 tours réels**, toutes les traces de `data/traces/` hors tests. Premier mot :
1,3 s de médiane, 6,3 s pour neuf tours sur dix, 29 s au pire. Tour complet : 8,2 s de médiane,
22,4 s pour neuf sur dix, 98,9 s au pire. 36 % des tours dépassent dix secondes, et 173 de ces
220 tours lancent une recherche web. La recherche est donc le premier facteur de latence. Coût
médian d'un tour : 0,017 $, et le cache sert 76,7 % de l'entrée.

Mesure du 2026-09-17, sur 21 conversations de référence réelles (décision 11 du
[registre des choix techniques](choix-techniques.md)). Premier texte visible : 1,2 seconde en
médiane, 3,3 secondes pour les 10 % les plus lents. Tour complet : 9,5 secondes en médiane, 27,9
secondes pour les 10 % les plus lents. Le tour le plus long atteignait alors 50,3 secondes. Sur
la campagne du 2026-09-25, plus large, le tour le plus long atteint 54,6 secondes, sur le mode
surprise (`docs/scenarios/README.md`). Le modèle n'est pas déterministe : sur la
mesure précédente du même agent, avant le seul changement d'affichage des appels intermédiaires, le
tour le plus long n'était que de 25,4 secondes. Avant ce tour de correctifs, il montait à
59,4 secondes.

Une règle a été essayée puis retirée : ne jamais écrire de texte avant d'appeler un outil. Elle
reste en mémoire pour ne pas être retentée. Elle a fait grimper le premier texte à 5,5 secondes
en médiane et 20,2 secondes pour les plus lents, avec un tour famille à 98,9 secondes. Un écran
vide plus long coûte plus qu'une phrase maladroite avant l'outil.

Hypothèse de seuil : 15 secondes par tour en régime normal, hors fenêtre de 24 heures suivant une
mise à jour de schéma (indicateur séparé, section 5). La médiane des 10 % les plus lents, 27,9
secondes, dépasse déjà cette hypothèse : à surveiller sur du vrai trafic plutôt qu'à durcir sur
48 passages seulement.

**Taux de valeurs `inferred` restées non confirmées au moment de la validation.** Part des cases
`inferred` sur `TravelBrief` quand `present_brief` réussit. `inferred` est exclu des statuts
acceptés (`src/server/agent/brief/completeness.ts`) pour les obligatoires, mais les cases
utiles (ville de départ, budget, style, envies, contraintes) peuvent rester `inferred` dans un carnet validé sans
empêcher la validation. Un taux élevé sur les utiles indique des déductions non validées, à côté de
faits confirmés.

**Question à choix contre question ouverte.** Part des tours où l'agent utilise `ask_choice`
plutôt qu'une question en texte libre. Pas encore dans une trace dédiée, seulement visible via
`tool_activity`. `nextQuestionHint` (section 1) pousse dans cette direction sans le garantir : le
taux mesuré sur 48 passages est de 25 sur 48 (`docs/scenarios/README.md`). Une part de choix qui
monte sur des tours où le voyageur exprime une envie personnelle signale que l'agent questionne
au lieu d'écouter.

**Abandon par tour.** Numéro du dernier tour avant qu'une conversation cesse de recevoir des
messages, croisé avec l'état du seuil du carnet complet à ce moment-là. Distingue deux abandons.
Celui avant que le brief soit complet, proche du chiffre produit supposé de 80 %. Celui après
complétude mais avant la validation, une hypothèse : hésitation, proche du chiffre supposé de 50 %
côté suite.

**Taux d'erreurs 429 (trop de tours) et 413 (message trop lourd).** Signal nouveau, pas encore
dans une trace : ces deux codes sont renvoyés avant même de lancer le tour (`src/server/app.ts`
pour la taille, `:79` pour le nombre de tours). Ils n'apparaissent donc dans aucune ligne du
fichier JSONL d'une conversation, seulement dans ces codes d'erreur eux-mêmes (à instrumenter côté
serveur web). Depuis le 2026-09-17, le contrôle de taille s'applique à toutes les routes de
l'API, y compris la création d'une conversation. Avant ce jour, cette seule route acceptait un
message jusqu'à 40 Ko sans y toucher. Un taux de 429 qui monte signale des conversations qui
tournent en rond sans jamais atteindre le seuil du carnet complet (40 tours consommés pour rien). Un taux
de 413 signale soit un usage détourné, soit un besoin réel non couvert par la limite de 2 000
caractères par message. Sans historique encore mesuré, aucun seuil d'alerte n'est proposé ici : à
définir une fois qu'un premier vrai trafic existe.

**Lien business : part des carnets téléchargés qui servent vraiment à réserver.** Ce chiffre
(environ 30 %, hypothèse du cadrage produit) ne se mesure pas depuis les traces de l'agent, mais
auprès des voyageurs après le téléchargement. Le lien à construire est une corrélation : carnet
validé sans `inferred` ni `conflicting` non tranché contre carnet validé avec des cases utiles
encore `inferred`, comparés sur leur taux d'usage réel pour réserver.

## 4. Ce qu'on regarde à la main chaque semaine

Un échantillon de conversations, pas la moyenne d'une métrique. Deux catégories chaque semaine :

- **Les carnets validés avec le score de complétude le plus bas parmi les validés** (proche du
  seuil du carnet complet). C'est là que la frontière posée par `computeCompleteness` se révèle
  trop généreuse ou trop stricte sur des cas réels, pas seulement sur les 16 scénarios de référence.
  Cette frontière tient compte de la fenêtre de dates, de l'écart de durée et de l'écart de
  voyageurs (`src/server/agent/brief/completeness.ts`).
- **Les conversations avec au moins une erreur d'outil ou une trace `playbook_nudge`** : relire
  le texte réellement montré au voyageur à ce tour-là. Seule façon de voir si une fuite de
  narration (section 1) revient malgré un correctif : une régression qu'un taux agrégé peut
  masquer si le volume augmente en même temps.

Les métriques disent qu'un problème existe et à quelle fréquence, pas ce qu'un voyageur a vu à
l'écran. La fuite de syntaxe brute observée une fois en cours de développement (2026-09-16)
est hors du champ de `findLeakedSyntax` (section 1). Elle n'aurait déclenché aucune alerte
automatique au moment où elle est apparue. Seule une lecture l'a fait remonter. Elle est désormais coupée
en direct et tracée en `text_leak` (section 2), confirmée absente sur les 16 transcriptions du
passage final. Mais aucun seuil d'alerte n'est encore défini sur cette trace : une lecture
manuelle reste le seul filet tant que ce seuil n'existe pas.

## 5. Dérive

Trois sources de dérive repérées, chacune avec son propre signal dans les traces.

**Changement de modèle.** `TurnUsage.model` porte le nom configuré (`src/server/config.ts`),
qu'on peut changer avec la variable `ANTHROPIC_MODEL`. Un changement involontaire peut venir
d'une variable modifiée par erreur, ou d'un nom de modèle dont la version change côté API. Il se
voit en comparant les `stopReasons` et le coût moyen par tour avant et après une mise à jour, à
`model` identique en apparence.

**Changement du prompt système.** Rien ne garde une empreinte du prompt dans la trace (section
2, proposition non construite). Seule la date de mise à jour du serveur permet de dater un
changement. Le signal le plus net : une chute brutale des tokens lus en cache dès le premier tour
qui suit, parce que le prompt figé change de préfixe (`src/server/agent/system-prompt.ts`).

**Changement du schéma d'un outil.** Un signal déjà observé : un pic de latence isolé sur le
premier appel après une mise à jour du schéma (67,5 secondes mesurées le 2026-09-16, contre 6
secondes ensuite). La cause : l'API doit reconstruire la grammaire du
[mode strict](glossaire.md). Une alerte dédiée, « premier appel après une mise à jour de plus de
30 secondes », éviterait de confondre ce cas avec une vraie dégradation de latence.

## Sources

- Chip Huyen, *AI Engineering*, p.877-878, définit trois mesures de la qualité d'une
  observabilité elle-même : le temps moyen de détection, le temps moyen de réparation, et le taux
  d'échec d'un changement. Ce document les transpose en n'ajoutant pas seulement des métriques
  (section 3), mais aussi une lecture manuelle (section 4) et une détection de dérive (section 5).
- Chip Huyen, *Designing Machine Learning Systems*, p.280 : distingue la surveillance par
  métriques de l'observabilité, qui permet d'investiguer. Ça justifie de partir des traces
  (section 2) avant les métriques qu'elles rendent possibles (section 3).
- Valliappa Lakshmanan, *Generative AI Design Patterns*, p.609-610 (motif 32, garde-fous),
  définit un garde-fou comme du code qui encadre entrées, sorties, contexte et paramètres
  d'outils. Ce document l'utilise en section 1 pour distinguer le garde-fou existant
  (`findLeakedSyntax`, sur les entrées d'outils) de ce qu'il ne couvre pas : le texte envoyé au
  voyageur.
- Stephen Clear, *Claude AI Bible*, p.85, et Chip Huyen, *AI Engineering*, p.473, nomment ce
  risque : l'injection par un résultat de recherche web. Les deux la qualifient de plus puissante
  qu'une injection directe quand elle passe par un outil. Elle est citée en section 1 contre
  l'idée de la traiter comme théorique.

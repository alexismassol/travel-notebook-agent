# Évaluation

## En bref

- Ce document dit ce qu'on vérifie en priorité sur cet agent, pourquoi, et comment.
- Priorité n°1 : les informations du carnet de voyage doivent être vraies. Le reste vient après.
- Le modèle ne répond pas toujours pareil au même message. On mesure donc des taux sur plusieurs
  essais, jamais la réussite d'un seul essai.
- Trois façons de vérifier : des tests automatiques (rapides, gratuits), des scénarios rejoués sur
  le vrai modèle (payants, quelques centimes), et plus tard, le retour des voyageurs eux-mêmes.
- Dernière mesure complète des scénarios : le 2026-09-25, sur 48 conversations réelles. Tests
  automatiques vérifiés le 2026-09-21 : 395 tests.
- Des défauts persistent et sont chiffrés plus loin (section 6) : superlatifs, réponses trop
  longues, question à choix qui ne se déclenche pas toujours.
- Les mots techniques (statut, playbook, brief...) sont expliqués dans le [glossaire](glossaire.md).

Les chiffres viennent de trois sources. Des mesures manuelles faites le 2026-09-16. Le taux mesuré
sur 3 passages par scénario, rejoué le 2026-09-25, sert de référence pour tout taux cité ici
(`docs/scenarios/README.md`, « Taux sur 3 passages par scénario », 48 passages réels,
`scripts/scenarios.ts` avec `SCENARIO_REPEAT=3`, vrais appels à l'API Messages). Et les transcriptions
du premier passage (`docs/scenarios/[1-16]-*.md`, régénérées le 2026-09-25), citées comme
exemples concrets. Les tests automatiques cités en section 6 ont été relancés juste avant de
publier ce document (`npx vitest run`, 2026-09-17 vers 08h14) : un autre horodatage que celui des
scénarios, deux mesures réelles mais distinctes. Les chiffres produit (~80 %, ~30 %, ~50 %)
viennent du cadrage produit (`docs/produit.md`) : ce sont des hypothèses, pas des mesures.

## 1. Priorités ordonnées

Le critère : risque produit fois fréquence. Un défaut rare qui casse la confiance du voyageur pèse
plus qu'un défaut fréquent mais juste inélégant.

**(a) Fidélité du brief.** Aucune valeur inventée, aucun statut faux, aucune nuance perdue. C'est
la priorité n°1 : c'est ce que le voyageur emporte dans son carnet. Une erreur ici ne se voit pas
côté interface (règle produit, `docs/produit.md`). Elle se propage jusque dans le budget et les
réservations du voyageur sans que personne ne la corrige en route.

Le risque est réel, pas théorique. Le tout premier essai (ancien schéma d'outil imbriqué) a laissé
un brief vide en famille, après 8 appels d'outil échoués. Une fuite de texte de coulisses vers le
voyageur a aussi été vue une fois en développement, le 2026-09-16. Sur les 16 transcriptions du
dernier passage, aucune fuite de ce genre n'apparaît (`docs/observabilite.md` section 1).

Le risque touche aussi les valeurs elles-mêmes, pas seulement la forme du texte. Sur une capture
d'écran hors scénarios, Haiku avait écrit « 3 semaines en solo » en texte visible, alors que le
carnet indiquait 2 adultes (capture non versionnée). Aucun garde-fou de forme n'attrape ce genre
d'erreur : le texte est propre, seule l'information est fausse.

Le scénario famille du jeu de référence montrait le même risque, dans l'autre sens. Avant le
correctif de la décision 17, ce scénario marquait `travellers [confirmed] 2 adultes et 2 enfants`
alors que le voyageur n'avait jamais dit le nombre d'adultes : un brief faux qui a l'air sûr. Sur
le passage rejoué après ce correctif, le même scénario marque bien
`travellers [inferred] 2 adultes et 2 enfants (4 et 7 ans)`, avec la note « déduit de vos
messages : à confirmer » (`docs/scenarios/1-destination-ouverte-famille.md:51`). La date reste
`confirmed vacances de février`, sans année précisée ni inventée (`:49`). C'est la preuve, sur un
cas réel, que le correctif tient.
Preuve en test : 11 tests sur des phrases réelles (`src/server/agent/brief/fidelity.test.ts`), plus
1 test sur la lecture des mots du voyageur (`traveller-text.test.ts`). Détail en section 6.
La même relecture a trouvé le cas jumeau sur la durée : « une dizaine de jours » affiché « 9 nuits,
confirmé ». Il est corrigé le même jour par le même mécanisme (décision 19). Vérifié sur un vrai
passage : `duration [vague] 9 à 10 nuits`, avec la même conversation.

**(b) Contrainte famille.** Le playbook doit se charger avant toute recommandation. Deuxième
priorité : le coût d'un manquement porte sur la sécurité (signaux d'alerte sanitaires du playbook,
`src/server/agent/playbooks/voyage-en-famille.md`). La fréquence mesurée reste bonne : sur les deux
scénarios avec enfants du jeu de 16, le chargement est `spontaneous`, dès le premier tour où les
enfants sont nommés (`docs/scenarios/1-destination-ouverte-famille.md`). Deux cas famille sur 16
ne suffisent pas à conclure sur la fréquence réelle des ratés (voir section 2). La même logique
couvre le playbook `voyage-surprise` : son chargement se mesure aussi par son taux `spontaneous`,
et sa proposition par les fiches destination montrées dès le premier tour
(`docs/scenarios/16-surprenez-moi.md`).

**(c) Ancrage factuel.** Chercher avant d'affirmer une saison ou une formalité. Troisième priorité :
le coût d'une hallucination sur une contre-indication sanitaire est élevé, mais il ne se voit qu'en
comparant la réponse à la réalité, jamais depuis le carnet seul. Les deux scénarios qui demandent
une vérification factuelle l'obtiennent de façon systématique : `web_search` avant la réponse sur
le trek au Népal en juillet, et avant la fiche Zanzibar (3 recherches sur 3 chacun,
`docs/scenarios/README.md`).

Ce risque reste réel car le modèle n'est pas déterministe (section 3). Il est couvert par un test
automatique à taux (`tests/integration/agent.test.ts`), et par un refus en code des fiches non
ancrées (`ungroundedCards` dans `src/server/agent/tools/show-destination-cards.ts`, détail en
section 6). Ce refus comparait autrefois le nom entier d'un lieu composé (« Îles Canaries ») à une
requête plus courte, et rejetait à tort toutes les fiches du scénario famille. C'est corrigé : les
trois fiches du scénario famille s'affichent maintenant 3 fois sur 3 sur la mesure finale
(`docs/scenarios/README.md`). L'instabilité s'est déplacée ailleurs. Sur le scénario « Dépaysement
sans la foule », la fiche s'affiche deux fois sur 3 (`docs/observabilite.md` section 3, taux de
refus de fiches). C'est un progrès, mais ce n'est pas encore résolu partout.

**(d) Efficacité du dialogue.** Pas de question redondante, carnet complet sans re-questionner
quand tout est donné. Quatrième priorité : le coût d'un raté ici est un abandon (~80 % supposé), pas
une information fausse. Le scénario « informations déjà complètes » valide le cas simple : 4/4
obligatoires dès le tour 1, sans `ask_choice`, et `present_brief` appelé dans le même tour sans
qu'il faille le forcer (`docs/scenarios/2-infos-completes.md`). Le tour 1 prend 14 228 ms pour
2 appels modèle (enregistrer puis récapituler). Le tour 2, la confirmation du carnet, est presque
immédiat (2 195 ms, cache chaud) : le coût perçu vient du nombre d'appels modèle nécessaires, pas
d'une question redondante.

**(e) Coût et latence par conversation.** Dernière priorité : mesurable, réel, mais un dépassement
de coût ne casse pas la confiance du voyageur comme un carnet faux. À surveiller (voir
`docs/observabilite.md` section 3), pas à bloquer une mise en production à elle seule, sauf dérive
brutale.
Sur la mesure du 2026-09-17 (21 conversations réelles, décision 11), le premier texte visible
arrive à 1,2 s en médiane, et à 3,3 s pour les 10 % les plus lents. Le tour complet prend 9,5 s
en médiane, et 27,9 s pour les 10 % les plus lents. Le tour le plus long atteignait 50,3 s. Sur
la campagne du 2026-09-25, plus large, il tombe à 48,1 s. Le modèle n'est pas déterministe : sur la mesure précédente du même
agent, avant le seul changement d'affichage des appels intermédiaires, le tour le plus long
n'était que de 25,4 s. Avant ce round de correctifs, il montait à 59,4 s.

Une piste a été essayée puis abandonnée : supprimer tout texte avant un appel d'outil, pour
afficher plus vite. Mesuré : premier texte à 5,5 s en médiane et 20,2 s pour les 10 % les plus
lents, et un tour famille à 98,9 s. Un écran vide plus de 5 secondes coûte plus qu'une phrase
d'accompagnement maladroite : la règle a été retirée (décision 11).

## 2. Hors ligne

**Jeu de scénarios.** Point de départ : les 16 intentions de `scripts/scenarios.ts`. Les sept
premières couvrent le cadrage du projet (destination ouverte en famille, infos complètes, conseil
qui se heurte à la réalité, envie floue, dépaysement sans la foule, contradiction, composition
variable). Les huit suivantes couvrent le voyageur difficile. Tout donné d'un coup, « je ne sais
pas », hésitation à partir, hors sujet. Puis contradiction dans une phrase, voyageur pressé,
message en anglais, et voyageur qui pose les questions. La seizième teste le mode surprise : le
voyageur veut être surpris. À étendre par catégorie plutôt qu'en ajoutant des cas isolés :

- formulations imprévues d'une même intention (dates données en jours de la semaine, budget en
  fourchette verbale « pas trop cher ») ;
- contradictions sur d'autres champs que la durée (déjà couverte) : destination, nombre de
  voyageurs ;
- familles implicites, sans le mot « enfant » : « avec les petits », « ma fille de 3 ans ». Ces
  formulations sont déjà listées dans le déclencheur du playbook
  (`src/server/agent/playbooks/index.ts`), mais aucun scénario du jeu de référence ne les
  utilise mot pour mot ;
- voyageurs pressés qui donnent tout en une phrase, avec une incohérence immédiate (dates qui ne
  collent pas à la durée).

**Essai de robustesse.** Les premiers scénarios de référence ont servi à régler l'agent : un agent réglé
sur ses propres cas peut échouer ailleurs. Un essai à part rejoue 12 intentions jamais vues, 2 fois
chacune, sur le vrai modèle et la vraie recherche web
(`scripts/spikes/robustesse.json`, `docs/scenarios/robustesse.md`). Douze cas concrets, entre
autres : hésitation entre deux pays, voyage de noces sans destination, contrainte de mobilité,
budget déconnecté de la réalité, message en anglais, tentative d'injection. La liste complète est
dans `docs/scenarios/robustesse.md`.

Comparé à un essai antérieur du 2026-09-17, avant les correctifs de fidélité, de question suivante
et de fiches (décisions 9, 15, 17 et 18), les résultats progressent, mais pas sur toute la ligne.
La question à choix passe de 5 à 9 passages sur 24. La recherche web passe de 7 à 9 sur 24. Les
fiches du scénario « voyage de noces » restent à 0 sur 2 : ce cas ne progresse pas. Le tutoiement
reste à 0 sur 24 dans les deux mesures (`docs/scenarios/robustesse.md`). Ces correctifs profitent
donc à des scénarios sur lesquels ils n'ont pas été réglés, même si toutes les mesures ne bougent
pas.

Une seule intention reste à 0 sur toute la ligne : question hors sujet. C'est attendu, le prompt
système décline en une phrase sans produire ce qui est demandé ni chercher d'information
(`src/server/agent/system-prompt.ts`, section « Hors sujet »). Tentative d'injection reste presque
aussi silencieuse : le mot « brief » n'apparaît plus dans aucune réponse sur la mesure la plus
récente (`docs/scenarios/robustesse.md`). Contrainte de mobilité ne
déclenche ni fiche ni recherche web sur les deux passages. Elle provoque quand même une question à
choix sur l'un des deux, et de la narration des coulisses sur les deux. La raison précise n'est pas
certaine : la transcription complète est hors dépôt (`data/spikes/`), donc ce cas n'est pas
vérifiable depuis ce document. Deux passages restent une base encore plus étroite que les 3
passages du jeu de référence (section 3).

**Ce qui se note par code, déterministe.** Outils appelés (trace `tool_activity`), état du carnet
(`TravelBrief` sérialisé), `completeness.mandatoryOk` et `ready`, playbook chargé et son `origin`,
recherche web effectuée ou non. Ce sont des faits structurés, pas des jugements : pas besoin d'un
juge pour savoir si `note_destination` a été appelé ou si `ready` est vrai.

**Le ton, mesuré par du code aussi.** `src/server/agent/reply-metrics.ts` compte, dans chaque
réponse visible, les superlatifs publicitaires, la narration des coulisses (« je vais
enregistrer... »), le mot « brief » dit au voyageur, le tutoiement et le nombre de mots. Ce sont des
motifs de texte, pas une relecture humaine : un motif absent ne prouve pas un ton chaleureux, il
prouve seulement l'absence de ce défaut précis. Chaque motif vient d'un défaut vu sur de vraies
transcriptions (superlatif dans 6 sur 7, narration dans 2 sur 7, « brief » dans 1 sur 7, commentaire
du fichier). `scripts/scenarios.ts` applique ce compteur aux 48 passages de la mesure finale : les
totaux sont en section 6.

**Ce qui reste au LLM-juge.** La chaleur réelle du ton (pas seulement l'absence de superlatif), la
pertinence des recommandations de destination, et les nuances conservées fidèlement dans `nuances`
par rapport à la citation source. Biais connus d'un LLM-juge, à prendre au sérieux plutôt qu'à
mentionner pour la forme. Dans une expérience citée par Chip Huyen (*AI Engineering*, p.289),
Claude-v1 favorisait ses propres réponses, avec un taux de victoire supérieur de 25 points.
Plusieurs modèles montrent aussi un biais de première position. Deux limites concrètes ici : si le
juge est un modèle Claude jugeant une sortie Claude Haiku, le biais d'auto-préférence joue contre
la détection des défauts réels. Comment limiter : une grille explicite (des critères listés,
jamais « est-ce bon ? ») plutôt qu'un jugement global. Un juge d'un autre fournisseur de modèle que
celui évalué aide aussi. De même qu'une calibration humaine sur un échantillon (accord juge/humain
mesuré, pas supposé), avant de faire confiance au juge sur le reste du volume.
Lakshmanan (*Generative AI Design Patterns*, p.151) situe le LLM-as-judge sur des critères
subjectifs ou d'extraction de contenu. La nuance conservée fidèlement est exactement ce cas, pas un
critère factuel vérifiable par code.

**Simulateur de voyageur.** Un LLM qui joue un persona (indécis, pressé, contradictoire) pour
générer les tours suivants d'une conversation, au lieu de messages écrits à l'avance comme dans
`scripts/scenarios.ts`. Utile pour les scénarios qui dépendent de la question posée par
l'agent : le simulateur répondrait à la vraie question, pas à un texte prévu à l'avance. C'est
justement le point faible du jeu actuel, où le message du tour 2 est écrit sans savoir ce que
l'agent aura demandé. Limite : un simulateur qui joue un rôle porte sa propre idée du voyageur. Il
est souvent plus cohérent et plus clair qu'une vraie personne, qui parle dans le désordre, reste
vague et se contredit. Il mesure la capacité
de l'agent face à un voyageur simulé raisonnable, pas face au pire cas réel.

## 3. Non-déterminisme

Le modèle n'est pas déterministe. La section 1(c) l'illustre : `web_search` est bien appelé 3 fois
sur 3 sur les deux intentions qui l'exigent, mais un taux sur 3 essais reste une mesure fragile, pas
une garantie. `tests/integration/agent.test.ts` applique ce principe sur cette question précise. Au
lieu d'un succès isolé, il rejoue le message 3 fois et exige au moins 2 recherches sur 3
(`expect(searched).toBeGreaterThanOrEqual(2)`). Il fait de même pour la question à choix sur la
composition variable (au moins 1 sur 3).

`scripts/scenarios.ts` applique le même principe aux 16 scénarios de bout en bout. La variable
`SCENARIO_REPEAT` (recommandée à 3, 1,2928 $ mesuré pour les 48 passages) rejoue chaque scénario N
fois et calcule un taux par comportement. La mesure finale du 2026-09-25
(`docs/scenarios/README.md`) confirme le non-déterminisme au-delà des deux comportements déjà
couverts par `tests/integration/agent.test.ts`. Deux exemples concrets viennent de cette même
mesure. Le scénario « destination ouverte en famille » pose une question à choix après les fiches
sur 2 passages sur 3, mais pas sur le troisième. Le scénario « contradiction dans la durée »
déclenche une recherche web sur 1 passage sur 3. Rien dans l'intention, une durée qui ne colle pas
aux dates, n'appelle pourtant de vérification factuelle.

Le modèle n'est pas déterministe : sur deux mesures du même agent, un taux peut bouger d'un
passage sur trois. Le scénario contradiction, par exemple, atteignait 4/4 sur 3 passages sur 3 lors
d'une mesure précédente, contre 1 sur 3 sur celle-ci. Trois passages restent donc une base étroite
pour fixer un seuil statistique : un taux mesuré sur N=3 (2/3, 1/3...) a une marge d'erreur large. Cette ligne de base sert à détecter une régression brutale
(un taux qui tombe à 0/3 après une mise en production), pas à certifier une fréquence exacte. Le
dernier correctif de question suivante le confirme. Sans la consigne nommée après l'enregistrement
(décision 9), la question à choix n'était posée que 0 à 1 fois sur 3
(`src/server/agent/brief/next-question.ts`, commentaire de fonction). Un chiffre plus robuste (par
exemple 20 répétitions par scénario) reste à mesurer avant de fixer un seuil d'alerte au dixième de
point.

## 4. Régression

Quand relancer le jeu de scénarios avec mesure de taux (section 3), pas un simple passage unique :
changement de prompt système, changement de schéma d'outil, changement de modèle. Ce dernier cas
est déjà prévu dans la configuration : `ANTHROPIC_MODEL` surcharge le modèle par défaut
(`src/server/config.ts`, `DEFAULT_MODEL = "claude-haiku-4-5"`). Comparer Haiku 4.5 à un autre
modèle ne demande donc pas de changement de code, seulement de relancer `npm run scenarios` avec
la variable positionnée. Ligne de base actuelle pour ces taux : `docs/scenarios/README.md`, section
« Taux sur 3 passages par scénario » (2026-09-25), à comparer au nouveau run plutôt qu'à un seuil
deviné.

Critère go/no-go, à appliquer sur les taux mesurés plutôt que sur un passage unique :

- aucune régression sur la fidélité du carnet (1a) : le taux de statuts corrects par rapport aux
  citations sources ne doit pas baisser par rapport à la mesure de référence ;
- le taux de chargement `spontaneous` du playbook famille (1b) ne baisse pas ;
- le taux d'appel de `web_search` sur les intentions qui l'appellent (1c) ne baisse pas en dessous
  du seuil déjà mesuré (au moins 2 recherches sur 3 essais, `tests/integration/agent.test.ts`) ;
- le coût moyen par carnet validé (1e) ne dérive pas de plus d'un facteur fixé à l'avance
  (hypothèse : x1,5) sans justification. Par exemple, plus de recherches web serait une
  amélioration de 1c payée en coût : un compromis à documenter, pas à bloquer automatiquement.

Un no-go bloque la mise en production du changement. Il n'implique pas forcément un retour en
arrière en
production s'il n'y est pas encore.

## 5. En ligne

Signaux qui valident le produit, en lien avec `docs/observabilite.md` section 3. Taux de
conversations atteignant `ready`, part des carnets téléchargés qui servent vraiment à réserver
(le ~30 % supposé), taux de suite côté voyageur après téléchargement (le ~50 % supposé). Le signal
le plus fort n'est dans aucune trace de l'agent. C'est **le retour des voyageurs eux-mêmes sur la
qualité du carnet reçu**, en particulier sur les champs `inferred` au moment de la validation
(utile, non bloquant, mais potentiellement faux). C'est la vérité terrain : c'est le voyageur qui
décide d'utiliser ou non l'information de son carnet pour réserver. Aucune métrique interne à
l'agent ne peut la remplacer.

**Test A/B formulaire contre agent.** Comparer, sur trafic réel réparti aléatoirement, le taux
d'abandon en qualification et la part de carnets qui servent vraiment à réserver entre le parcours
formulaire existant et le parcours agent. C'est la seule façon de savoir si l'agent améliore
réellement la tension décrite en introduction du produit : abandon contre pauvreté du carnet
(`docs/produit.md`). Sinon, on ne fait que le supposer, parce que l'agent est plus agréable à
utiliser.

## 6. Ce qui existe déjà, honnêtement

Vérifié le 2026-09-17 (`npx vitest run`) : 22 fichiers de test, 206 tests, tous passés.
`vitest.config.ts` n'inclut que `src/**/*.test.ts(x)` : ces tests sont unitaires, sans appel
réseau. Il y en avait 95 la veille. La hausse vient des correctifs du jour : fidélité (décisions 17
et 18, puis 19), question suivante (décision 9), texte affiché pendant un tour à plusieurs appels
(décision 11). Quatre fichiers de test sont nouveaux. Ce nombre bouge à chaque correctif : relancer
`npx vitest run` plutôt que le recopier.

Mesure plus récente, vérifiée le 2026-09-21 (`npx vitest run`) : 33 fichiers de test, 395 tests,
tous passés. La hausse vient de plusieurs chantiers : la reprise d'une conversation gardée par le
navigateur, sa liste et sa suppression, le carnet PDF, et la fidélité de ses citations. S'y ajoute
un tour de correctifs après un audit adversarial. Ce sont les décisions 27 à 32 du
[registre des choix techniques](choix-techniques.md).

- `src/server/agent/context.test.ts` (18 tests) : le test de non-fuite du playbook. Aucune ligne du
  playbook famille dans la requête du premier tour, ni dans le prompt système. Après
  `load_playbook`, les instructions sont bien dans la requête (contrôle positif). Un second
  chargement ne recopie pas le texte une deuxième fois. Un faux bloc `<contexte_serveur>` écrit par
  le voyageur est neutralisé, en message libre comme en réponse à `ask_choice`. Le chargement est
  marqué `spontaneous` ou `nudged` selon que le modèle a lu le rappel serveur avant de charger le
  playbook. Sur les rappels de tour (`turnReminders`) : chercher avant d'affirmer, vouvoiement,
  question à choix. Une destination ouverte avec une période connue rappelle de proposer 2 ou 3
  fiches. Une destination déjà fixée n'ajoute pas ce rappel. Un lieu que le voyageur veut voir
  appelle toujours une fiche. Trois tests couvrent la consigne de question
  suivante : en début de tour, aucune question n'est nommée d'avance (cas réel Vietnam). Un carnet
  devenu complet ne reçoit plus de rappel de question à choix. Le rappel de ton (superlatifs,
  narration, mot « brief ») reste permanent.
- `src/server/agent/brief/completeness.test.ts` (15 tests) et `apply-patch.test.ts` (9 tests) : les
  seuils de complétude. Fenêtre de dates, écart de durée, écart de voyageurs, âge d'enfant
  manquant, valeur `inferred` ou `conflicting` qui empêche le carnet d'être complet. Les dates invalides ou déjà
  passées, avec le cas réel « juin 2026 » confirmé en septembre 2026. La validation du patch de
  carnet : un statut `unknown` est refusé pour ne pas effacer une information dite, une valeur ne
  change jamais après coup, et pas plus de 20 nuances gardées (`MAX_NUANCES`). Un test vérifie
  que les raisons affichées sous chaque case parlent au voyageur, sans jamais dire « le
  voyageur », « l'agent » ni « brief ».
- `src/server/agent/tools/brief-tools.test.ts` (16 tests, contre 6 avant ce round) : les outils
  `note_*` eux-mêmes. Un enfant sans âge déclenche le rappel serveur du playbook famille. Les
  schémas envoyés à l'API sont stricts (`additionalProperties: false`), la règle qui a motivé le
  passage d'un seul outil à schéma imbriqué à cinq outils plats (décision 7). `note_destination` en
  `conflicting` sans alternative est refusé. Dix tests couvrent les crochets de
  correction ajoutés à chaque outil `note_*` (décisions 17 et 18). Un nombre de voyageurs confirmé
  doit venir des mots du voyageur, cas réel du scénario famille. Une hésitation entre deux pays
  devient `vague` plutôt que contradictoire. Une année non dite glisse à l'année suivante sur une
  fenêtre déjà passée ; une année dite par le voyageur reste inchangée. La consigne de question
  suivante, calculée après l'enregistrement, couvre les voyageurs à confirmer, l'hésitation entre
  lieux, la composition encore floue et la destination ouverte avec une période connue.
- `src/server/agent/brief/fidelity.test.ts` (23 tests : 11 sur les voyageurs, 12 sur la durée) : `travellersDoubt`, testée
  sur des phrases réellement vues. Le scénario famille, où seul l'âge des enfants est dit. « Notre
  fils de 10 ans », qui ne dit rien des adultes. « On est trois », qui ne correspond qu'à deux
  personnes notées (un cas de l'essai de robustesse). Une durée ou un âge ne comptent jamais comme
  un nombre de voyageurs. Le cas nominal confirme bien : « on est 2 », « à deux », ou « we are two »
  en anglais. `durationDoubt` suit (décision 19). Les cas qui doivent douter : « une dizaine de
  jours » noté 9 nuits, puis 9 à 10 nuits (les deux formes vraiment produites par le modèle),
  « deux semaines à peu près » et « around 3 weeks ». Les cas qui doivent rester confirmés :
  « 3 semaines », « 10 jours », un nombre donné plus tard, et un budget approximatif qui ne parle
  pas de la durée.
- `src/server/agent/traveller-text.test.ts` (1 test, nouveau fichier) : `travellerText` ne garde que
  le message du voyageur et ses réponses aux blocs, jamais l'état du serveur ni les résultats
  d'outils.
- `src/server/agent/reply-metrics.test.ts` (5 tests, nouveau fichier) : les compteurs de ton.
  Superlatifs, narration des actions internes, mot « brief », nombre de mots. Le tutoiement est
  compté seulement sur des pronoms isolés, jamais sur un mot qui contient les mêmes lettres.
- `src/server/agent/tools/types.test.ts` (4 tests) : le garde-fou `findLeakedSyntax`. La fuite
  réellement observée sur Haiku 4.5 le 2026-09-16. Le garde-fou couvre aussi un accent écrit en
  syntaxe TeX (« Cor"{e du Sud », cas réel du 2026-09-17).
- `src/server/agent/text-guard.test.ts` (34 tests) : le filtre du texte visible. Il coupe un appel
  d'outil écrit en texte, même fragmenté en plusieurs morceaux de streaming, et nettoie le texte
  déjà stocké dans l'historique.
- `src/server/agent/tools/show-destination-cards.test.ts` (8 tests, contre 7 avant ce round) :
  `ungroundedCards`. Une fiche est ancrée si une requête cite le lieu ou le pays, accents et casse
  ignorés. Un nom composé (« Îles Canaries ») est ancré par un de ses mots significatifs, pas
  comparé en entier : le nom entier refusait à tort toutes les fiches du scénario famille. Un mot
  générique seul (« îles », « grande », « saint ») n'ancre jamais une fiche à lui seul. L'affichage
  partiel existait déjà : les fiches étayées s'affichent, les autres sont refusées avec la requête
  à lancer (cas réel Guadeloupe cherchée, Sri Lanka non). Un test couvre `repairCardsInput`, qui
  accepte une liste de fiches envoyée en texte JSON et retire les balises `<cite>` recopiées d'une
  recherche.
- `src/server/agent/destination-lookup.test.ts` (12 tests) : résolution Wikipédia des fiches
  destination. Un échec réseau ou une réponse trop lente ne fait pas planter le code. Un échec
  réseau passager n'est pas gardé en cache : l'appel suivant réessaie. Un premier résultat
  d'homonymie est ignoré au profit du second (cas réel : un quartier de tramway à Dijon nommé
  « Cap Vert » remontait en tête d'une recherche sur le pays Cap-Vert). Le repli sur `en.wikipedia`
  marche quand la version française ne donne rien, après le cas réel d'un lieu mal illustré
  (décision 12). Une recherche géolocalisée sans nom pertinent ne renvoie pas de photo hors sujet
  plutôt que rien (cas réel : des œufs de musée au centre géographique du Sénégal).
- `src/server/conversation.test.ts` (2 tests) : la file d'écriture par conversation garde l'ordre
  des lignes du JSONL malgré des écritures lancées sans être attendues. Chaque mise à jour du
  carnet écrit bien sa version et son statut `ready` dans la trace `brief_state`.
- `src/server/agent/loop.test.ts` (14 tests, contre 11 avant ce round) : le déroulé de la boucle.
  Sur un **client scripté** (des réponses écrites à l'avance, pas le comportement réel du modèle,
  celui-ci reste couvert par `tests/integration` et les scénarios). Un appel d'outil coupé par
  `max_tokens` reçoit un `tool_result` d'erreur, et le tour continue. Un `refusal` qui contient un
  appel d'outil laisse aussi un historique valide pour l'API. Un outil terminal et un `note_*` dans
  le même appel attendent, puis renvoient leurs deux résultats au tour suivant. Le dernier appel
  autorisé est forcé en texte. Le retour arrière sur une erreur d'API restaure aussi
  `nudgedPlaybooks`. Un libellé d'activité ne montre jamais une syntaxe d'outil fuitée par le
  modèle. Une entrée `cards` reçue en texte, observée sur Haiku, ne fait pas planter le tour. Trois
  cas forcent ou non le carnet selon le seuil. Un carnet devenu complet sans récapitulatif force
  l'appel à `present_brief`. Un carnet devenu complet où le modèle tente `ask_choice` voit cet
  appel refusé au profit du récapitulatif (cas réel Vietnam). Un carnet déjà complet avant le tour
  ne force aucun appel. Tout résultat d'outil en erreur reste déjà caché au voyageur, sans le dire.
  Trois tests couvrent ce comportement. Une entrée d'outil au JSON illisible renvoie une erreur au
  modèle sans casser le tour, un incident réel du 2026-09-17. Le texte des appels intermédiaires ne
  s'empile plus à l'écran (décision 11) ; un appel intermédiaire qui finit par une question à choix
  garde quand même son texte.
- `src/server/app.test.ts` (13 tests, contre 12 avant ce round) : les réponses du serveur. 409 si
  `conversation.busy` est déjà vrai (le verrou anti-concurrence est vérifié en le préréglant, pas
  en lançant deux requêtes en parallèle). 409 à la validation d'un carnet incomplet, sans rien marquer
  validé. 413 sur un corps trop gros, avant tout autre traitement. 429 au-delà de 40 tours. Une
  conversation inactive au-delà du délai est oubliée ; une conversation active reste disponible. Une
  validation qui échoue à l'écriture ne marque pas le carnet validé. Le dernier événement du flux SSE
  est toujours `turn_end`, même quand le tour finit tout de suite. Un test le vérifie.
  Le code 413 s'applique aussi à la création de conversation, une route déclarée avant la limite de taille. Avant
  ce correctif, elle acceptait un corps de 40 Ko sans le refuser.
- `tests/integration/agent.test.ts` (réglages à part, `npm run test:integration`, non comptée dans
  les 206 unitaires) : 4 tests, vrais appels à l'API. Famille détectée et playbook chargé. Carnet
  prêt sans question à choix sur infos complètes (deux tests structurels, un seul passage chacun).
  Deux tests à taux sur 3 essais : `web_search` appelé sur la demande de conseil Népal (au moins 2
  sur 3), question à choix posée sur la composition variable (au moins 1 sur 3). Ces deux derniers
  appliquent déjà le principe du taux, plutôt que de se contenter de le recommander.
- 16 scénarios rejoués (`scripts/scenarios.ts`, `docs/scenarios/`) : vrais appels. Le premier
  passage du 2026-09-25 donne une transcription complète par scénario, avec son coût
  (`docs/scenarios/README.md`, section « Premier passage »). Avec `SCENARIO_REPEAT=3`, le même
  script rejoue chaque scénario 3 fois. Il calcule un taux par comportement sur 48 passages réels
  (section « Taux sur 3 passages par scénario », 1,2928 $ mesuré pour la campagne). Voir section 3
  pour ce que ce taux permet, et ne permet pas encore, de conclure.
- 12 intentions jamais vues, rejouées 2 fois chacune (`scripts/spikes/robustesse.json`,
  `docs/scenarios/robustesse.md`) : voir section 2, « Essai de robustesse ». 24 passages réels,
  0,4393 $ mesuré, hors dépôt (`data/spikes/`).

**Limites mesurées sur les 48 passages de la mesure finale**, chiffres traçables dans
`docs/scenarios/README.md`. Réponse de plus de 80 mots dans 9 passages sur 48. Superlatif
publicitaire dans 27 sur 48. Narration des coulisses dans 19 sur 48, avec un compteur élargi le
2026-09-21, donc plus sévère qu'à la campagne précédente. Mot « brief » dit au voyageur dans 0 sur
48, tutoiement dans 0 sur 48 aussi. La question à choix reste le comportement le plus instable
d'un scénario à l'autre. Elle apparaît 19 fois sur 48 au total, de 0/3 pour plusieurs scénarios à
3/3 pour d'autres. On ne peut pas encore dire à quel taux s'attendre
pour un scénario donné (section 3). Ces chiffres ne remplacent pas une relecture : ils disent où
chercher en premier.

Ce qui manque, honnêtement :

- Un taux existe désormais sur les scénarios de bout en bout, et sur 12 intentions jamais vues en
  plus. N=3 (scénarios de référence) et N=2 (essai de robustesse) restent des bases trop étroites
  pour fixer un seuil statistique fiable. Un taux mesuré sur si peu d'essais a une marge d'erreur
  large. Il sert à détecter une régression brutale, pas à certifier une fréquence exacte.
  `tests/integration/agent.test.ts` applique le même principe à 2 comportements précis, toujours à
  3 essais chacun.
- Aucun LLM-juge en place : pas de grille de notation ni de calibration humaine (section 2).
- Aucun simulateur de voyageur multi-tours : les scénarios à plusieurs tours utilisent des messages
  écrits à l'avance, pas une réponse à ce que l'agent a réellement demandé (section 2).
- Aucune mesure en ligne : ni part de carnets utilisés pour réserver, ni test A/B, puisque le
  produit n'est pas déployé auprès de vrais voyageurs (section 5).
- L'essai de robustesse ne dit pas pourquoi la « contrainte de mobilité » n'a déclenché aucun outil
  sur les deux passages : sa transcription complète est hors dépôt (section 2).

## Sources

- Chip Huyen, *AI Engineering*, p.289 : dans l'expérience de Zheng et al. citée, Claude-v1 favorise
  ses propres réponses, avec un taux de victoire supérieur de 25 points. Plusieurs modèles montrent
  aussi un biais de première position. Cité en section 2 pour ne pas traiter le biais du LLM-juge
  comme une réserve de forme.
- Valliappa Lakshmanan, *Generative AI Design Patterns*, p.151 : situe le LLM-as-judge sur les
  métriques subjectives ou d'extraction de contenu. Cité en section 2 pour justifier pourquoi la
  fidélité des nuances relève du juge, et non du code, à la différence des statuts et valeurs
  structurées du carnet.
- Stephen Clear, *Claude AI Bible*, p.247 : décrit la boucle où le modèle décide à chaque tour, et
  où la condition d'arrêt est un réglage du code. Ce cadre explique pourquoi les scénarios notent
  des faits structurés (outils appelés, état du carnet), plutôt que de rejouer un script figé.
  C'est cohérent avec l'architecture décrite en section 2 de ce document.
- Nicole Koenigstein, *AI Agents: The Definitive Guide*, p.10 et p.24 : présente la machine à états
  comme le paradigme de base des frameworks d'agents (LangGraph, CrewAI). Cité pour situer, en
  creux, pourquoi le jeu de scénarios teste un agent qui décide librement, plutôt qu'un
  enchaînement d'étapes prévu à l'avance. Le test structurel (quel outil, quel état) reste
  pertinent malgré cette liberté.

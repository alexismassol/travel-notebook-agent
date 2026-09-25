# Glossaire

Les mots techniques du projet, expliqués simplement. Les autres documents renvoient ici au lieu de
réexpliquer chaque terme.

## Le modèle et ce qu'il reçoit

**Modèle (LLM).** Le programme d'IA qui lit du texte et écrit la suite. Ici, Claude Haiku 4.5
d'Anthropic : le plus rapide et le moins cher de la gamme.

**API Messages.** La porte d'entrée du modèle chez Anthropic. On lui envoie une requête (le prompt
système, la liste des outils, la conversation) et elle renvoie la réponse du modèle.

**Prompt système.** Le texte d'instructions permanent, envoyé à chaque requête avant la conversation :
qui est l'agent, sa mission, son ton. Ici : `src/server/agent/system-prompt.ts`.

**Token.** Un morceau de mot, l'unité que le modèle lit et écrit.
Anthropic facture les tokens : Haiku 4.5 coûte 1 $ par million de tokens lus et 5 $ par million écrits.

**Contexte.** Tout ce que le modèle voit dans une requête. Le **contexte permanent** est la partie
envoyée à chaque requête, dans toutes les conversations : prompt système et descriptions d'outils.

**`<contexte_serveur>`.** Un bloc ajouté par notre serveur à la fin de chaque message du voyageur :
la date, l'état du brief, et quelques rappels courts. Le voyageur ne peut pas l'imiter : ses
chevrons sont remplacés.

**Rappel de tour.** Une ligne du bloc `<contexte_serveur>` qui répète une règle au moment où le
modèle décide. Mesuré sur ce projet : une règle écrite une seule fois dans le prompt système était
souvent oubliée ; répétée juste avant la décision, elle est mieux suivie.

**Cache de prompt.** Anthropic garde en mémoire le début d'une requête déjà vue. Si la requête
suivante commence par les mêmes octets, ce début coûte 10 fois moins cher et se lit plus vite.
C'est pour ça que le prompt système ne contient ni date ni état : un octet qui change casse le cache.

## L'agent et ses outils

**Agent.** Un modèle qui ne se contente pas de répondre. Il choisit des actions : chercher sur le
web, poser une question, noter une information. Puis il décide de la suite selon le résultat.

**Outil (tool).** Une action que le modèle peut demander, décrite par un nom, une description qui
dit quand l'utiliser, et la forme des paramètres. Le modèle écrit « appelle `note_dates` avec
novembre », et c'est notre code qui exécute. Ce projet en a neuf, rangés dans
`src/server/agent/tools/`, plus la recherche web fournie par Anthropic.

**Appel d'outil et résultat (`tool_use`, `tool_result`).** Le modèle demande un outil (`tool_use`),
notre code renvoie ce qui s'est passé (`tool_result`). L'API refuse la conversation si un appel reste
sans résultat : c'est un invariant du projet.

**Boucle d'agent.** Le code qui enchaîne : envoyer la conversation au modèle, exécuter les outils
demandés, renvoyer les résultats, recommencer, jusqu'à ce que le modèle réponde au voyageur. Ici
écrite à la main, dans `src/server/agent/loop.ts`, avec au plus 6 appels au modèle par tour.

**Tour.** Un message du voyageur et tout ce que l'agent fait pour y répondre.

**Outil terminal.** Un outil qui arrête le tour parce qu'il attend le voyageur : la question à
choix (`ask_choice`) et le récapitulatif avant validation (`present_brief`).

**Recherche web.** Un outil fourni par Anthropic (`web_search`) : le modèle lance une recherche et
lit les pages trouvées. Chaque recherche ajoute environ 10 000 tokens à lire.

**Playbook.** Un jeu d'instructions spécialisées : voyage en famille, voyage pour une fête ou
voyage surprise. L'agent le charge avec l'outil `load_playbook` sans jamais l'annoncer au
voyageur, seulement quand la conversation en a besoin. Il n'est jamais dans le contexte permanent.

**Claude Agent SDK.** Une bibliothèque d'Anthropic qui fournit une boucle d'agent toute faite, celle
de Claude Code. Ce projet ne l'utilise pas (choix décision 1).

## Le brief de voyage

**Brief.** La structure interne qui garde les informations du voyage : destination, dates, durée,
voyageurs, plus le budget, le style, les envies et les phrases utiles du voyageur. Chaque case
porte son statut et sa citation. Dans l'interface, le voyageur voit son « carnet de voyage »,
jamais le mot « brief ».

**Case (slot).** Une information du brief, avec trois parties : la valeur, un statut, et les mots
exacts du voyageur qui la justifient.

**Contact.** Le prénom et l'adresse e-mail donnés au moment de valider et télécharger le carnet.
Ils ne font pas partie du brief : le brief porte ce que le voyageur a dit de son voyage. Le contact
voyage à côté, dans le fichier du carnet validé, et le modèle ne le voit jamais.

**Statut.** Ce qu'on sait de la valeur d'une case.
`unknown` : pas encore évoqué. `vague` : le voyageur est flou (« plutôt fin octobre »), on garde
un intervalle. `inferred` : l'agent l'a déduit, le voyageur doit confirmer. `confirmed` : dit
clairement. `conflicting` : deux réponses différentes, gardées toutes les deux.

**Seuil du carnet complet.** La règle, calculée par le code et jamais par le modèle, qui dit si le
carnet est complet : par exemple une fenêtre de départ de 45 jours au plus. Détail dans
`docs/produit.md`.

## La validation des données

**Schéma.** La description de la forme attendue d'une donnée : « une date au format AAAA-MM-JJ »,
« un nombre entier ». **Zod** est la bibliothèque qui vérifie qu'une donnée respecte son schéma.

**Mode strict.** Une option de l'API : la réponse du modèle respecte forcément le schéma de l'outil.
Anthropic transforme le schéma en « grammaire » la première fois, ce qui a pris jusqu'à 67 secondes
après un changement de schéma. D'où la **préchauffe** au démarrage du serveur.

**Garde-fou.** Un contrôle écrit en code : une erreur du modèle n'arrive jamais jusqu'au voyageur,
ni dans son carnet. Exemples : refuser une fiche sans recherche, ramener un nombre de voyageurs non
dit à « à confirmer ».

## L'interface et le réseau

**Streaming.** Le texte s'affiche mot par mot, dès que le modèle l'écrit, au lieu d'attendre la fin.

**SSE (Server-Sent Events).** La technique qui permet ce streaming : le serveur garde la connexion
ouverte et envoie des événements l'un après l'autre (texte, activité d'outil, question à choix).

**Latence.** Le temps d'attente du voyageur. On mesure le temps jusqu'au premier mot et la durée
totale du tour.

**Trace.** Une ligne écrite à chaque événement important d'un tour (appel d'outil, playbook chargé,
tokens consommés), dans un fichier JSONL par conversation (`data/traces/`, hors dépôt). C'est la
matière de l'observabilité.

## Tester et mesurer

**Test unitaire.** Un petit programme qui vérifie un morceau de code sans appeler le vrai modèle.
`npm run check` en lance plus d'une centaine en quelques secondes.

**Test d'intégration.** Un test qui appelle le vrai modèle avec la vraie clé. Plus lent, payant, et
non déterministe.

**Rouge, vert, sabotage.** On écrit d'abord un test qui échoue (rouge), puis le code qui le fait
passer (vert). Enfin on retire le correctif pour vérifier que le test retombe (sabotage) : sinon
le test ne prouvait rien.

**Non déterministe.** Le même message peut donner deux réponses différentes. C'est pourquoi on
mesure des **taux** (« fiche affichée 3 fois sur 3 passages ») plutôt qu'un seul essai.

**Scénario.** Une conversation écrite à l'avance, rejouée sur le vrai agent par
`npm run scenarios`. Chaque passage produit une transcription dans `docs/scenarios/`.

## L'atelier de développement

**Claude Code.** L'assistant de programmation qui a servi à construire le projet. Ce n'est pas le
chatbot du produit.

**Skill et agent Claude Code (`.claude/skills/`, `.claude/agents/`).** Des procédures et des
relecteurs écrits pour Claude Code pendant le développement : relire la doc, auditer la sécurité,
ajouter un playbook. Ils ne tournent jamais pendant une conversation avec un voyageur.

**Hook git.** Un script lancé automatiquement par git avant un commit. Ici, il bloque une clé d'API,
refuse un message de commit mal formé, et exige une doc à jour quand le cœur de l'agent change.

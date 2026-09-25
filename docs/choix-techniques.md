# Les choix techniques, expliqués

Ce document explique chaque décision de construction de l'agent : le problème de départ, ce qu'on
a fait, pourquoi c'est nécessaire pour que ça marche, et ce que ça coûte. Chaque décision porte un
numéro (« décision 15 ») pour que les autres documents puissent y renvoyer. Les mots techniques sont
définis dans le [glossaire](glossaire.md).

Les chiffres viennent de vrais appels au modèle : tests d'intégration, scénarios rejoués
(`docs/scenarios/`), ou essais ciblés pendant la construction, dont les traces brutes restent hors
dépôt. Quand un chiffre est une hypothèse, c'est écrit.

## La version courte

| N° | Le choix | Pourquoi, en une phrase |
|---|---|---|
| 0 | TypeScript partout, Node et Hono côté serveur, React côté interface | Un seul langage : le compilateur vérifie que serveur et interface parlent la même langue |
| 1 | Écrire la boucle de l'agent nous-mêmes | Savoir au mot près ce que le modèle reçoit, pour prouver que les instructions famille n'y sont pas |
| 2 | Un seul agent qui choisit ses actions | Un formulaire déguisé perdrait les voyageurs indécis |
| 3 | Chaque information du brief a un statut | « Cet été » ne doit ni disparaître ni devenir une fausse date |
| 4 | Le code décide si le brief peut partir | Une règle produit doit être la même pour tous et se tester |
| 5 | Les instructions famille se chargent à la demande | Le cadrage l'exclut du prompt système, et 100 % des conversations le paieraient |
| 6 | Claude Haiku 4.5 | Plusieurs milliers de conversations par mois : le coût compte |
| 7 | Des outils simples, vérifiés par le code | Haiku abîmait les entrées complexes |
| 8 | La recherche web d'Anthropic | Une seule clé, rien à héberger |
| 9 | Des rappels courts à chaque tour | Haiku oubliait des règles écrites une seule fois |
| 10 | Un début de requête qui ne change jamais | Le cache divise le coût de cette partie par dix |
| 11 | Afficher quelque chose pendant l'attente | Un tour peut approcher la minute |
| 12 | Le serveur trouve la photo, pas le modèle | Une adresse d'image inventée ne s'affiche pas |
| 13 | Un flux d'événements entre serveur et interface | Le texte s'affiche mot par mot, les questions deviennent des boutons |
| 14 | Stockage minimal, en mémoire et en fichiers | Rien dans le cadrage ne demande une base de données |
| 15 | Pas de fiche destination sans recherche web | Haiku a affirmé une saison sans vérifier |
| 16 | Le code propose le carnet quand il est complet | Haiku posait une question de trop au cas le plus simple |
| 17 | Un nombre de voyageurs « confirmé » doit avoir été dit | Le risque clé : un brief faux qui a l'air sûr |
| 18 | Une année non dite ne tombe jamais dans le passé | Haiku notait « juin 2026 » en septembre 2026 |
| 19 | Une durée dite « à peu près » n'est jamais confirmée | « Une dizaine de jours » devenait « 9 nuits, confirmé » |
| 20 | La ville de départ est un champ du brief | « On part de Paris » n'arrivait jamais dans le carnet |
| 21 | Une certitude par information, pas une par appel | « Le budget on verra » était enregistré « confirmé » |
| 22 | Réparer un échappement écrit par le modèle | Le voyageur a lu « croisi\u00e8re » à l'écran |
| 23 | Le voyageur a le droit de poser une question au lieu de choisir | Une question sans réponse fait reposer la même liste |
| 24 | Une contrainte s'écrit comme une phrase, pas comme un mot-clé | « pas de parler espagnol » n'aide personne à préparer le voyage |
| 25 | Demander une fois la ville de départ et le budget, sans bloquer le carnet | Deux informations utiles qui ne valent pas un mur |
| 26 | Un enfant ne s'invente pas à partir d'un lien de parenté | « moi et mes parents » donnait un enfant dans le carnet |
| 27 | La question posée au voyageur passe avant le récapitulatif | Un récapitulatif forcé coupait la parole à l'agent |
| 28 | Le tiret qui relie deux morceaux de phrase ne sort pas de l'agent | Ça se lit comme une machine, pas comme une personne |
| 29 | Le navigateur garde le fil, le serveur garde le modèle | Une actualisation perdait toute la conversation |
| 30 | Le coût se lit, pas seulement le total | Sans la part du cache, aucun réglage n'est possible |
| 31 | L'aller-retour est une hypothèse dite, pas un champ de plus | Le carnet partait sur une hypothèse muette |
| 32 | La citation suit la valeur, pas le dernier message | « Vous avez dit : tout » sous une contrainte de bébé |
| 33 | Ce qui est déjà suffisant ne se redemande pas | L'agent reposait une question déjà répondue |
| 34 | La langue du voyageur se rappelle à chaque tour | Un message en anglais recevait une réponse en français |
| 35 | Le modèle relit son propre écart, pas un rappel de plus | Un prompt qui grossit perd ses autres consignes |
| 36 | Après une recherche, on montre des lieux, on ne questionne pas | L'agent cherchait, puis reposait une question |
| 37 | Le contact se demande à l'envoi, et jamais par l'agent | La demande partait sans personne à qui répondre |
| 38 | Un voyage posé sur une fête n'est pas un voyage comme un autre | Marrakech proposé pour Halloween |
| 39 | Un antislash dans une valeur du carnet, c'est une valeur refusée | Le voyageur a lu « belles d\teau9orations » |
| 40 | Une citation ne justifie que ce dont elle parle | Une envie citait un budget dit dix messages plus tard |
| 41 | Un carnet validé ne se représente pas | Le tour de remerciement rouvrait le récapitulatif |
| 42 | Un troisième playbook pour le voyage surprise | « Surprenez-moi » ne veut pas dire répondre à un questionnaire |
| 43 | Une fiche de pays montre une vraie photo du pays | « Albanie » montrait un sabre de musée, « Jordanie » une avenue de Paris |
| 44 | Une phrase de coulisses ne s'affiche pas | « Je vais noter votre projet » dans 19 passages sur 48 |

## Qui a décidé

| Décision | Tranchée par | Sur quelle base |
|---|---|---|
| Décision 6 : Haiku 4.5 | Auteur | Coût à plusieurs milliers de conversations par mois |
| Décision 8 : Recherche web Anthropic | Auteur | Une seule clé, un seul fournisseur |
| Décision 4 : Seuil du carnet complet (45 jours, 7 nuits, ±1 voyageur, âges) | Auteur, sur proposition | Hypothèse produit : le carnet suffit sans redemander |
| Direction visuelle « Carnet de terrain » | Auteur, sur proposition | Sobre, éditorial, vert forêt et crème |
| Décision 1 : Boucle maison plutôt que Claude Agent SDK | Proposé, confirmé par l'auteur | Contrainte famille prouvable sur la requête exacte |
| Décision 5 : Chargement par outil | Imposé par le cadrage, forme proposée | Voir décision 5 |
| Décisions 7, 9, 11, 15 à 22 | Imposés par la mesure | Chaque section cite la mesure |

---

## Décision 0 : les technologies choisies : TypeScript partout, Node et Hono, React et Vite

**Le problème.** Il faut un serveur qui parle au modèle et une interface de chat, construits vite,
lisibles par une équipe, et qui ne se contredisent pas. Le choix des technologies est libre, et
chaque choix doit se justifier.

**Ce qu'on a fait.**
- **TypeScript** (JavaScript avec des types vérifiés avant l'exécution), en mode strict, pour tout
  le code.
- **Node.js** pour faire tourner le serveur, avec **Hono**, un petit framework web : il reçoit les
  requêtes du navigateur et envoie le flux d'événements.
- **React** pour l'interface, avec **Vite** pour la compiler et la servir pendant le développement.
- **Zod** pour décrire la forme des données une seule fois.

**Pourquoi c'est nécessaire.**
- **Un seul langage, des contrats partagés.** Le brief et les événements du flux sont décrits une
  fois dans `src/shared/`, et le serveur comme l'interface les importent. Si un champ change d'un
  côté, la compilation échoue de l'autre, avant que l'écran casse devant un voyageur.
- **Une seule description pour trois usages.** Un schéma Zod vérifie l'entrée d'un outil, produit
  le schéma JSON envoyé au modèle (`z.toJSONSchema`), et donne son type au code. Rien ne peut
  diverger.
- **Le SDK officiel d'Anthropic existe en TypeScript**, avec le streaming des réponses.
- **React colle au besoin** : chaque bloc produit par un outil (question à choix, fiches,
  récapitulatif) devient un composant.
- **TypeScript, Node et React sont des outils très répandus** : une équipe web relit ce code
  sans changer d'univers.

**Les autres options.**
- Python (FastAPI) côté serveur : très bon pour l'IA, mais deux langages et des contrats à
  dupliquer entre serveur et interface.
- Next.js : il mélange serveur et interface dans un même cadre, plus lourd qu'utile pour une API et
  un chat.
- Express au lieu de Hono : il marche aussi. Hono est plus léger et fournit le flux d'événements
  (`streamSSE`) et la limite de taille des requêtes (`bodyLimit`) prêts à l'emploi.
- CopilotKit pour le chat : une abstraction de plus sur la partie qui compte ici,
  l'interaction.

**Ce que ça coûte.** Il faut compiler (Vite pour l'interface, `tsx` pour les scripts), et un
serveur Node seul ne partage rien entre plusieurs instances (décision 14).

**Où le voir.** `package.json`, `src/shared/`, `src/server/app.ts`, `src/web/`.

## Décision 1 : La boucle de l'agent est écrite à la main

**Le problème.** À chaque tour, l'agent choisit : noter, chercher, poser une question, montrer une
fiche. La règle la plus surveillée du cadrage porte sur ce que le modèle voit : les instructions
famille ne doivent jamais être dans le contexte permanent. Il faut pouvoir le prouver.

**Ce qu'on a fait.** Une boucle écrite à la main sur l'API Messages, 493 lignes. Elle construit chaque requête
nous-mêmes, envoie la conversation, exécute les outils demandés, puis recommence.

**Pourquoi c'est nécessaire.** La requête est construite par une fonction à nous. Un test peut
donc lire chaque mot envoyé et vérifier qu'aucune ligne du playbook n'y est. Nos outils
arrêtent aussi le tour pour attendre un clic du voyageur, ce qu'une boucle toute faite ne prévoit
pas.

**Les autres options.**
- Claude Agent SDK : il apporte la boucle de Claude Code, avec des outils fichiers et terminal à
  neutraliser, et il ajoute son propre contexte, plus dur à prouver.
- Tool Runner du SDK : moins de code, mais pas d'outil qui met le tour en pause en attendant le
  voyageur.

**Ce que ça coûte.** On écrit et on maintient la boucle, la reprise après une recherche longue
(`pause_turn`) et le retour arrière en cas d'erreur.

**Où le voir.** `src/server/agent/loop.ts`, `src/server/agent/context.ts`.

## Décision 2 : Un seul agent qui choisit, des règles tenues par le code

**Le problème.** Le voyageur indécis ne suit pas un ordre. Il peut donner sa destination, puis
poser une question sur le visa, puis changer d'avis sur la durée.

**Ce qu'on a fait.** Un seul agent, qui choisit ses outils à chaque tour. Les règles qui ne doivent
jamais casser sont dans le code :
- au plus 6 appels au modèle par tour, le dernier obligé de répondre en texte ;
- un outil qui attend le voyageur arrête le tour ;
- après lui, seuls les outils qui notent le brief s'exécutent ;
- si l'API échoue, la conversation revient à l'état d'avant le tour.

**Les autres options.**
- Machine à états : l'ordre des questions est figé, c'est un formulaire déguisé.
- Routeur d'intention puis gestionnaires : deux appels par tour, et une intention imprévue tombe
  dans le mauvais tiroir.

**Ce que ça coûte.** La qualité des choix de l'agent ne se lit pas dans le code. Elle se mesure en
rejouant des scénarios (`docs/evaluation.md`).

**Où le voir.** `loop.ts`.

## Décision 3 : Chaque information du brief a une valeur, un statut et une citation

**Le problème.** « Plutôt cet été, on est flexibles » n'est pas une date. Si on force une date, on
invente. Si on l'ignore, on perd une information utile au voyageur.

**Ce qu'on a fait.** Chaque case du brief garde trois choses : la valeur, un statut
(`unknown`, `vague`, `inferred`, `confirmed`, `conflicting`, voir le glossaire), et les mots exacts
du voyageur qui la justifient. Chaque changement augmente un numéro de version et s'ajoute à un
historique.

**Les autres options.**
- Des champs vides ou remplis : « cet été » devient une fausse date ou disparaît.
- Un texte libre résumé à la fin : impossible de calculer ce qui manque.

**Ce que ça coûte.** Le schéma est plus riche, et le modèle peut se tromper de statut. C'est le
premier point à évaluer (`docs/evaluation.md`), et la décision 17 en corrige un cas en code.

**Où le voir.** `src/shared/brief.ts`, `src/server/agent/brief/apply-patch.ts`.

## Décision 4 : Le code décide si le carnet est complet

**Le problème.** Présenter le carnet trop tôt, c'est un carnet trop flou pour organiser le
voyage. Le présenter trop tard, c'est un voyageur qui abandonne. Ce seuil est une décision produit.

**Ce qu'on a fait.** Le modèle voit le résultat, il ne le décide pas. Le carnet est complet
quand :
- la destination tient dans une seule zone (un pays ou une région) ;
- la fenêtre de départ fait 45 jours au plus, et n'est pas entièrement passée ;
- la durée est connue à 7 nuits près, et tient dans la fenêtre de dates ;
- le nombre de voyageurs est connu à une personne près, avec l'âge de chaque enfant ;
- aucune information obligatoire n'est « déduite » ou « à trancher ».

`present_brief` et la route de validation revérifient ce seuil.

**Pourquoi c'est nécessaire.** Une règle écrite dans le prompt changerait d'une conversation à
l'autre. En code, elle est identique pour tous, testée, et réglable sans toucher au prompt.

**Ce que ça coûte.** Les seuils sont des hypothèses à valider avec des voyageurs (`docs/produit.md`).
Ils peuvent coûter une question de plus (« plutôt juin, juillet ou août ? »).

**Où le voir.** `src/server/agent/brief/completeness.ts` et ses 15 tests.

## Décision 5 : Les instructions famille se chargent seulement quand l'agent en a besoin

**Le problème.** Le cadrage interdit de mettre les instructions « Voyage en Famille » dans le prompt
système. Et la plupart des conversations ne concernent pas une famille.

**Ce qu'on a fait.** Un outil `load_playbook(name, reason)`. Dans le contexte permanent, il n'y a
que la description de l'outil, qui dit quand l'appeler. Le texte des instructions est lu sur le
disque au moment de l'appel. Chaque chargement laisse une trace : le tour, la raison donnée par
l'agent, et l'origine (`spontaneous` si l'agent l'a décidé seul, `nudged` s'il a été relancé).

Filet de sécurité : si le brief contient des enfants et que rien n'est chargé, le résultat des
outils de notes rappelle à l'agent de charger les instructions. Charger deux fois ne fait rien de
plus.

**Les autres options.**
- Détecter des mots-clés puis injecter le texte : ce n'est plus l'agent qui décide, et « avec les
  petits » passe à travers.
- Un skill du Claude Agent SDK : lié au choix décision 1.
- Un message système en cours de conversation : non disponible sur Haiku 4.5.

**Ce que ça coûte.** Le modèle peut oublier d'appeler l'outil : d'où le filet de sécurité.

**La preuve.** `context.test.ts` vérifie qu'aucune ligne du playbook n'est dans la requête du tour 1
ni dans le prompt système. Un contrôle positif montre que le test voit bien le texte une fois
chargé. Un sabotage (une ligne injectée dans le prompt système) fait échouer 2 tests. Un test
d'intégration réel vérifie le chargement spontané.

**Où le voir.** `src/server/agent/playbooks/`, `src/server/agent/tools/load-playbook.ts`.

## Décision 6 : Claude Haiku 4.5 pour parler au voyageur

**Le problème.** Plusieurs milliers de conversations par mois (ordre de grandeur supposé,
pas une mesure).

**Ce qu'on a fait.** Haiku 4.5 par défaut : 1 $ par million de tokens lus et 5 $ par million
écrits, contre 2 $ et 10 $ pour Sonnet 5. La variable `ANTHROPIC_MODEL` permet de comparer.

**Ce que ça coûte, mesuré.** Haiku a demandé plus de garde-fous que prévu : entrées d'outil abîmées
(décision 7), règles oubliées (décision 9), valeurs confirmées sans avoir été dites (décision 17, décision 18). Chaque garde-fou
est tracé et testé.

**Où le voir.** `src/server/config.ts`.

## Décision 7 : Des outils de notes simples, vérifiés par le code

**Le problème.** Le modèle doit remplir le brief sans le casser.

**Ce qui a été essayé, dans l'ordre (2026-09-16).**
1. Un seul outil `update_brief` avec des objets imbriqués. Haiku a écrit de la syntaxe d'outil à
   l'intérieur des valeurs (`"interests": "\n<parameter name=\"status\">inferred"`). Tout a été
   rejeté, et le brief est resté vide après 8 appels.
2. Le mode strict sur ce schéma : refusé par l'API (17 paramètres à type multiple pour une limite
   de 16), puis « compiled grammar is too large ».
3. **Cinq outils simples `note_*`** en mode strict : acceptés. La première requête après le
   changement a pris 67,5 s (préparation de la grammaire), la suivante 6 s.

**Ce qu'on a fait.** Cinq outils à paramètres simples, et trois contrôles en code avant que
quoi que ce soit n'entre dans le brief :
- `findLeakedSyntax` refuse une valeur qui contient de la syntaxe d'outil. Vu même en mode strict :
  `"zone": "</antml parameter>..."`.
- Le même contrôle refuse un accent écrit en code au lieu du caractère. Vu le 2026-09-17 :
  `"Cor\"{e du Sud"` pour « Corée du Sud », qui serait parti tel quel dans le carnet.
- Une entrée au JSON illisible ne fait plus échouer le tour (incident réel du 2026-09-17). Le SDK
  décode l'entrée à la fin du bloc, et l'erreur arrêtait tout. L'agent reçoit maintenant une erreur
  d'outil et réécrit son appel. **Un premier correctif ne marchait pas** : le SDK enveloppe
  l'erreur dans une `AnthropicError`, et le test utilisait un faux client qui ne le faisait pas. La
  relecture du serveur l'a montré. Le test passe maintenant par le vrai SDK, avec un faux réseau
  qui rejoue un flux cassé (`loop.sdk.test.ts`).

**Ce que ça coûte.** 9 outils au lieu de 5 dans chaque requête : quelques centaines de tokens, lus
en cache. C'est un retour sur une option écartée dans le plan initial, imposé par la mesure.

**Où le voir.** `tools/brief-tools.ts`, `tools/schema.ts`, `tools/types.ts`, `loop.ts`, et leurs
tests.

## Décision 8 : La recherche web est celle d'Anthropic

**Le problème.** Saisons, visas, mousson : l'agent doit vérifier avant d'affirmer.

**Ce qu'on a fait.** L'outil `web_search` fourni par Anthropic, 2 recherches au plus par appel au
modèle. Le prompt système dit que les résultats sont des données, jamais des instructions.

**Les autres options.** Tavily, Linkup ou Exa : une offre gratuite et plus de contrôle sur les
résultats, mais une clé et un outil de plus.

**Ce que ça coûte.** Chaque recherche est facturée, et ajoute environ 10 000 tokens à lire
(mesuré). Haiku 4.5 n'a que la version de base de l'outil.

**Où le voir.** `tools/index.ts`.

## Décision 9 : Des rappels courts à chaque tour

**Le problème.** Avec les règles écrites seulement dans le prompt système, Haiku a affirmé
« juillet, c'est la mousson » sans chercher, et a reposé des questions sur un brief déjà complet.

**Ce qu'on a fait.** Quelques lignes répétées à la fin du message de chaque tour, dans le bloc
`<contexte_serveur>` :
- une saison, un climat, une formalité ou un vaccin s'affirment seulement après une recherche ;
- le ton : vouvoiement, 80 mots au plus, pas de superlatif, pas de texte avant les outils, jamais
  le mot « brief » ;
- un lieu que le voyageur veut voir donne une fiche.

Puis une seule ligne selon l'état du brief :
- brief complet : proposer l'envoi ;
- destination ouverte et période connue : chercher, puis proposer 2 ou 3 fiches ;
- sinon : enregistrer d'abord ce que dit le message, puis poser la question qui manque avec une
  question à choix.

**Une erreur mesurée, corrigée.** Une première version nommait la question à poser dès le début du
tour (« il manque qui part »). Ce rappel est calculé avant que l'agent enregistre le message. Au
cas le plus simple, « Vietnam, 3 semaines en novembre, on est 2 », l'agent a demandé « Qui part en
voyage ? », et la demande n'est partie qu'une fois sur 3 (contre 3 sur 3 avant). La question
précise est donc passée dans le résultat des outils de notes, calculé après l'enregistrement
(`brief/next-question.ts`). Remesuré sur 3 passages : envoyé 3 sur 3.

**Un second défaut, trouvé par l'audit du contexte.** L'agent note souvent plusieurs informations
dans le même appel. Calculée après chaque note, la consigne pouvait dire « il manque la période »
puis, une note plus loin, « le brief est complet ». Elle est maintenant calculée une seule fois,
après toutes les notes de l'appel (`briefGuidance`, `loop.ts`). Test rouge, vert, sabotage.

**Pourquoi c'est nécessaire.** Mesuré sur 3 passages par scénario :
- fiche pour « c'est où Zanzibar ? » : 1 sur 3 avant les rappels d'état, 3 sur 3 après ;
- question à choix : 2 passages sur 21 avec une règle générale, 8 sur 21 avec la question nommée
  après l'enregistrement. Sur « on sera 4 ou 6 personnes » : 0 sur 3 avant, 3 sur 3 après.

**Ce que ça coûte.** Des tokens répétés à chaque tour, et le prompt système n'est plus la seule
source des règles.

**Où le voir.** `context.ts` (`turnReminders`, `pendingAnswer`), `brief/next-question.ts`.

## Décision 10 : Le début de la requête ne change jamais

**Le problème.** Chaque tour renvoie tout : outils, prompt système, conversation. Sans cache, on
paie tout à chaque appel.

**Ce qu'on a fait.** Les outils et le prompt système sont figés : ni date ni identifiant. La
conversation s'allonge sans jamais être réécrite. Ce qui change à chaque tour va à la fin. Le cache
est activé sur toute la requête.

**Pourquoi c'est nécessaire.** Le cache ne marche que si le début de la requête est identique à
l'octet près. Haiku 4.5 ne met en cache qu'au-delà de 4 096 tokens : il sert dès le deuxième appel
d'un tour.

**Mesuré.** Scénario famille, tour 1 de la mesure finale : 17 460 tokens lus en cache, 1 943 écrits
en cache, et 10 tokens payés plein tarif (`docs/scenarios/1-destination-ouverte-famille.md:22`).

## Décision 11 : Faire patienter le voyageur

**Le problème.** Un tour qui enchaîne recherches et fiches peut approcher la minute. Un voyageur qui
attend devant un écran vide abandonne.

**Ce qu'on a fait.**

| Levier | Où |
|---|---|
| Le texte s'affiche mot par mot | `loop.ts`, événement `text_delta` |
| L'action en cours s'affiche (« Recherche : ... ») | événement `tool_activity` |
| Le temps jusqu'au premier mot est mesuré à chaque tour | `firstTextMs` dans `TurnUsage` |
| La grammaire des outils est préparée au démarrage | `agent/warm-up.ts` |
| Délai de 120 s par appel à l'API, une seule reprise | `server/index.ts` |
| Au plus 6 appels et 2 recherches par appel | `config.ts` |

**Ce que le voyageur lit pendant un tour à plusieurs appels.** Vu à l'écran le 2026-09-17 : chaque
appel intermédiaire ajoutait sa phrase d'annonce (« Voici trois destinations idéales », « Laissez-moi
vous montrer trois destinations »), empilées avant la vraie réponse. Maintenant, le texte du premier
appel s'affiche en direct : il rassure pendant l'attente. Le texte des appels suivants attend la fin
de l'appel. Il ne s'affiche pas s'il annonce des fiches destination, puisque les fiches montrent
ce qu'il allait dire. Dans tous les autres cas, il s'affiche. Une première version cachait tout
appel qui ne faisait que noter : la relecture du serveur a montré qu'une vraie réponse (« un visa
n'est pas nécessaire ») pouvait alors disparaître. Le modèle garde son texte dans l'historique :
seul l'affichage change (`loop.ts`, 3 tests, sabotage vérifié).

**Mesuré** sur la mesure finale du 2026-09-17 (21 conversations de référence, traces réelles) :
- premier texte visible : 1,2 s en médiane, 3,3 s pour les 10 % les plus lents ;
- tour complet : 9,5 s en médiane, 27,9 s pour les 10 % les plus lents ;
- tour le plus long : 50,3 s (recommandation responsable, recherches et fiches dans le même tour).
  Sur la mesure précédente (même agent, seul l'affichage du texte a changé depuis), il était de
  25,4 s. Avant ce round : 59,4 s.

**Une règle essayée puis retirée.** « Pas de texte avant les outils » supprimait des phrases comme
« je vais enregistrer vos informations ». Mais le premier texte arrivait à 5,5 s en médiane et 20,2 s
pour les plus lents (39 conversations), et un tour famille a duré 98,9 s. Un écran vide pendant 20
secondes coûte plus qu'une phrase maladroite. La règle est devenue : une phrase courte pour le
voyageur avant les outils, jamais pour raconter les coulisses.

**Ce que ça coûte.** Rien n'accélère le modèle lui-même. La vraie limite reste le nombre d'appels
et de recherches par tour.

## Décision 12 : Le modèle écrit la fiche, le serveur trouve la photo

**Le problème.** Une adresse d'image écrite par un modèle peut ne pas exister, ou montrer autre
chose que le lieu.

**Ce qu'on a fait.** Le serveur cherche la page Wikipédia du lieu (français, puis anglais) et
écarte les homonymes. Pour la photo, dans l'ordre :
1. l'image de la page, si c'est une photo ;
2. sinon une photo géolocalisée près du lieu, seulement si son nom de fichier cite le lieu ou un
   paysage, sans animaux ni intérieurs ;
3. sinon une recherche de photo qui exige le nom du lieu ;
4. sinon aucune photo, et un fond de courbes de niveau.

**Pourquoi c'est nécessaire.** Ces règles viennent de ce qui s'est affiché à l'écran. On a vu une
tortue pour Zanzibar, des poignards en vitrine pour Oman, des œufs de musée pour le Sénégal, un
tramway de Dijon pour le Cap-Vert. Mieux vaut pas de photo qu'une photo hors sujet.

**Mesuré.** Avant le filtre sur les noms de fichier : 0 faux lieu sur 12 lieux regardés. Aucune
mesure chiffrée depuis son ajout. Limite connue : une image satellite dont le nom ne le dit pas
(Lanzarote).

**Où le voir.** `agent/destination-lookup.ts` et ses 16 tests. Délai de 4 s, jamais d'exception.

**Mesure du 2026-09-17.** Sur 10 fiches réellement produites, 5 avaient une photo. La cause tient
au nom écrit par le modèle : « Maroc (région d'Agadir) » ou « Zanzibar (Tanzanie) » ne sont pas des
titres d'article. Le serveur cherche maintenant le lieu sans la parenthèse (`placeQuery`). Corrigé
et testé, mais le taux de photos n'a pas encore été remesuré sur une série complète.

## Décision 13 : Un flux d'événements entre le serveur et l'interface

**Le problème.** Le voyageur doit voir le texte arriver, et cliquer sur une question à choix.

**Ce qu'on a fait.** Un tour est une requête au serveur dont la réponse est un flux d'événements typés
(SSE, `src/shared/events.ts`). Les outils d'affichage deviennent des blocs : question à choix,
fiches, récapitulatif. La réponse du voyageur à un bloc devient le résultat de l'outil au tour
suivant. L'API exige un résultat par appel d'outil, et l'agent reçoit la réponse là où il
l'attend. Si la réponse ne correspond pas au bloc en attente, le serveur la refuse (400) avant de
toucher à la conversation. Depuis l'audit de sécurité du 2026-09-17, une réponse à une question à
choix doit aussi être une des options proposées. Une requête écrite hors de l'interface ne peut plus
faire passer un texte libre pour un clic (`context.ts`, test et sabotage).

## Décision 14 : Un stockage minimal

Les conversations vivent en mémoire. Les traces et les carnets validés sont des fichiers dans
`data/`, que git ignore, puis téléchargés par le navigateur : **rien n'est transmis à un tiers**.
Un redémarrage du serveur perd les conversations en cours. Le navigateur, lui, garde le fil
visible (décision 29).

## Décision 15 : Pas de fiche destination sans recherche web

**Le problème.** Haiku a affiché une fiche Zanzibar (« septembre, saison sèche ») sans aucune
recherche, malgré le prompt et la description de l'outil.

**Ce qu'on a fait.** `show_destination_cards` refuse une fiche si aucune recherche web de la
conversation ne cite le lieu ou son pays. La comparaison se fait mot à mot : un mot de 4 lettres ou
plus, hors mots génériques (« îles », « grande », « saint »), accents et majuscules ignorés. Une
recherche faite un tour plus tôt compte. Le refus donne à l'agent la recherche à lancer.

Deux ajustements vus à l'écran :
- les fiches appuyées par une recherche s'affichent, seules les autres sont refusées ;
- un refus d'outil ne se raconte pas au voyageur. L'agent écrivait « le serveur préfère une
  recherche plus ciblée ».

**Un bug trouvé et corrigé.** La première version comparait le nom entier du lieu. « Îles
Canaries » n'apparaît jamais tel quel dans « Canaries climat février » : les fiches du scénario
famille étaient toutes refusées à tort. Vérifié après correction : fiches famille 3 sur 3.

**Ce que ça coûte.** Une recherche (environ 10 000 tokens) avant la première fiche d'un lieu. Un
lieu cherché seulement via sa région (« Caraïbes ») reste refusé à tort.

**La preuve.** 7 tests, dont le cas réel des Canaries, l'affichage partiel et le refus qui propose
une recherche. Correctif du nom composé testé rouge puis vert, sabotage vérifié.

**Où le voir.** `tools/show-destination-cards.ts` (`ungroundedCards`, `placeWords`).

## Décision 16 : Le code propose le carnet quand il devient complet

**Le problème.** Sur le cas de référence, « Vietnam, 3 semaines en novembre, on est 2, ~4000 € », le
brief était complet mais l'agent posait une question de plus au lieu de proposer le carnet.

**Ce qu'on a fait.** Deux garde-fous, déclenchés seulement si le brief devient complet pendant le
tour (s'il l'était déjà, le voyageur a peut-être demandé une modification) :
1. une question à choix est refusée au profit du récapitulatif. Mesuré : un brief Vietnam complet
   a reçu une question sur les envies au lieu d'être présenté ;
2. si l'agent termine son tour sans récapitulatif, le serveur l'oblige à appeler `present_brief`.

**Ce que ça coûte.** Un appel de plus dans ce cas. L'agent ne peut pas choisir de retarder le carnet.

**La preuve.** 2 tests, un par garde-fou. Taux sur 3 passages : carnet Vietnam validé 3 fois sur 3
(`docs/scenarios/README.md`).

**Où le voir.** `loop.ts` (`readyAtStart`, `forceToolNext`), `context.ts`.

**Complété le 2026-09-17.** Sur les 6 carnets réellement validés, le style, les envies et les
contraintes étaient vides 6 fois sur 6 : le voyageur repartait avec un squelette. Quand ces trois
champs sont vides, la consigne demande maintenant d'inviter le voyageur à dire ses envies, **dans
la même phrase que le récapitulatif**. Le seuil du carnet complet ne bouge pas, et le carnet reste
présentable dès le premier tour : vérifié sur le vrai modèle après le changement. Le récapitulatif
affiche la même invitation.

## Décision 17 : Un nombre de voyageurs « confirmé » doit avoir été dit

**Le problème.** C'est le risque clé du produit : un brief faux qui a l'air sûr (`docs/produit.md`).
Mesuré sur les transcriptions réelles :
- scénario famille : le voyageur donne l'âge des enfants, jamais le nombre d'adultes, et le brief
  affiche « 2 adultes et 2 enfants » confirmé ;
- « Je voudrais emmener ma mère de 78 ans, on est trois » : « 2 adultes » confirmé ;
- « en famille avec notre fils de 10 ans » : « 2 adultes » confirmé.

La consigne dans la description de l'outil ne suffisait pas.

**Ce qu'on a fait.** Avant d'enregistrer un nombre de voyageurs « confirmé », le code relit tout ce
que le voyageur a écrit ou cliqué (`traveller-text.ts`). Il ne relit ni l'état du serveur ni le texte
de l'agent. La valeur reste confirmée si :
- les adultes et les enfants notés font bien le total ;
- et le voyageur a dit un nombre de personnes (« on est 2 », « on sera quatre », « 4 adultes »)
  ou un mot qui désigne les adultes (« ma femme », « en couple »).

Sinon, elle est enregistrée « à confirmer », et l'agent reçoit la consigne de la faire valider
avec une question à choix. Un nombre suivi d'une unité ne compte pas : « 3 semaines », « 7 ans ».
Le verbe « a » non plus : « notre fille a 3 chats » ne dit pas que 3 personnes partent, alors que
« à 3 » le dit (relecture du serveur).
Si la même valeur était déjà « à confirmer » à un tour précédent, la confirmation est acceptée :
le voyageur a eu la question sous les yeux.

**Une erreur évitée en route.** Écrire la même règle dans le prompt système a rendu l'agent trop
prudent : « on est 2 » n'était plus enregistré, et l'agent demandait « 2 adultes ou des
enfants ? ». La règle reste donc en code seulement, là où elle ne dépend pas de l'humeur du modèle.

**Ce que ça coûte.** Une question de plus quand le voyageur n'a pas dit combien d'adultes partent.
Le contrôle est volontairement étroit : il ne juge que le nombre de voyageurs, où le défaut est
mesuré et où la preuve se lit dans le texte.

**La preuve.** 11 tests sur les phrases réelles (`brief/fidelity.test.ts`), 3 tests sur l'outil, 1
sur la lecture des mots du voyageur. Chaque partie du correctif sabotée fait tomber son test.

**Où le voir.** `brief/fidelity.ts`, `traveller-text.ts`, `tools/brief-tools.ts`.

## Décision 18 : Une année non dite ne tombe jamais dans le passé

**Le problème.** Le 2026-09-17, « On part 3 semaines en Grèce en juin » a été noté juin 2026, une
période déjà passée. Le seuil du carnet complet le bloquait à juste titre, mais la conversation restait
coincée. La consigne « année non dite : prochaine occurrence » était déjà dans la description de
l'outil.

**Ce qu'on a fait.** Si la période notée est entièrement passée et que le voyageur n'a écrit aucune
année, le code la décale à l'année suivante et le dit à l'agent. Une année écrite par le voyageur
n'est jamais changée, même passée : l'agent doit alors la faire préciser. Un montant n'est pas pris
pour une année : « 2027 € » ou « 2027 dollars » ne bloque pas le décalage (relecture du serveur).

**Un oubli trouvé par la relecture des briefs.** Sur la mesure finale, le modèle a écrit le libellé
« juin 2026 ». Le code décalait bien les dates en 2027, mais gardait le libellé, et c'est le libellé
que lit le voyageur dans son carnet (`docs/scenarios/relecture.md`, scénario 6). Le libellé suit
maintenant l'année décalée.

**La preuve.** 3 tests : le cas réel de la Grèce, le libellé « juin 2026 » qui devient « juin 2027 »,
et une année dite qui reste telle quelle. Chaque
partie sabotée fait tomber son test. Sur le scénario Grèce : brief complet 0 fois sur 3 juste avant
ce correctif, puis 3 et 2 fois sur 3 sur les deux mesures suivantes (le modèle n'est pas
déterministe).

**Où le voir.** `tools/brief-tools.ts` (`nextYear`, `SAID_YEAR`).

## Décision 19 : Une durée dite « à peu près » n'est jamais confirmée

**Le problème.** Même risque que la décision 17, sur une autre information. La relecture des sept
conversations réelles (`docs/scenarios/relecture.md`) l'a trouvé : le voyageur dit « une dizaine de
jours », le brief affiche « durée confirmée : 9 à 9 nuits ». Le carnet affiche un nombre exact là où le
voyageur a donné un ordre de grandeur, et personne ne le lui a demandé.

**Ce qu'on a fait.** Avant d'enregistrer une durée « confirmée », le code relit ce que le voyageur a
écrit ou cliqué. Il y cherche deux choses collées à une unité de temps. Une formule approximative
d'abord : « une dizaine de jours », « deux semaines à peu près », « around 3 weeks ». Une borne
ensuite : « 10 jours max », « pas plus de deux semaines ». Dans les deux cas, si aucun nombre de
nuits n'est dit par ailleurs, la durée passe en « à préciser ». La borne applique en code une règle
qui n'existait que dans le prompt système : « pas plus de 10 jours » n'est pas « 8 à 9 nuits ».

Deux détails qui comptent :
- **Les bornes ne changent pas**, seulement le statut. Inventer « 8 à 12 nuits » à la place du
  modèle serait une deuxième invention.
- **« À préciser » n'empêche pas le carnet d'être complet** (`brief/completeness.ts`) : c'est le
  voyageur qui est approximatif, pas l'agent qui devine. La conversation ne se bloque pas ; le brief dit juste la
  vérité. Si le voyageur donne ensuite un nombre (« 9 nuits », y compris en cliquant une réponse),
  la durée redevient confirmée.

**Ce que la mesure a appris pendant l'écriture.** Le premier correctif ne corrigeait que la valeur
unique (« 9 à 9 nuits »), le cas trouvé par la relecture. Rejoué sur le vrai modèle le 2026-09-17,
Haiku a écrit cette fois « 9 à 10 nuits », toujours confirmé : la même phrase produit deux formes.
La règle porte donc sur le statut seul, quelle que soit la fourchette.

**La preuve.** 12 tests sur la durée (`brief/fidelity.test.ts`), 3 sur l'outil
(`tools/brief-tools.test.ts`), sabotage vérifié des deux côtés. Puis un vrai passage : avant,
`duration [confirmed] 9 à 10 nuits` ; après, `duration [vague] 9 à 10 nuits`, avec la même
conversation : trois fiches, une question à choix, aucune question en plus (0,034 $). Les sept
scénarios de référence rejoués ensuite ne montrent aucun autre écart : « 3 semaines » et
« plutôt 10 jours » restent confirmés, seul le scénario famille passe en « à préciser ».

**Où le voir.** `brief/fidelity.ts` (`durationDoubt`), `tools/brief-tools.ts` (revue de
`note_duration`).

## Décision 20 : La ville de départ est un champ du brief

**Le problème.** Trouvé par la relecture des conversations réelles : le voyageur écrit « on part de
Paris », et cette phrase ne laisse aucune trace dans le brief. Le carnet ne dit pas d'où partent
les gens. Or le vol pèse lourd dans le budget du voyage. Un aller-retour depuis Paris,
Lyon ou Bruxelles ne coûte pas la même chose. Et certaines destinations n'ont de vol direct que
depuis certaines villes.

**Ce qu'on a fait.** Un champ `departure` dans le groupe « utile » du brief, rempli par
`note_preferences`. Il n'est pas obligatoire : le carnet peut être complet sans lui, comme le budget.

**Pourquoi un champ et pas une « nuance ».** Les nuances sont des phrases libres, lues par un
humain. Un champ est lu par une machine : on peut comparer les carnets entre eux, ou estimer un
budget de vol. Et le voyageur le voit dans son carnet, donc il peut le corriger.

**Le détail qui évite un bug connu.** Le paramètre est du texte, et un paramètre texte qui doit
rester vide est exactement celui où Haiku écrivait de la syntaxe d'outil (décision 7). Il porte
donc une valeur réservée, « non dite », comme la zone de destination.

**Ce que la mesure a donné.** Rejoué sur le scénario où le défaut avait été trouvé, le brief note
`departure [confirmed] Paris`. Les fiches destination raisonnent depuis Paris : « vol direct de 3h
depuis Paris », « 2h30 de vol depuis Paris ». L'information servait déjà à la conversation ; elle
n'apparaissait simplement jamais dans le carnet.

**La preuve.** 2 tests sur l'outil : la ville est enregistrée, la valeur réservée n'enregistre
rien. Sabotage vérifié. Le compilateur a signalé tout seul l'endroit oublié dans l'interface. Le
brief est décrit une fois dans `src/shared/` : un champ ajouté au serveur casse la compilation de
l'interface tant qu'elle ne l'affiche pas (décision 0). Capture d'écran relue, sur ordinateur et
sur téléphone, sans débordement.

**Où le voir.** `src/shared/brief.ts`, `brief/apply-patch.ts`, `tools/brief-tools.ts`,
`src/web/lib/briefFormat.tsx`.

## Décision 21 : Une certitude par information, pas une par appel

**Le problème.** `note_preferences` enregistre plusieurs choses d'un coup : ville de départ, budget,
style, envies, contraintes. Il n'avait qu'un seul statut pour tout l'appel. Une phrase réelle mélange
pourtant les certitudes : « je pars de Paris c'est sûr, le budget on verra, environ 4000 par
personne ». Prouvé par un appel réel pendant la relecture du serveur : le budget était enregistré
« confirmé » alors que le voyageur venait de dire « on verra ». C'est l'invariant numéro cinq du
projet qui tombait : une valeur incertaine affichée comme certaine.

**Ce qu'on a fait.** Deux paramètres de plus : `budget_status` et `departure_status`. Chacune de ces
deux informations porte sa propre certitude. Le statut général reste pour le style, les envies, les
contraintes et les nuances, où le mélange est rare.

**Et « à trancher » ?** Ce statut demande de donner l'autre valeur. Le schéma de cet outil n'a pas
de place pour elle, donc l'appel entier était rejeté, en boucle. Le code ramène maintenant « à
trancher » à « à préciser » et demande au modèle de mettre la seconde valeur dans les nuances, mot
pour mot.

**La preuve.** 2 tests sur l'outil, sabotage vérifié des deux côtés : le statut du budget qui suit
celui du départ, et l'appel « à trancher » qui n'échoue plus.

**Où le voir.** `tools/brief-tools.ts` (`PreferencesInput`, revue de `note_preferences`).

## Décision 22 : Réparer un échappement écrit en toutes lettres par le modèle

**Le problème.** Mesuré le 2026-09-17, capture à l'appui : le voyageur a lu « croisi\u00e8re » au
milieu d'une phrase. Le modèle avait écrit l'échappement JSON de l'accent au lieu de l'accent. Le
garde-fou du texte visible ne connaissait que la syntaxe d'appel d'outil, pas ce motif-là.

**Ce qu'on a fait.** Le filtre du texte visible décode ces séquences et rend « croisière ». Il tient
compte du streaming : l'échappement peut arriver coupé en deux fragments, donc la fin d'un fragment
qui ressemble à un début d'échappement est retenue jusqu'au suivant. Un échappement de caractère de
contrôle n'est pas décodé : invisible, il cacherait le défaut au lieu de le montrer.

**Pourquoi réparer plutôt que couper.** Couper la phrase punirait le voyageur pour une faute du
modèle. Le reste du texte est bon ; c'est l'accent qui manque.

**La preuve.** 5 tests (`text-guard.test.ts`), dont un échappement coupé en deux fragments et un
caractère de contrôle laissé tel quel. Sabotage vérifié.

**Où le voir.** `text-guard.ts` (`repairEscapes`).

## Décision 23 : Le voyageur a le droit de poser une question au lieu de choisir

**Le problème.** Une liste de choix suppose que le voyageur sait répondre. Celui qui hésite, lui,
veut demander : « c'est quoi la différence entre juin et juillet ? », « vous conseillez quoi ? ».
Le serveur acceptait déjà son texte, mais le résultat d'outil disait seulement qu'il n'avait pas
cliqué. Le modèle reposait alors la même liste, et la conversation redevenait un formulaire.

**Les options.** Bloquer la zone d'écriture pendant une question, ce qui aurait fermé la porte.
Laisser le modèle deviner, ce qu'il fait mal. Ou lui dire quoi faire de cette question.

**Ce qu'on a fait.** Le résultat d'outil porte maintenant une consigne quand le voyageur écrit
pendant une question à choix. S'il demande quelque chose, l'agent répond d'abord avec du contenu,
cherche au besoin, montre des fiches, puis revient à ce qui manque. S'il a simplement tapé sa
réponse, la consigne se réduit à ne pas reposer la même liste. Rien de tout cela n'est ajouté
avant l'envoi du carnet. Côté écran, trois endroits le disent : une ligne sous les options, le
champ libre, et la zone d'écriture.

**Ce que ça coûte.** Une trentaine de mots dans un résultat d'outil, à chaque fois que le voyageur
écrit pendant une question. La consigne reste une intention : c'est le modèle qui décide d'y obéir.

**La preuve.** Cinq tests dans `context.test.ts`, chacun saboté puis rétabli, plus deux tests
d'écran dans `ChoiceBlock.test.tsx`. Mesure réelle : scénario 8, quatre tours où le voyageur ne
répond jamais directement, deux recherches web, cinq fiches destination, carnet à 3 obligatoires
sur 4 ([`scenarios/8-le-voyageur-interroge.md`](scenarios/8-le-voyageur-interroge.md)).

**Le garde-fou.** Les guillemets français tapés par le voyageur sont remplacés par des
guillemets droits (`neutralizeServerTags`). Sans ça, un `»` refermait la citation et la suite de
son texte se lisait comme une consigne du serveur.

**Où le voir.** `context.ts` (`pendingAnswer`, `asksSomething`, `neutralizeServerTags`),
`ChoiceBlock.tsx`, `App.tsx` (`composerPlaceholder`).

## Décision 24 : Une contrainte s'écrit comme une phrase, pas comme un mot-clé

**Le problème.** Le voyageur dit « je ne parle pas espagnol ». Le carnet affichait « pas de parler
espagnol », du français cassé, lu tel quel dans le carnet. Vu en usage réel le 2026-09-18.

**La cause.** La description de l'outil donnait deux exemples, « mobilité réduite » et « pas de vol
de nuit ». Le modèle a suivi le second motif et fabriqué « pas de » suivi d'un verbe.

**Ce qu'on a fait.** La description demande une phrase qu'on peut lire à voix haute, donne
« ne parle pas espagnol » en premier exemple, et interdit explicitement la forme fautive.

**Ce que ça ne garantit pas.** C'est une consigne, pas un contrôle : le modèle reste libre de mal
écrire. Un garde-fou en code supposerait de réécrire ses mots, ce qui abîmerait les cas corrects.
On préfère une consigne précise et une mesure, plutôt qu'une réécriture aveugle.

**Où le voir.** `tools/brief-tools.ts`, paramètre `constraints` de `note_preferences`.

## Décision 25 : Demander une fois la ville de départ et le budget, sans bloquer le carnet

**Le problème.** Un brief peut être complet sur les quatre essentiels et rester difficile à
utiliser. Sans ville de départ, impossible d'estimer le prix du trajet. Sans ordre de budget, un
projet infaisable est présenté quand même, et le cadrage retrouve là une partie des 30 % de
projets notés qui restent trop flous pour organiser le voyage. Vu en usage réel : un voyage solo
en Espagne prêt à présenter, sans départ ni budget.

**Ce qui a été écarté.** Les rendre obligatoires. Le seuil du carnet complet reste les quatre
essentiels (décision 4) : ajouter deux champs, c'est rallonger le parcours et perdre des
voyageurs, exactement ce que le produit veut éviter.

**Ce qu'on a fait.** Quand le brief devient complet, le serveur demande en une seule question
courte la ville de départ et une fourchette de budget. La question ne porte que sur ce qui manque
encore. Si le voyageur ne sait pas ou ne veut pas répondre, le tour suivant propose le carnet sans
insister.

**Une réponse partielle ne clôt pas la question.** Un vrai carnet a été présenté sans ville de
départ : l'agent avait demandé les deux, le voyageur avait répondu « tout », ce qui ne répond
qu'au budget. La question était comptée comme posée, donc le départ n'est jamais revenu, et le
voyageur aurait dû y revenir après coup. Le serveur compte maintenant les questions
réellement parties, et redemande ce qui manque encore, **deux fois au plus**.

**Pourquoi deux et pas plus.** Au-delà, ce n'est plus une question, c'est de l'insistance, et
c'est le formulaire déguisé que le produit refuse.

**Mesuré après correction, sur quatre conversations réelles.** La question ne part plus qu'une
fois. Le tour du message qui donne tout passe de trois appels à deux, et de 11,7 à 7,7 secondes.
La narration des coulisses tombe de quatre occurrences à deux : un rappel de ton ne tient jamais
à 100 %, c'est pour ça que les règles qui comptent sont en code.

**Corrigé une deuxième fois, après mesure.** La première version refusait le récapitulatif tant
que la question n'était pas posée. Le tableau de taux l'a sanctionnée : le scénario « informations
déjà complètes » passait de 3 envois sur 3 à 0 sur 3. Le voyageur déjà décidé devait répondre à
une question de plus avant de voir son projet, exactement ce que le cadrage reproche au formulaire
actuel.

**Ce qu'on fait maintenant.** Le récapitulatif part, et il dit ce qui manque. Une phrase dans le
message : il manque la ville de départ pour chiffrer le trajet, vous pouvez l'indiquer ou envoyer
sans. Une seule chose à lire, et le voyageur décidé n'est pas retenu.

**La preuve.** Six tests sur `briefGuidance`, sabotage vérifié, plus le test de la boucle qui
exige une seule consigne par appel.

**Mesuré sur le vrai modèle.** Carnet complété en deux tours, sans départ ni budget : l'agent a
répondu « d'où partez-vous, et avez-vous une idée de budget pour cette semaine ? », en une seule
question, au moment où le carnet devenait complet (2026-09-19, 0,036 $).

**Où le voir.** `tools/brief-tools.ts` (`briefGuidance`), `conversation.ts` (`usefulAsked`).

## Décision 26 : Un enfant ne s'invente pas à partir d'un lien de parenté

**Le problème, vu en usage réel le 2026-09-20.** Le voyageur écrit « moi et mes parents ». Le
modèle enregistre « 2 adultes et 1 enfant » : il a compté celui qui parle comme l'enfant de ses
parents. Le serveur voit un enfant dans le carnet, rappelle de charger les conseils famille, et
l'agent demande « quel âge a votre enfant ? ». Une seule erreur de lecture, trois conséquences.

**Ce qu'on a fait.** Un contrôle de fidélité de plus, `childrenDoubt`. Des enfants notés alors
qu'aucun mot d'enfant ni aucun âge n'apparaît dans ses phrases ? Les voyageurs passent en « à
confirmer », avec la raison. « Parents » n'est pas un mot d'enfant : un adulte qui part avec ses
parents reste un adulte.

**Le rappel serveur suit la même règle.** Il ne pousse plus les conseils famille quand l'enfant
n'apparaît nulle part dans les mots du voyageur. Quand celui-ci n'a encore rien écrit, on ne peut
pas juger, et le filet reprend son rôle.

**Ce qu'on ne fait pas.** Réécrire ses nombres. Le carnet n'invente pas et ne corrige pas : il
baisse la certitude et fait poser la question, comme pour les autres contrôles (décisions 17, 19).

**La preuve.** 5 tests sur `childrenDoubt`, 2 sur la chaîne complète (carnet en « à confirmer »,
rappel famille silencieux, et rappel rétabli sur « avec nos deux enfants »). Sabotage vérifié.

**Où le voir.** `brief/fidelity.ts` (`childrenDoubt`), `tools/brief-tools.ts` (revue de
`note_travellers` et rappel serveur).

## Décision 27 : La question posée au voyageur passe avant le récapitulatif

**Le problème, mesuré le 2026-09-20 en usage réel.** Au dixième tour, le carnet devient complet
pendant que l'agent demande le budget. Le serveur force alors le récapitulatif dans le même tour,
comme le prévoit la décision 4. Le voyageur lit sa question, attend une minute, puis voit
« vous voilà prêt ». Trace du tour : 3 appels au modèle et 61 secondes, contre 6 secondes au tour
précédent. Il a décrit ça comme une boucle.

**Ce qu'on a fait.** La relance ne part plus quand la réponse de l'agent se termine par une
question. Le voyageur répond d'abord. Le rappel du contexte serveur, présent à chaque tour,
reproposera l'envoi au tour suivant.

**Ce qu'on ne perd pas.** Le filet de la décision 4 reste entier quand l'agent termine sans rien
demander. La conversation retient si le récapitulatif a déjà été proposé une fois, plutôt que de
regarder si le brief était complet en entrant dans le tour. Sans cette mémoire, une seule question
posée au mauvais moment désactivait le filet pour toute la suite de la conversation.

**Où se cherche la question.** Dans la fin du message, pas sur son tout dernier caractère.
« Combien de temps ? (pour affiner la saison) » est une question, même si elle ne finit pas par
le point d'interrogation.

**La preuve.** Un test sur la question qui bloque la relance, un test sur la relance qui part
toujours sans question. Sabotage vérifié : le correctif retiré, le premier test tombe.

**Où le voir.** `agent/loop.ts` (`finitParUneQuestion`).

## Décision 28 : Le tiret qui relie deux morceaux de phrase ne sort pas de l'agent

**Le problème, signalé le 2026-09-20.** « Excellent choix - la Martinique est parfaite ». Ce tiret
qui remplace une virgule est une signature de texte écrit par une machine. L'auteur l'a vu
sur une vraie réponse.

**Pourquoi le prompt ne suffit pas.** La consigne y est, mais le modèle la perd à mesure que la
conversation grandit. Une règle vérifiable par une machine doit l'être : le texte visible passe
par un filtre, au même endroit que la réparation des accents.

**La règle.** Un tiret précédé d'un espace, entre deux mots, devient une virgule. Après une
ponctuation, il disparaît sans en ajouter une seconde. Le tiret des mots composés, des listes à
puces et des intervalles chiffrés n'a pas d'espace avant : il est gardé.

**Une exception, trouvée en audit.** Entre deux chiffres, un tiret même espacé sépare une plage.
« Comptez du 15 - 20 juillet » deviendrait « du 15, 20 juillet », ce qui ne veut plus rien dire.
Le tiret reste dès que les deux côtés sont des chiffres.

**Où elle s'applique.** Le texte en flux, le texte gardé dans l'historique, les questions à choix,
les fiches de destination et le récapitulatif. Le filtre tient compte du découpage en flux : un
tiret coupé entre deux fragments est corrigé quand même.

**La ponctuation double ne part plus seule à la ligne.** Vu à l'écran : « ou vous êtes ouvert à
tout » puis « ? » seul sur la ligne suivante. En français une espace précède « ? ! ; : », et une
espace ordinaire autorise la coupure. Elle devient une espace fine insécable, qui est la bonne
typographie et interdit la coupure. Le carnet PDF la ramène à une espace ordinaire, faute de
police qui la connaisse.

**Le HTML écrit par le modèle non plus.** Vu à l'écran : « Je vous propose <strong>mai</strong> ».
Le rendu markdown n'accepte pas le HTML brut, pour ne pas ouvrir une porte d'injection, donc la
balise s'affichait en toutes lettres. Le gras et l'italique sont traduits en markdown, le reste
est retiré sans emporter le texte. Une balise coupée entre deux fragments du flux est retenue le
temps de la voir en entier.

**Le mot « brief » ne sort plus à l'écran.** C'est notre vocabulaire, pas celui du voyageur, et
le prompt l'interdit depuis le début. Il est quand même apparu en usage réel, dans « Parfait, le
brief est complet ». Le filtre le remplace par « projet », majuscule comprise, et laisse
« briefing » tranquille.

**Ce qu'il ne retient pas.** Une première version gardait le dernier caractère de chaque
fragment, au cas où un tiret arrive derrière. Une phrase finie s'est affichée sans son point
d'interrogation, qui est reparu seul un paragraphe plus bas, après la ligne d'activité de
l'outil. Le filtre ne retient plus que ce qui peut encore devenir un tiret : un espace ou un
tiret qui traîne en fin de fragment. Le caractère déjà montré sert de contexte au remplacement.

**Ce qu'on ne touche pas.** Les phrases du voyageur citées dans le carnet. Ce sont ses mots.

**La preuve.** 9 tests, dont le cas signalé, le mot composé, la liste à puces, l'intervalle
chiffré et le tiret coupé en deux fragments. Sabotage vérifié.

**Où le voir.** `agent/text-guard.ts` (`adoucirTirets`, `nettoyerTexteVisible`).

## Décision 29 : Le navigateur garde le fil, le serveur garde le modèle

**Le problème.** Actualiser la page effaçait tout. Le serveur avait encore la conversation, mais
aucune route ne permettait de la retrouver, et le navigateur ne gardait rien. Pour une
démonstration, perdre dix tours sur un rafraîchissement est cher payé.

**Le partage des rôles.** Le navigateur garde ce qu'il affiche : le fil, le carnet, les cumuls.
Le serveur garde ce que seul lui possède : l'historique envoyé au modèle. Aucun des deux ne peut
faire le travail de l'autre. Le fil gardé ne prouve donc jamais qu'une conversation peut
continuer, il prouve seulement qu'on peut la relire.

**Ce que fait le chargement de la page.** Il lit le fil gardé, puis demande au serveur s'il
connaît encore cette conversation. Trois réponses possibles. Le serveur l'a : on reprend, y
compris une question à choix restée en attente. Le serveur l'a oubliée, après six heures ou un
redémarrage : le fil se relit, les boutons sont éteints, un bandeau le dit et propose de repartir.
Rien de gardé : conversation neuve, comme avant.

**La lecture ne prolonge pas la vie de la conversation.** Le délai de six heures repart à chaque
message, pas à chaque regard. Une page laissée ouverte et rafraîchie toutes les heures garderait
sinon une conversation en mémoire indéfiniment, ce qui est exactement ce que le délai empêche.

**Ce qui ne doit jamais casser le démarrage.** Navigation privée, données de site bloquées, quota
plein, écriture tronquée, format d'une version précédente : dans tous ces cas on repart d'une
conversation neuve, sans erreur affichée. Le format porte son numéro de version dans le nom de la
clé et dans les données, et une donnée qui ne correspond pas est effacée plutôt que devinée.

**L'échéance affichée vient du serveur**, jamais d'un calcul du navigateur, et elle arrive à la
fin de chaque tour avec le nombre de tours encore possibles.

**Cinq conversations sont gardées, pas une.** Le bandeau « Mes conversations » les liste avec
leur première phrase, leur date, et leur état. En ouvrir une passe par le même chemin que le
chargement de la page : le fil se réaffiche toujours, le serveur décide si elle peut continuer.

**Ce que le serveur tranche à la reprise.** S'il dit que le carnet est déjà validé, le
récapitulatif se rouvre comme téléchargé, même si le navigateur a été coupé avant d'en recevoir la
confirmation. Sans ça, le bouton « Télécharger mon carnet de voyage » se représente sur un carnet déjà validé.

**Changer de conversation coupe le tour en cours.** Le flux d'un tour ne sait pas qu'on a changé
de fil : ses événements s'écriraient dans la conversation qu'on vient d'ouvrir.

**Une erreur ne survit pas à une reprise.** Son bouton « Réessayer » ne peut plus aboutir, le
tour qui l'a produite est fini. Elle sort du fil, comme la ligne d'activité d'outil.

**Un message refusé faute de conversation ne se réessaie pas non plus.** L'interface bascule en
lecture seule : le serveur ne retrouvera jamais cette conversation.

**La preuve.** 11 tests sur le stockage, 4 sur la route de lecture, 1 sur la reprise du fil. Trois
passages mesurés dans un vrai navigateur : premier chargement écrit 1 736 octets ; rechargement,
aucune conversation créée, le message repris s'affiche ; identifiant inconnu du serveur, bandeau
affiché, saisie fermée, débordement horizontal nul.

**Où le voir.** `web/lib/persistance.ts`, `web/App.tsx` (démarrage), `server/conversation.ts`
(`peek`, `expiresAtOf`), `server/app.ts` (lecture d'une conversation).

## Décision 30 : Le coût se lit, pas seulement le total

**Le problème.** Le panneau technique montrait un coût par tour et un cumul. Ça dit combien on
dépense, pas pourquoi, ni ce qui le tient.

**Ce qu'on affiche en plus.** La part de l'entrée relue depuis le cache, ce que le cache a évité
de payer, et le nombre de tours déjà faits face à ceux qui restent. Les trois viennent de chiffres
déjà mesurés à chaque tour, aucun appel de plus.

**Pourquoi ces trois-là.** Le cache est le premier levier de coût de cette application : le
préfixe figé et l'historique repartent à chaque appel. Sur une conversation réelle de dix tours,
615 474 jetons d'entrée, dont 537 189 relus depuis le cache, soit 87 %. Coût réel 0,205 $, contre
0,669 $ pour le même trafic sans cache. Le taux de cache est aussi un signal de régression : un
prompt système qui bouge d'un octet le fait tomber d'un coup.

**Une honnêteté à garder.** Le coût sans cache est une comparaison, donc un calcul. Ce qui est
mesuré, ce sont les jetons et le prix payé. Écrire dans le cache coûte un quart de plus que
l'entrée normale : l'économie affichée est nette de ce surcoût.

**Où le voir.** `shared/pricing.ts` (`cacheHitRate`, `cacheSavings`), `web/App.tsx`.

## Décision 31 : L'aller-retour est une hypothèse dite, pas un champ de plus

**La question.** Faut-il demander au voyageur s'il part en aller simple ou en aller-retour, et
depuis quelle ville il arrive ? Le prix du trajet en dépend, l'information compte.

**Ce qu'on a écarté, et pourquoi.** Deux champs de plus dans le carnet. Le cadrage fixe quatre
informations obligatoires : destination, dates, durée, voyageurs. Ajouter des cases rallonge le
parcours, et c'est exactement ce que le produit combat. La ville d'arrivée, elle, reste au
voyageur de la choisir en comparant les vols, pas à l'agent de la deviner.

**Ce qu'on a fait.** L'aller-retour est l'hypothèse la plus courante quand rien ne la contredit.
Le carnet la dit en une ligne, sous l'essentiel, pour que le voyageur puisse la corriger avant
de réserver plutôt que de la découvrir au moment de payer.

**Et l'exception se note.** Un aller simple, un retour depuis une autre ville, une arrivée
imposée : ce sont des contraintes, et l'outil le dit maintenant en toutes lettres dans sa
description. Elles apparaissent dans le carnet avec le reste, en français lisible.

**Ce que ça garde.** Une conversation qui ne pose que les questions qui servent. Un voyageur qui
part en aller-retour, c'est-à-dire presque tous, n'a rien de plus à répondre.

## Décision 32 : La citation suit la valeur, pas le dernier message

**Le problème, vu sur un vrai carnet validé.** Le carnet affichait « Contraintes : voyage
avec un bébé de 4 mois », et juste en dessous « vous avez dit : "tout" ». Le mot « tout »
répondait à une question de budget, plusieurs tours plus tard. La citation ne justifiait plus
rien, et le voyageur ne pouvait plus remonter à l'origine de l'information.

**La cause.** Chaque enregistrement ajoutait sa phrase à la liste des preuves, même quand il
renvoyait la valeur déjà connue. Le carnet montre la dernière preuve : c'était donc la dernière
phrase prononcée, pas celle qui avait produit la valeur.

**Ce qu'on a fait.** Une phrase n'est ajoutée que si elle change quelque chose : la valeur, ou
son degré de certitude. Un tour qui renvoie une information à l'identique ne touche plus à sa
citation.

**La preuve.** Trois tests sur `applyPatch` : valeur inchangée, valeur qui change, statut qui se
confirme. Sabotage vérifié.

**Où le voir.** `agent/brief/apply-patch.ts`.

## Décision 33 : Ce qui est déjà suffisant ne se redemande pas

**Le problème, compté sur une vraie conversation.** La période a été demandée quatre fois, aux
tours 4, 9, 12 et 13. La durée deux fois. Le voyageur avait pourtant répondu, à chaque fois :
« je suis flexible », « flexible entre les deux ». C'est le formulaire déguisé que le produit
combat, et la conversation se traîne sur quatorze tours pour un projet simple.

**La cause.** Une réponse souple donne un statut « vague », que le seuil du carnet complet accepte
(décision 4). Le modèle, lui, veut affiner, et rien ne le lui interdisait nommément. Le rappel
existant parlait des informations manquantes, pas de celles qui étaient déjà bonnes.

**Ce qu'on a fait.** Le serveur calcule, à chaque tour, la liste des informations obligatoires
déjà suffisantes, et les nomme : « Déjà connu et suffisant pour le carnet : la période, la durée.
Ne repose aucune question dessus, même pour affiner. » Il ajoute que « je suis flexible » est une
réponse, pas une absence de réponse.

**Ce que ça ne fait pas.** Bloquer la question. Le serveur ne sait pas sur quel champ porte une
question à choix, et une question légitime existe toujours, par exemple pour trancher une
contradiction. Le compteur de questions à choix d'affilée reste le garde-fou dur
(`MAX_CHOICES_IN_A_ROW`, `agent/loop.ts`).

**La preuve.** Deux tests sur le contenu réellement envoyé au modèle, sabotage vérifié.

**Où le voir.** `agent/context.ts` (`dejaSuffisant`).

## Décision 34 : La langue du voyageur se rappelle à chaque tour

**Le problème, mesuré.** Le prompt promet de répondre dans la langue du voyageur. Sur une vraie
conversation, « I want to go somewhere warm in February with my two kids » a reçu une réponse en
français. La règle était écrite une fois, tout en bas du prompt, et le modèle la perdait.

**Ce qu'on a fait.** Le serveur regarde le message reçu et, s'il est en anglais, ajoute un rappel
au tour : réponds en anglais, y compris dans les questions à choix et les fiches. Le carnet, lui,
reste en français, quelle que soit la langue de la conversation.

**L'heuristique est volontairement prudente.** Il faut au moins cinq mots, au moins trois mots
anglais courants, et deux fois plus d'anglais que de français. « Bali », « ok » et « Bali.
Juillet. 2 pers. Envoie. » ne déclenchent rien.

**Ce qu'on a écarté.** Une bibliothèque de détection de langue. Pour une règle qui ne coûte rien
quand elle se trompe, une dépendance de plus ne se justifie pas.

**La preuve.** Sept tests : deux phrases anglaises, deux françaises, trois messages courts, et le
rappel retrouvé dans ce que lit vraiment le modèle. Vérifié ensuite sur le vrai modèle : la même
phrase anglaise reçoit maintenant « Let me record your project: warm weather in February,
departing from Paris with your two children. »

**Où le voir.** `agent/context.ts` (`ecritEnAnglais`).

## Décision 35 : Le modèle relit son propre écart, pas un rappel de plus

**Le problème.** Le ton dérape encore : « Laissez-moi enregistrer votre projet », deux questions
dans un même message, une réponse de 120 mots. Les rappels du prompt et du contexte serveur
disent déjà tout ça, et le modèle les perd à mesure que la conversation grandit. Ajouter une
phrase de plus n'aurait rien changé, sauf le coût du contexte.

**Ce qu'on a fait.** Le serveur mesure ce que le voyageur vient de lire, avec le même compteur
que le banc d'essai. Cinq écarts sont surveillés : raconter son travail, poser plusieurs
questions, tutoyer, dire « brief », dépasser 80 mots. Le tour suivant le lui rappelle en le
citant : « Dans ton message précédent, tu as posé plusieurs questions dans le même message. »

**Pourquoi ça vaut mieux qu'un rappel de plus.** Le rappel n'arrive que quand le défaut a
vraiment eu lieu, il nomme ce défaut-là, et il disparaît dès que la réponse est propre. Le
contexte ne s'alourdit pas pour les tours qui vont bien.

**Un effet de bord utile.** Ces chiffres étaient calculés seulement dans le banc d'essai. Le
serveur les calcule maintenant à chaque tour, donc ils existent en conditions réelles.

**La preuve, et sa limite.** Sept tests sur les défauts nommés, deux sur le rappel retrouvé dans
ce que lit le modèle. Puis un test de bout en bout : narration au tour 1, défaut nommé, rappel
dans la requête du tour 2. La chaîne est donc prouvée.

En revanche, sur un passage réel après ce câblage, le modèle a de nouveau raconté son travail au
tour suivant. Un passage ne prouve rien dans un sens comme dans l'autre : le taux se mesurera au
prochain rejeu complet du banc. Un rappel, même personnalisé, reste une incitation, pas une
garantie. Les règles qui ne se négocient pas sont en code, pas dans le contexte.

**Où le voir.** `agent/reply-metrics.ts` (`defautsDeTon`), `agent/context.ts`, `agent/loop.ts`.

## Décision 36 : Après une recherche, on montre des lieux, on ne questionne pas

**Le problème, lu dans le tableau de taux.** Le scénario « dépaysant sans les foules » affichait
des fiches 3 fois sur 3, puis 1 fois sur 3 après une soirée de correctifs. La transcription
montre pourquoi : l'agent lance bien la recherche, « Bénin Laos Cambodge climat mai », puis pose
une question à choix au lieu de montrer les lieux trouvés.

**La cause probable.** Le prompt et les rappels du tour ont gagné quatre règles dans la même
soirée. Plus il y a de consignes, moins chacune pèse. Deux d'entre elles étaient devenues
inutiles, puisque le code les tient déjà : le tiret de liaison et le mot « brief ». Elles ont été
retirées du prompt.

**Ce qui ne suffisait pas.** Le rappel du tour disait déjà de montrer des fiches plutôt que de
poser une question. Une recommandation visuelle est une demande explicite du cadrage : elle
mérite mieux qu'une incitation.

**Ce qu'on a fait.** Une question à choix est refusée quand trois conditions sont réunies : une
recherche web a eu lieu dans ce tour, la destination est encore ouverte, et la période est
connue. Le refus dit quoi faire à la place, et l'agent montre les lieux qu'il vient de chercher.

**Les conditions sont étroites à dessein.** Sans recherche, la question reste permise : l'agent
n'a alors rien à montrer. Avec une destination déjà fixée, aussi.

**La preuve.** Deux tests, le refus et le cas où la question reste permise. Vérifié ensuite sur
le vrai modèle : le scénario affiche de nouveau ses fiches.

**Où le voir.** `agent/loop.ts` (`destinationOuverte`).

## Décision 37 : Le contact se demande à la validation du carnet, et jamais par l'agent

**Le problème.** Le brief ne portait ni prénom ni adresse. Impossible d'en imprimer l'en-tête sur
le carnet téléchargé, et rien ne permettait de savoir à qui il appartenait.

**Trois options.**

| Option | Ce qu'elle coûte |
|---|---|
| L'agent demande l'adresse dans la conversation | Un tour de plus, une faute de frappe qu'aucun modèle ne sait vérifier, et l'adresse citée dans le carnet comme une phrase du voyageur |
| Un compte voyageur | Hors sujet ici, et un mur avant la première question |
| Deux champs au moment de valider | Un formulaire minuscule, validé en code |

**Ce qu'on a fait.** Deux champs sous le récapitulatif, prénom et adresse. Le contrôle se fait
avec le même schéma Zod des deux côtés (`shared/contact.ts`) : le navigateur montre la faute tout
de suite, le serveur revérifie et répond 400 si l'adresse ne tient pas. L'adresse est mise en
minuscules et débarrassée de ses espaces avant d'être gardée.

**Le contact ne rentre pas dans le brief.** Le brief porte ce que le voyageur a dit de son
voyage, et chaque valeur y cite sa phrase. Une adresse n'est pas une envie de voyage : elle vit à
côté, dans la conversation côté serveur, et se range à côté du brief dans le fichier écrit sur
disque.

**Le modèle ne la voit jamais.** Elle n'entre ni dans l'historique des messages, ni dans le
contexte du tour. C'est une frontière qui se vérifie en lisant le code : le contact arrive par la
route de validation et n'est écrit nulle part ailleurs.

**Pourquoi le prénom seul.** Il suffit à personnaliser le carnet. Le nom, le téléphone et le
reste ne serviraient à rien de plus ici : chaque champ de plus fait abandonner un voyageur.

**La preuve.** Cinq tests sur le schéma, trois sur la route de validation, trois sur le formulaire. Et
un parcours réel dans le navigateur : une adresse sans arobase refusée avec son message, puis la
même corrigée, le carnet validé et le contact écrit à côté du brief.

**Où le voir.** `shared/contact.ts`, `server/app.ts`, `web/components/BriefSummary.tsx`.

## Décision 38 : Un voyage posé sur une fête n'est pas un voyage comme un autre

**Le problème, lu dans une vraie conversation.** Un voyageur écrit « je veux partir pour
Halloween ». L'agent lui propose Marrakech, la Guadeloupe et la côte amalfitaine. Trois beaux
endroits, aucun rapport avec la fête. Il finit par proposer Disneyland Paris, faute de mieux.

**Pourquoi ça rate.** Une fête fixe une date et une carte : la Saint-Patrick se vit en Irlande, la
fête des morts au Mexique, les marchés de Noël en Europe centrale. Le modèle le sait vaguement,
mais rien ne le lui demande au bon moment, et il enchaîne sur ses réflexes habituels.

**Ce qu'on a fait.** Un deuxième playbook, `voyage-pour-une-fete.md`, chargé à la demande comme
celui de la famille. Il dit trois choses : noter la période avant de parler d'un lieu, chercher
sur le web avant de proposer, et donner pour chaque lieu une raison liée à la fête. Il rappelle
aussi ce qu'une fête implique : la foule, les prix, la réservation tôt, et le reste du séjour
autour du jour de la fête.

**Le filet.** Le serveur reconnaît une fête dans les mots du voyageur (`feteEvoquee`), y compris
sans accent et sans tiret, car « noel » et « st patrick » s'écrivent ainsi dans un chat. Si le
playbook n'est pas chargé, le résultat de l'outil de notes le rappelle. C'est toujours l'agent
qui charge.

**La fenêtre couvre le séjour.** Le modèle resserrait la période sur le seul 31 octobre. Quatre
nuits n'y tenaient plus, et le seuil du carnet complet refusait un brief pourtant complet. Les instructions
demandent donc quelques jours avant et après. Mesuré sur le même message : du 24 octobre au
2 novembre.

**Et le serveur ne s'en remet pas au texte.** Le même message rejoué a redonné « du 31 octobre au
31 octobre » : une consigne écrite ne tient pas à tous les coups. Le serveur agit quand une fête est nommée et que la
fenêtre fait moins de cinq jours. Il l'ouvre alors de quatre jours de chaque côté, laisse le
statut en déduit, et demande à l'agent de le dire au voyageur. La règle vit en code, elle se teste,
et elle ne dépend plus de l'humeur du modèle.

**L'année reste déduite.** « Pour Halloween » donne une période, pas une année. Le modèle
enregistrait « Halloween 2026 » comme confirmé alors que le voyageur n'avait jamais dit 2026. Le
serveur ramène le statut à « déduit » quand une fête est nommée, que le libellé porte une année
et que le voyageur ne l'a pas dite. L'agent dit alors l'année à voix haute pour qu'il corrige.

**La mesure, avant et après, sur le même message.** Avant : Marrakech, Guadeloupe, côte
amalfitaine. Après : l'Irlande, le Mexique pour la fête des morts, et la Nouvelle-Orléans. Le
playbook se charge au premier tour, la recherche web précède les propositions.

**Où le voir.** `agent/playbooks/voyage-pour-une-fete.md`, `agent/tools/brief-tools.ts`
(`feteEvoquee`).

## Décision 39 : Un antislash dans une valeur du carnet, c'est une valeur refusée

**Le problème, lu par le voyageur.** Son récapitulatif affichait « belles d\teau9oratives » et
« voyage avec un b\teau9e de 6 mois ». Le modèle avait pourtant écrit « belles décorations » au
tour précédent : c'est en réécrivant sa propre valeur qu'il l'a cassée.

**Ce qui existait déjà.** Un contrôle attrapait l'accent écrit en syntaxe TeX (`Cor"{e du Sud`)
et la syntaxe d'appel d'outil. Il ne voyait pas cette forme là.

**Ce qu'on a fait.** Aucune valeur de voyage ne contient d'antislash. Sa seule présence suffit
donc à refuser l'entrée : l'outil rend une erreur lisible, et le modèle réécrit la valeur avec
les accents en clair. Le carnet ne reçoit jamais le mot cassé.

**Deux autres durcissements au passage.** Les descriptions des champs de texte demandent un
français correct, même quand le voyageur tape vite : « belle décos » devient « belles
décorations », et ses mots exacts restent dans la citation. Et un mot bouchon (« inconnu »,
« non précisé », « à préciser ») ne devient plus une valeur affichée.

**Où le voir.** `agent/tools/types.ts` (`findLeakedSyntax`), `agent/tools/brief-tools.ts`
(`normalizeDeparture`, `normalizeZone`).

## Décision 40 : Une citation ne justifie que ce dont elle parle

**Le problème, vu dans un vrai PDF.** Le carnet affichait « Envies : cuisine de rue », juste
au-dessus de « vous avez dit : départ de Paris, budget autour de 4 000 € ». Cette phrase ne
parlait pourtant pas de cuisine de rue.

**Ce qu'on a écarté.** Garder la même citation sous toutes les valeurs notées dans un même appel,
sans vérifier qu'elle parle de chacune. C'est ce réflexe qui collait la phrase sur le budget à une
envie sans lien.

**Ce qu'on a fait, en deux couches.** `note_preferences` ne garde plus qu'une seule citation par
appel. `citationParleDe` (`src/shared/citation.ts`) ne la place que sous les valeurs dont elle
parle : un mot de la valeur, ou un montant écrit comme « 4 000 » ou « 4k ». Sans ce lien, la case
est notée sans citation : `applyPatch` (`src/server/agent/brief/apply-patch.ts`) accepte une
citation vide plutôt qu'une fausse. Le carnet (`src/web/lib/carnet.ts`) imprime ensuite la
citation la plus récente qui parle de la valeur affichée. À défaut, la durée, les dates et les
voyageurs gardent leur dernière phrase, souvent dite avec d'autres mots (« 3 semaines » pour 21
nuits). La destination et la ville de départ restent alors sans citation. Cas observé avant ce
correctif : « Vietnam » imprimé avec « On aime la cuisine de rue et la baie d'Halong ».

**Ce que ça coûte.** Une vraie citation dite avec d'autres mots se perd. « Fauteuil roulant » ne
partage aucun mot avec « mobilité réduite », et la phrase originale disparaît du carnet.

**La preuve.** Huit tests (`citation.test.ts`, `brief-tools.test.ts`, `carnet.test.ts`), vus
rouges puis verts, sabotage vérifié sur chaque couche. Un vrai PDF, téléchargé dans un navigateur,
confirme le résultat.

**Où le voir.** `src/shared/citation.ts`, `src/server/agent/tools/brief-tools.ts`,
`src/server/agent/brief/apply-patch.ts`, `src/web/lib/carnet.ts`.

## Décision 41 : Un carnet validé ne se représente pas

**Le problème, vu sur une capture réelle.** Après le téléchargement du carnet, le tour de
remerciement affichait un second récapitulatif, « Votre carnet de voyage est prêt », formulaire
compris. Le voyageur revoyait un écran déjà refermé.

**La cause.** Le contexte serveur répétait « appelle present_brief maintenant » à chaque tour où
le carnet est complet, y compris après sa validation.

**Ce qu'on a écarté.** Compter sur le modèle pour ne plus rappeler ce récapitulatif de lui-même.
Le rappel vit dans le contexte envoyé à chaque tour, pas dans une intention qui se retient : sans
un verrou en code, il revient au tour suivant.

**Ce qu'on a fait, en deux couches.** Le contexte serveur (`src/server/agent/context.ts`) arrête
ce rappel dès que le carnet est validé, et dit à l'agent de répondre simplement.
`present_brief` (`src/server/agent/tools/present-brief.ts`) refuse en plus tout appel sur un
carnet déjà validé. Le script de scénarios s'arrête aussi après la validation, comme la route
d'envoi (`src/server/app.ts`), qui répond 409 à tout message sur un carnet validé.

**La preuve.** Trois tests, vus rouges puis verts, sabotage vérifié sur chaque couche :
`present-brief.test.ts` et `context.test.ts`.

**Où le voir.** `src/server/agent/context.ts`, `src/server/agent/tools/present-brief.ts`,
`src/server/app.ts`, `scripts/scenarios.ts`.

## Décision 42 : Un troisième playbook pour le voyage surprise

**Le problème.** Un voyageur qui écrit « surprenez-moi » ne veut pas répondre à un questionnaire.
Avant la procédure du premier tour, sur trois passages du scénario de référence, les fiches et la
recherche web n'apparaissaient qu'une fois sur trois. Un superlatif traînait, et deux réponses sur
trois dépassaient 80 mots.

**Ce qu'on a fait.** Un troisième playbook, `voyage-surprise.md`, chargé à la demande comme les
deux autres. Son premier tour suit un ordre fixe. L'agent note le projet, puis choisit trois idées
rares. Une recherche web les nomme avec la période. Il les montre ensuite en fiches, chaque lieu
nommé comme sur une carte pour que la photo se trouve. Une seule question suit, jamais la ville de
départ ni le budget.

**Ce qu'on a écarté.** L'appeler « mode créatif farfelu », comme il s'est dit en interne. Il se
présente au voyageur comme « mode surprise » ou « voyage surprise », pas comme un gadget.

**Ce que ça coûte.** La narration qui annonce l'appel d'outil (« Je vais noter votre projet et
charger les instructions ») reste écrite avant que le playbook agisse : rien dans ses instructions
ne peut l'empêcher. Un exemple ajouté au prompt ne l'a pas fait disparaître : elle reste à
2 passages sur 3 dans la campagne finale.

**La preuve.** Un test de non-fuite vérifie qu'aucune ligne du playbook n'apparaît au premier
tour, ni dans le prompt système. Un contrôle positif la retrouve une fois chargée, et un sabotage
fait échouer les deux (`context.test.ts`). Un test d'intégration réel montre le chargement
spontané sur au moins deux essais sur trois (`tests/integration/agent.test.ts`). Le scénario de
référence est numéro 16, « Surprenez-moi : dix jours en mars, on est trois amis et on a déjà fait
les grandes capitales d'Europe » (`docs/scenarios/16-surprenez-moi.md`). Sur la campagne finale,
trois passages du scénario 16 montrent une fiche affichée deux fois sur trois, et une recherche
web les trois fois. Le superlatif et la réponse de plus de 80 mots tombent chacun à une fois sur
trois. La narration reste à deux fois sur trois (`docs/scenarios/README.md`).

**Où le voir.** `src/server/agent/playbooks/voyage-surprise.md`,
`src/server/agent/tools/load-playbook.ts`, `docs/scenarios/16-surprenez-moi.md`.

## Et si on changeait de fournisseur de modèle ?

Question qui revient souvent. La réponse honnête : **ce code parle à
Claude, et ça se voit à quatre endroits**. Mesuré le 2026-09-20.

| Ce qui est propre à Anthropic | Où | Ce qu'il faudrait faire ailleurs |
|---|---|---|
| Le client et le format des messages | Un seul fichier appelle le modèle, `loop.ts` | Une interface « envoie ces messages, rends-moi des blocs » |
| La recherche web fournie par le modèle | `tools/index.ts`, outil serveur `web_search` | Un outil à nous, appelé par notre code : Linkup, Exa ou Tavily. Les étapes sont déjà écrites |
| Le cache de préfixe | `context.ts`, `cache_control` sur le dernier bloc | Chaque fournisseur a sa mécanique, ou n'en a pas. Le coût change, pas le comportement |
| Les outils en mode strict | `tools/schema.ts` | Ailleurs, la grammaire est souvent plus permissive : les garde-fous en code deviennent la seule barrière |

**Ce qui ne bougerait pas.** Le modèle du carnet, le seuil calculé en code, le chargement des
instructions à la demande, les contrôles de fidélité, la boucle de décision, et les 395 tests
(vérifié le 2026-09-21, `npx vitest run`).
C'est l'intérêt d'avoir écrit la boucle à la main plutôt que de prendre un cadre tout fait.

**Ce que ça coûterait vraiment** : une demi-journée pour l'abstraction et la recherche web, puis
une mesure complète. Le vrai travail n'est pas le branchement, c'est de **remesurer** les sept
scénarios. Un autre modèle ne suit pas les mêmes consignes, et les taux publiés ici ne valent que
pour Haiku 4.5.

**Pourquoi un seul fournisseur.** Une clé, un tarif, une table de prix
(`shared/pricing.ts`), et des mesures comparables entre elles. À grande échelle, la bonne
réponse serait une passerelle type LiteLLM pour le routage et la bascule, pas une abstraction
écrite à la main dans l'application.

## Ce qui a été écarté

| Écarté | Raison |
|---|---|
| Kubernetes, MongoDB, Postgres | Aucune démonstration ne les exige |
| LiteLLM Gateway | Utile à grande échelle (routage, quotas, bascule) ; ici un seul fournisseur |
| Langfuse branché | L'observabilité est un design écrit ; les traces JSONL montrent quoi envoyer |
| CopilotKit | Une abstraction de plus ; un chat maison garde la main sur l'interaction |
| Un appel d'extraction séparé à chaque tour | Un appel de plus par tour ; à mesurer si les outils `note_*` déçoivent |
| Filtrer les superlatifs dans le texte affiché | Réécrire la réponse du modèle en direct ; le taux est mesuré et documenté à la place |

## Décision 43 : Une fiche de pays montre une vraie photo du pays

**Le problème, mesuré sur le vrai Wikipédia.** Pour une fiche qui porte sur un pays entier,
« Albanie » affichait un sabre de musée et « Jordanie » une avenue de Paris. Plusieurs autres pays
n'avaient aucune photo.

**Les causes.** Trois. Le filtre des musées comparait « musee » à une adresse encodée, où « Musée »
s'écrit « Mus%C3%A9e ». La recherche doublait le nom (« Maroc Maroc »). Enfin, l'image de la page
d'un pays est un drapeau ou une carte, et la recherche de texte ramenait n'importe quel fichier
qui contient le nom.

**Ce qu'on a fait.** L'adresse est décodée avant le filtre, qui connaît aussi « museu », « museo »,
« muzey » et « muzeum ». Pour un pays, la recherche porte sur son seul nom, puis la fiche prend la
première vraie photo de l'article, dans l'ordre de lecture (`fetchArticlePhoto`). Enfin, une
réponse 429 ou 503 de Wikimédia compte comme une panne passagère, jamais gardée en cache.

**Ce qu'on a écarté.** La page « Tourisme en… » : son nom varie (« au Maroc », « en Islande ») et
son image est parfois un logo.

**La preuve.** Cinq tests, vus rouges puis verts, et un sabotage par correctif. Sur le vrai
Wikipédia : Byllis pour l'Albanie, la forêt d'Ajloun pour la Jordanie, une ferme pour l'Islande,
une rizière de la baie d'Halong pour le Vietnam, le Geirangerfjord pour la Norvège.

**Où le voir.** `src/server/agent/destination-lookup.ts`.

## Décision 44 : Une phrase de coulisses ne s'affiche pas

**Le problème, mesuré.** Sur la campagne du 2026-09-25, 19 passages sur 48 montraient au voyageur
une phrase comme « Je vais noter votre projet et charger les instructions ». Le prompt l'interdit,
avec l'exemple exact : le modèle l'écrit quand même, avant tout appel d'outil.

**Ce qu'on a fait.** Un filtre en code (`createCoulissesFilter`, `text-guard.ts`) retire une phrase
courte, sans question, qui ne fait que raconter le travail de l'agent (motifs de `reply-metrics.ts`).
Il ne retient que les phrases qui commencent comme des coulisses : les autres s'affichent mot à mot.
La phrase disparaît aussi du texte gardé dans l'historique, avant son ajout. Le défaut reste
signalé au modèle au tour suivant, et chaque retrait laisse une trace `coulisses_retirees`.

La relecture du serveur a trouvé deux trous, reproduits sur le vrai code puis corrigés. « Je note
que vous êtes quatre pour un trek au Népal » disparaissait : une phrase qui rapporte un fait du
voyageur reste désormais. « Parfait, c'est noté. » passait au fil de l'eau mais sortait de
l'historique : une interjection ou un tiret devant ne change plus la règle. Une phrase en « Je »
n'est plus retenue jusqu'à son point : au-delà de 30 lettres sans verbe de coulisses, elle s'affiche.

**Ce qu'on a écarté.** Retirer toute phrase qui contient « c'est noté » : « Vous partez à deux à
Bali en juillet, c'est noté » donne une vraie information au voyageur.

**La preuve.** Six tests, vus rouges puis verts, sabotage vérifié. Campagne réelle suivante :
une phrase visible dans 6 passages sur 48, et 30 phrases retirées sur les deux campagnes.

**Où le voir.** `src/server/agent/text-guard.ts`, `src/server/agent/loop.ts`.

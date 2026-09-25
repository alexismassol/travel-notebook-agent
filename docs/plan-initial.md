# Plan initial

Écrit le 2026-09-16, avant toute ligne de code. Quatre points, chacun avec les options
envisagées, l'option retenue et ce qu'elle coûte. Les écarts constatés pendant la construction
sont tranchés dans `docs/choix-techniques.md`, pas en réécrivant ce fichier.

Source du cadrage : la note produit résumée dans `docs/produit.md`.

---

## 1. Le modèle de données du brief et le traitement de l'ambiguïté

### Le problème

Le voyageur dit "cet été, deux semaines à peu près", "on sera 4 ou 6". Un modèle qui n'a que
"valeur ou vide" doit choisir entre inventer une date et jeter l'information. Les deux sont des
défauts : le premier ment au voyageur, le second perd la nuance que le cadrage demande de garder.

### Options envisagées

| Option | Pour | Contre |
|---|---|---|
| A. Objet plat, champs nullables (`destination: string \| null`) | Simple, rapide | Aucune place pour le flou ni la contradiction. « Cet été » devient une fausse date |
| B. Notes en texte libre, résumées en fin de conversation | Garde toutes les nuances | Brief non structuré, non validable, complétude incalculable. |
| C. **Chaque champ a une valeur, un statut et une citation** | Le flou, l'inférence et la contradiction deviennent des états visibles | Schéma plus riche. Le modèle doit bien remplir le statut |

### Retenu : C

Chaque slot du brief porte :

- **`status`** : `unknown` | `vague` | `inferred` | `confirmed` | `conflicting`
- **`value`** : typée par champ, et **en intervalle** quand le réel est un intervalle
- **`evidence`** : la phrase du voyageur, mot pour mot, et le numéro du tour

Valeurs typées des quatre obligatoires :

| Champ | Forme de la valeur | Exemple "cet été, deux semaines à peu près" |
|---|---|---|
| `destination` | `{ mode: open \| shortlist \| fixed, candidates[], criteria[] }` | - |
| `dates` | `{ earliest, latest, flexibility }` (fenêtre, pas une date) | `2027-06 → 2027-08`, `vague` |
| `duration` | `{ minNights, maxNights }` | `12 → 16`, `vague` |
| `travellers` | `{ adults: {min,max}, children: [{ age \| null }] }` | `"4 ou 6"` → `total 4..6`, `vague` |

Utiles, non obligatoires : `budget` (intervalle + par personne ou total), `style`,
`interests[]`, `constraints[]`. Même structure de slot, mais **ils ne bloquent jamais**.

Traitement de l'ambiguïté :

- **Flou** : on garde la citation et un intervalle. Le panneau affiche "dates : cet été, à
  préciser". Jamais une valeur inventée présentée comme confirmée.
- **Inférence** (ex. "avec les enfants" → au moins 1 enfant) : statut `inferred`. L'agent les
  fait valider **en une seule fois** dans le récapitulatif, pas une par une (sinon on retombe
  dans le formulaire).
- **Contradiction** ("3 semaines" puis "10 jours") : statut `conflicting`, les deux valeurs et
  leurs tours sont gardés. L'agent pose une seule question pour trancher.
- **Destination ouverte** : `mode: open` + critères ("soleil", "sans les foules"). Ce statut
  déclenche une recommandation, pas une question.

**Le seuil "brief envoyable" est calculé en code, pas par le modèle.** Une fonction pure
`completeness(brief)` rend `ready: boolean` et la liste de ce qui manque. Règle proposée :

- destination : une zone unique (un pays ou une région), `fixed`, ou
  `shortlist` dans la même zone
- dates : au moins le mois
- durée : un intervalle d'au plus 7 nuits d'écart
- voyageurs : nombre connu à ±1 près, et l'âge de chaque enfant s'il y en a
- aucun slot obligatoire en `conflicting`, aucun en `inferred` non validé

Le modèle voit le résultat, il ne le décide pas. Pourquoi : le seuil est la décision produit
centrale ; il doit être testable, réglable sans toucher au prompt, et identique d'une
conversation à l'autre.

Zod valide le brief à chaque mise à jour, et il est **versionné à chaque tour**. Chaque version
porte un numéro et la liste des changements. C'est ce qui donne la trace, et l'affichage « ce qui
vient de changer ».

### Ce que ça coûte

- Un schéma d'outil plus long (tokens à chaque appel, mitigé par le cache de prompt).
- Un risque qualité : le modèle peut mal classer un statut (`confirmed` au lieu de `inferred`).
  C'est le premier point à évaluer (voir `docs/evaluation.md`).
- Le seuil de 7 nuits ou "au moins le mois" est une hypothèse produit, pas une donnée. Il sera
  présenté comme tel.

---

## 2. La boucle de décision tour par tour

### Le problème

L'agent doit choisir à chaque tour : répondre, questionner, chercher, illustrer. Le cadrage exclut
l'ordre figé. Il faut quand même des garde-fous que le modèle ne peut pas contourner.

### Options envisagées

| Option | Pour | Contre |
|---|---|---|
| A. Machine à états, slots remplis dans un ordre | Prévisible, testable | C'est le formulaire déguisé que le cadrage exclut |
| B. Routeur : un appel classe l'intention, un traitement par intention | Chaque chemin se teste seul | Deux appels par tour. Une intention imprévue tombe dans le mauvais tiroir |
| C. **Un seul agent avec des outils, qui choisit** | Gère les phrases imprévues et les enchaînements | Moins prévisible. La qualité se mesure, elle ne se lit pas dans le code |

### Retenu : C

Anatomie d'un tour :

1. Le message arrive (texte libre ou réponse à une question à choix, structurée).
2. Le serveur construit la requête : prompt système stable (mis en cache), outils, historique,
   et un **état du brief** court (slots + `completeness`) ajouté au message du tour.
3. Le modèle répond. S'il appelle des outils, le serveur les exécute et relance, **au plus 6
   fois par tour**.
4. Deux familles d'outils :
   - **non terminaux** (`update_brief`, `load_playbook`, `web_search`, `show_destination_cards`) :
     le modèle continue après leur résultat
   - **terminaux** (`ask_choice`, `present_brief`) : le tour s'arrête, l'interface attend le
     voyageur
5. Le texte est streamé vers l'interface en SSE, avec des événements dédiés : `text`,
   `tool_started`, `brief_updated`, `ui_block`, `turn_end`.

Invariants tenus par le code, pas par le prompt :

- limite d'itérations d'outils par tour
- `present_brief` refusé si `completeness.ready` est faux (l'erreur revient au modèle)
- un outil terminal clôt le tour même si le modèle voulait continuer

### Choix du runtime

La première idée était le **Claude Agent SDK**. Ce plan propose de le remplacer : voici la
comparaison.

| | Claude Agent SDK (`@anthropic-ai/claude-agent-sdk` 0.3.273) | **Messages API** (`@anthropic-ai/sdk` 0.126.0), boucle écrite à la main |
|---|---|---|
| Nature | Le harnais de Claude Code en bibliothèque : outils intégrés (fichiers, bash), skills, hooks, sessions | Un appel réseau par itération ; on possède la boucle (~100 lignes) |
| Chargement à la demande | Natif via les skills | Un outil `load_playbook` |
| Contrôle du contexte | Le SDK ajoute son propre contexte. Prouver ce que voit le modèle est moins direct | **On construit la requête nous-mêmes. Un test peut vérifier son contenu** |
| Exécution | Lance le runtime Claude Code en sous-processus par requête (à revérifier sur cette version avant de trancher) | Aucun processus annexe |
| Outils à neutraliser | Bash, écriture de fichiers : à désactiver pour un chat public | Aucun |

Recommandation : **Messages API**. Le point le plus surveillé du projet est ce que le modèle
voit. Avec une boucle maison, "les instructions famille ne sont pas dans le contexte initial"
devient un test automatique sur la requête réelle, pas une affirmation. Le coût : on écrit la
boucle et la gestion des outils terminaux.

### Choix du modèle du runtime

Tarifs Anthropic au 2026-06-24 (par million de tokens, entrée / sortie) : Sonnet 5 2 $ / 10 $,
Opus 5 5 $ / 25 $, Fable 5 10 $ / 50 $, Haiku 4.5 1 $ / 5 $.

Estimation **non mesurée**, à remplacer par la mesure réelle en T2 : une conversation de 8 tours,
~2 appels par tour, ~10 k tokens d'entrée par appel, ~500 tokens de sortie. Soit ~160 k tokens
d'entrée et ~8 k de sortie, **avant cache** :

- Sonnet 5 : ~0,40 $ par conversation
- Opus 5 : ~1,00 $ par conversation

Avec le cache de prompt, l'entrée répétée coûte une fraction de ce prix. À plusieurs milliers de
conversations par mois, l'écart entre les deux modèles se chiffre en centaines à milliers
d'euros par mois.

Recommandation : **Sonnet 5 pour la conversation**, effort à régler sur un échantillon. Opus 5
en comparaison sur les mêmes scénarios, pour savoir ce qu'on perd. Tâche de dialogue et d'appel
d'outils, sensible à la latence : c'est le profil où un modèle plus lourd rapporte le moins.

### Ce que ça coûte

- La qualité des choix de l'agent ne se voit pas dans le code : elle se mesure sur des scénarios.
- La limite de 6 itérations peut couper une recherche légitime en plusieurs étapes.

---

## 3. Le chargement à la demande des instructions "Voyage en Famille"

### Le problème

Les instructions doivent être absentes du prompt système et du contexte permanent, puis
présentes dès que la famille est détectée, **avec une trace de la décision**.

### Options envisagées

| Option | Pour | Contre |
|---|---|---|
| A. Dans le prompt système | Toujours appliquées | **Exclu par le cadrage.** Et paie ces tokens sur 100 % des conversations. |
| B. Détection en code par mots-clés, puis injection | Toujours le même résultat | Ce n'est pas l'agent qui va les chercher. Les mots-clés ratent « avec les petits » |
| C. **Outil `load_playbook(name, reason)` que l'agent appelle** | L'agent décide ; la trace est l'appel lui-même, avec sa raison | Le modèle peut oublier de l'appeler |
| D. Skill du Claude Agent SDK | Pattern natif | Lié au choix du runtime (§2) |
| E. Message système inséré en cours de conversation | Garde le cache | Non disponible sur Sonnet 5 ; reste une détection en code |

### Retenu : C, avec un filet de sécurité

- Le texte vit dans `src/server/agent/playbooks/voyage-en-famille.md`, **chargé depuis le disque
  seulement quand l'outil est appelé**.
- Ce qui est en contexte permanent : la **description** de l'outil (~50 tokens), qui dit quand
  l'appeler ("dès que le voyage inclut des enfants"). C'est l'index, pas les instructions.
- Le résultat de l'outil (le texte des instructions) entre dans l'historique au tour où il est
  appelé et y reste ensuite. Ce n'est pas du contexte permanent : il n'existe que dans les
  conversations familiales, à partir du moment où la famille est détectée.
- **Trace** : chaque chargement est journalisé avec le tour, la version du brief, la `reason`
  donnée par le modèle, et l'origine `spontaneous` ou `nudged`. Un bandeau discret dans
  l'interface l'affiche ("Conseils famille activés : deux enfants mentionnés").
- **Deux fois le même appel** : le second renvoie "déjà chargé", sans recopier le texte.
- **Filet** : si le brief contient des enfants et que le playbook n'est pas chargé, le serveur
  ajoute au tour suivant un rappel d'une ligne. **L'agent reste celui qui charge.** Le taux de
  chargements `nudged` devient une métrique : s'il monte, la description de l'outil est à revoir.

Le registre accepte d'autres playbooks : une règle qui concerne une situation précise devient un
playbook, et seule une règle vraie pour toutes les conversations va dans le prompt système.

Deux tests prouvent la contrainte :

1. **Test unitaire** : la requête du premier tour (prompt système + outils + messages) ne
   contient aucune phrase du playbook.
2. **Test d'intégration, vrai appel API** : un message "on part avec nos deux enfants de 4 et
   7 ans" déclenche `load_playbook`. Ce test coûte des tokens réels ; il ne tourne pas en boucle.

Distinction à garder en tête : `src/server/agent/playbooks/` = instructions du **produit**, lues par
l'agent en production. `.claude/skills/` = procédures de **construction**, lues par Claude Code
pendant le développement. Ce ne sont pas les mêmes objets.

### Ce que ça coûte

- Si le modèle ne détecte pas la famille, les conseils arrivent un tour trop tard (filet).
- Une fois chargées, les instructions restent dans l'historique jusqu'à la fin : ~400 tokens
  par appel suivant, en partie absorbés par le cache.

---

## 4. Le découpage des outils

### Le principe

Un outil existe s'il fait l'une de ces trois choses. **Changer l'état**, c'est-à-dire le brief.
**Aller chercher ce que le modèle ne sait pas**, sur le web ou dans un playbook. Ou **produire un
affichage que le texte ne sait pas faire** : un choix, une fiche, un récapitulatif. Le reste est du
texte.

### Les outils

| Outil | Type | Rôle | Pourquoi un outil |
|---|---|---|---|
| `update_brief({ patches[] })` | non terminal, invisible | Applique des modifications de champs | L'état est validé et versionné par le serveur, jamais réécrit par le modèle |
| `load_playbook({ name, reason })` | non terminal | Charge un jeu d'instructions | Section 3 |
| `web_search` | non terminal | Saisonnalité, faisabilité, formalités, actualité | Le modèle ne doit pas affirmer sans source |
| `show_destination_cards({ cards[1..3] })` | non terminal, rendu | Fiches : nom, pourquoi ce lieu, à cette période, pour ce profil, sources | Recommandation visuelle et "c'est où Zanzibar ?" |
| `ask_choice({ question, options[], multi, allowOther })` | **terminal**, rendu | Question à choix en cartes cliquables | L'interface doit attendre une réponse structurée |
| `present_brief()` | **terminal**, rendu | Récapitulatif + bouton "Envoyer la demande" | Refusé en code si le brief n'est pas prêt |

Précisions :

- **Recherche web.** Options : l'outil serveur Anthropic
  `web_search_20260209` (compatible Sonnet 5 et Opus 5), ou Tavily / Linkup / Exa derrière un
  outil maison. Recommandation : **l'outil Anthropic**. Une seule clé, citations natives, rien à
  héberger. Le coût : dépendance au fournisseur, facturation à la recherche (tarif à vérifier sur
  la page officielle), et moins de contrôle sur la taille des résultats. Tavily reste la
  bascule si le prix ou le contrôle posent problème.
- **Photos et carte des fiches** : le modèle donne le nom du lieu. **Le serveur** récupère la photo
  et les coordonnées depuis l'API publique de Wikipédia, sans clé. La carte est un fond
  OpenStreetMap. Pourquoi : des coordonnées écrites par le modèle peuvent être fausses.
- **Le téléchargement du carnet** ne transmet rien à un tiers : le brief final est écrit dans un
  fichier JSON local, puis le PDF part directement au navigateur. Ce sera dit dans le README.

### Écartés

- Un outil par champ (`set_destination`, `set_dates`...) : 8 outils de plus dans le contexte,
  et le modèle met souvent plusieurs champs à jour d'un coup.
- Un appel d'extraction séparé après chaque message : un appel de plus par tour. Gardé comme
  alternative à comparer si `update_brief` se révèle peu fiable.
- Un outil de construction d'itinéraire : hors du rôle de l'agent.

### Ce que ça coûte

- Six schémas d'outils dans chaque requête (quelques centaines de tokens, mis en cache).
- Les outils de rendu couplent le serveur et le front : chaque nouveau bloc = un composant React.

---

## 5. Découpage en tranches

Ordre choisi par risque : ce qui porte les contraintes fermes passe en premier.

| Tranche | Contenu | Durée |
|---|---|---|
| T0 | Dépôt, CLAUDE.md, CONTRIBUTING.md, .env.example, squelette docs/ | 30 min |
| T1 | Modèle du brief, `completeness()`, tests | 45 min |
| T2 | Boucle d'agent + `update_brief` en CLI, premier vrai appel, mesure du coût réel | 60 min |
| T3 | `load_playbook` + trace + les deux tests | 30 min |
| T4 | Chat React, SSE, panneau brief | 60 min |
| T5 | `ask_choice`, fiches destination, recherche web, `present_brief` | 60 min |
| T6 | README, schéma système, observabilité, évaluation, produit | 60 min |

Si le budget glisse, T5 se réduit en premier (fiche sans carte), jamais T3.

---

## 6. Outillage de construction versionné (`.claude/`)

Écrits pour ce projet uniquement. Les skills, hooks et serveurs MCP génériques de l'auteur restent
hors du dépôt et seront seulement cités dans le README.

**Skills proposés**

- `tranche` : la procédure d'une tranche. Expliquer le choix, test rouge, code, test vert,
  doc à jour, commit court.
- `scenarios-voyageur` : rejouer les cinq intentions de référence contre l'agent réel et
  enregistrer les transcriptions dans `docs/scenarios/`. Sert de preuve et de base à l'évaluation.

**Agents proposés** (modèle Sonnet)

- `auditeur-contexte` : relit le code qui construit la requête et cherche toute fuite du
  playbook dans le contexte permanent. Rend un verdict avec `fichier:ligne`.
- `relecteur-brief` : lit une transcription et le brief final du point de vue du voyageur qui
  organise son voyage avec ce seul carnet. Le carnet est-il exploitable ? Des valeurs
  sont-elles inventées ? Des nuances perdues ?

**Garde-fou git** : un hook `commit-msg` versionné dans `.githooks/` refuse un commit qui touche
le cœur de l'agent (`src/server/agent/`, `src/shared/`) sans documentation à jour. Il vient d'un modèle personnel, adapté ici ; la
matrice de test est livrée avec.

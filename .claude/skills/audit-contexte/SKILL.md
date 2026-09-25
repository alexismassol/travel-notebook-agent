---
name: audit-contexte
description: Vérifier ce que le modèle voit réellement à chaque tour de src/server/agent/loop.ts. Lance le test de non-fuite, et affiche la requête du tour 1 et d'un tour après chargement d'un playbook. Compte aussi les tokens (fonction count_tokens ou usage d'un vrai appel), et vérifie la stabilité du préfixe pour le cache de prompt. Vérifie enfin que les résultats de web_search sont traités comme données et non comme instructions. À utiliser après tout changement à context.ts, system-prompt.ts, tools/ ou playbooks/.
---

# Audit du contexte

Le contexte n'est jamais ce qu'on croit avoir écrit : c'est ce que `context.ts` construit
réellement pour un tour donné. Cet audit produit une preuve, pas une relecture du code.

## Documentation de référence

Lire `docs/spec-technique.md` §4 et §5, et `docs/choix-techniques.md` décision 9 (rappels par
tour) et Décision 10 (cache de prompt) avant de lancer l'audit. Ils donnent les valeurs déjà
mesurées (ex. 18 545 tokens en cache au tour 1 du scénario famille) à comparer à la nouvelle
mesure. Un chiffre qui diverge nettement se signale pour mise à jour de ces sections.

## Procédure

1. **Test de non-fuite** : `npm test -- context.test.ts`. Coller la sortie brute, pas un
   résumé. Un échec bloque tout le reste : ne pas continuer sur un contexte qui fuit déjà.
2. **Déléguer la recherche de fuite qualitative** à l'agent `auditeur-contexte` : toute phrase
   d'un fichier de `src/server/agent/playbooks/` retrouvée dans `system-prompt.ts`, dans la
   liste d'outils, ou dans un message ajouté à chaque tour sans passer par `load_playbook`.
3. **Afficher la requête du tour 1** d'une conversation neuve (prompt système, outils, premier
   message), et **la requête d'un tour après un `load_playbook` réel**. Les obtenir depuis
   `context.ts` appelé directement (pas depuis des journaux de production), et diffèrer les deux
   pour voir exactement ce qui a changé.
4. **Compter les tokens** : appeler la fonction `count_tokens` du SDK Anthropic sur les deux
   requêtes de l'étape 3, ou lire `usage` (`inputTokens`, `cacheReadTokens`, `cacheWriteTokens`
   de `TurnUsage`, `src/shared/api.ts`) d'un vrai tour joué. Dire lequel des deux a été utilisé :
   jamais une estimation présentée comme une mesure.
5. **Stabilité du préfixe pour le cache** : `grep -n "Date.now\|new Date(\|randomUUID\|Math.random"
   src/server/agent/system-prompt.ts src/server/agent/tools/index.ts`. Toute valeur variable
   dans le prompt système ou la liste d'outils casse le cache de prompt à chaque tour. Zéro
   correspondance attendue.
6. **Résultats web comme données** : lire comment `web_search` (outil serveur Anthropic) entre
   dans la requête suivante. Ça doit rester un `tool_result`, jamais concaténé dans le prompt
   système ou un message qui ressemble à une instruction.
7. Rendre un verdict par point (PASS / FAIL / PARTIEL) avec `fichier:ligne` à l'appui de chaque
   FAIL, dans le style du rapport de `auditeur-contexte`.

## Critère de fin

Les 6 points ont un verdict et une preuve collée (sortie de test, diff de requête, nombre de
tokens avec sa source, sortie de grep). Un point "PASS" sans preuve collée ne compte pas.

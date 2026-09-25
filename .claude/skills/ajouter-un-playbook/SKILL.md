---
name: ajouter-un-playbook
description: Ajouter un jeu d'instructions produit chargé à la demande dans src/server/agent/playbooks/ (sur le modèle de voyage-en-famille.md). Couvre le fichier .md, l'entrée du registre playbooks/index.ts, l'enum de l'outil load_playbook, et la description d'outil qui dit QUAND l'appeler. Couvre aussi le test de non-fuite dans la requête du tour 1, le contrôle positif après chargement, et le test d'intégration réel. À utiliser pour tout nouveau playbook produit, jamais pour une règle qui concerne 100 % des conversations.
---

# Ajouter un playbook

Un playbook est un texte **produit**, lu par l'agent en conversation : pas une procédure de
construction (ça, c'est un skill de `.claude/skills/`). Il existe seulement si l'agent doit
adapter son comportement quand un cas précis est détecté (comme "voyage en famille"). Il ne
sert jamais pour une règle vraie sur toutes les conversations : celle-là va dans `system-prompt.ts`.

## Rappel ferme

**Jamais dans `system-prompt.ts`.** Le prompt système et la liste d'outils sont le contexte
permanent, payé sur 100 % des tours. Un playbook n'existe qu'à partir du tour où l'agent l'a
chargé.

## Documentation de référence

Lire `docs/spec-technique.md` §5 "Chargement à la demande des playbooks" (registre, chargement
sans doublon, trace) et `docs/choix-techniques.md` décision 5 avant d'ajouter un playbook. Les deux listent les
playbooks livrés (`voyage-en-famille`, `voyage-pour-une-fete`, `voyage-surprise`) : mets-les à jour dans le même commit
que l'ajout, ou signale-le pour `gardien-docs`.

## Procédure

1. **Justifier le déclencheur** en une phrase : quel signal du voyageur (pas un mot-clé rigide,
   l'agent décide) doit faire charger ce playbook.
2. **Écrire le texte produit** dans `src/server/agent/playbooks/<nom>.md`. Contenu métier
   uniquement (ton, points à vérifier, alertes, défauts), aucune instruction de code.
3. **Enregistrer** l'entrée dans `src/server/agent/playbooks/index.ts` : nom, chemin du
   fichier, chargement depuis le disque au moment de l'appel, jamais au démarrage.
4. **Étendre l'enum** de paramètres de l'outil dans `src/server/agent/tools/load-playbook.ts`
   avec le nouveau nom.
5. **Écrire la description de l'outil** pour qu'elle dise QUAND l'appeler ("dès que ..."),
   jamais ce que contient le playbook. La description reste en contexte permanent, le
   contenu non.
6. **Test de non-fuite** dans `src/server/agent/context.test.ts` : la requête construite pour
   le tour 1 d'une conversation neuve ne contient aucune phrase du nouveau fichier `.md`.
7. **Contrôle positif** dans le même fichier : après un appel simulé de `load_playbook`, la
   requête du tour suivant contient le texte chargé. Un test de non-fuite sans ce contrôle ne
   prouve rien (il pourrait juste ne jamais rien charger).
8. **Test d'intégration réel** dans `tests/integration/` (`npm run test:integration`) : un
   message qui déclenche naturellement le playbook (formulation libre, pas le nom exact du
   déclencheur) fait apparaître l'événement `playbook_loaded` avec `origin: "spontaneous"`.
9. Si un filet de sécurité existe pour ce cas (comme le rappel après-coup de la famille),
   vérifier qu'il produit `origin: "nudged"`, jamais `"spontaneous"`.
10. `npm run check`, doc à jour (`docs/spec-technique.md`, `docs/choix-techniques.md`), commit.

## Critère de fin

Les trois preuves coexistent : test de non-fuite vert, contrôle positif vert, test
d'intégration vert avec un `playbook_loaded` réel dans les événements SSE. Sans les trois, le
playbook n'est pas considéré comme du chargement à la demande.

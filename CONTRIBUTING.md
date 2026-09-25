# Contribuer

## Lancer le projet

Prérequis : Node 20.19 ou plus récent, une clé API Anthropic.

```bash
npm install
cp .env.example .env        # puis renseigner ANTHROPIC_API_KEY
npm run dev                 # http://localhost:5173
```

`npm start` compile l'interface et sert tout depuis le serveur sur http://localhost:8787.

## Tester

| Commande | Ce qu'elle vérifie | Coût |
|---|---|---|
| `npm run check` | Biome, typecheck, contrôle de la documentation, 434 tests unitaires. Ils couvrent le brief, sa complétude et la fidélité des valeurs notées. Puis la non-fuite du playbook, la recherche de destination, la boucle d'un tour, les réponses d'erreur du serveur et les compteurs de ton | nul |
| `npm run test:integration` | L'agent réel, 5 tests. Chargement du playbook famille. Chargement du playbook voyage surprise, au moins 2 essais sur 3. Brief complet sans `ask_choice`. Recherche web sur un conseil Népal, au moins 2 essais sur 3. Question à choix sur une composition variable, au moins 1 essai sur 3 | quelques centimes |
| `npm run scenarios` | Rejoue les 16 intentions de référence dans `docs/scenarios/`. Avec `SCENARIO_REPEAT=3`, chaque intention est rejouée 3 fois, avec un tableau de taux | environ 1,20 $ (mesuré : 1,19 $ en jetons pour 48 passages, plus 26 recherches web) |
| `npm run visual-check` | Contrôle visuel réel sur l'application lancée par `npm run dev`. Il mène la conversation, clique une question à choix, télécharge le carnet, ouvre les détails techniques. Il mesure le débordement horizontal, les zones tactiles trop petites et les images sans `alt`. Captures dans `data/screenshots/` | quelques centimes |

Les tests d'intégration échouent explicitement si la clé manque : un vert obtenu en sautant les
tests ne prouverait rien.

## Contribuer

1. Installer les hooks git une fois : `git config core.hooksPath .githooks`.
   `pre-commit` bloque `.env`, toute chaîne ressemblant à une clé Anthropic et les documents de
   travail ; il lance Biome. `commit-msg` impose le format et une doc à
   jour dans `docs/` si le commit touche `src/server/agent/` ou `src/shared/` (`[skip docs]` sinon).
   Matrice de test des hooks : `bash .githooks/test-hooks.sh`.
2. Une modification = une tranche (skill `.claude/skills/tranche`) : décision écrite, test rouge,
   code, test vert, `npm run check`, doc à jour si un comportement change, commit.
3. Ajouter un outil d'agent : agent `.claude/agents/implementeur-outil.md`.
   Ajouter un playbook : skill `.claude/skills/ajouter-un-playbook`.
4. Après tout changement à `context.ts`, `system-prompt.ts`, `tools/` ou `playbooks/` : skill
   `audit-contexte`, puis `npm run scenarios`.
5. Diagnostic ponctuel, sans passer par les scénarios complets : `npx tsx --env-file=.env
   scripts/probe.ts "message"` (un seul appel modèle, décision brute, sans exécuter les outils) ;
   `npx tsx --env-file=.env scripts/debug-turn.ts "message"` (un tour complet réel, historique
   affiché bloc par bloc).

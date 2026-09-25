---
name: scenarios-voyageur
description: Lancer npm run scenarios (vrais appels à l'API Messages, coût à annoncer avant l'exécution) sur les 15 intentions de référence. Lire les transcriptions de docs/scenarios/, confier chaque transcription à l'agent relecteur-brief, et consigner le bilan dans docs/scenarios/relecture.md. À utiliser en fin de tranche T6 ou après tout changement à loop.ts, system-prompt.ts ou aux outils.
---

# Scénarios voyageur

Preuve de fonctionnement = vrais appels, jamais une conversation rejouée de mémoire. Les 15
intentions sont dans `scripts/scenarios.ts`, une transcription par scénario dans `docs/scenarios/`.

## Les intentions de référence (les cinq premières)

1. Destination ouverte en famille : "on veut du soleil en famille cet hiver, mais on sait pas où"
2. Infos déjà complètes : "Vietnam, 3 semaines en novembre, on est 2, budget ~4000€"
3. Conseil à étayer : "le trek au Népal en juillet, c'est jouable ?"
4. Envie floue à ancrer : "c'est où Zanzibar ?"
5. Recommandation responsable : "un truc dépaysant mais sans les foules"

## Documentation de référence

Lire `docs/evaluation.md` §2 "Hors ligne" (ce que couvre déjà le jeu de scénarios, ce qui
manque) et `docs/spec-fonctionnelle.md` §2 (parcours attendu par intention) avant de lancer.
Ça évite de confondre un défaut déjà connu et documenté avec une régression. Un défaut nouveau
et confirmé sur plusieurs relances s'ajoute à `docs/evaluation.md` §1 ou `docs/observabilite.md`
§1, pas seulement dans la relecture.

## Procédure

1. **Annoncer le coût avant de lancer** : reprendre le dernier `usage` réel mesuré (tranche T2
   ou session précédente) et l'ordre de grandeur pour 5 conversations. Dire explicitement si
   c'est une mesure ou une estimation, jamais l'inverse.
2. **Lancer** `npm run scenarios` (= `tsx --env-file=.env scripts/scenarios.ts`). Vrais appels
   Messages API, vraie clé `.env` : pas une simulation.
3. **Lire chaque transcription** écrite dans `docs/scenarios/` (une par intention). Ne pas
   résumer de mémoire ce qu'on pense que l'agent a dit : lire le fichier produit.
4. **Confier chaque transcription** à l'agent `relecteur-brief`, avec le texte de la
   transcription et le `TravelBrief` final collés dans le message (pas seulement le chemin du
   fichier). Le point de vue est celui du voyageur qui organise son voyage avec ce seul carnet.
5. **Consigner le bilan** dans `docs/scenarios/relecture.md` : une ligne par intention, la note de
   `relecteur-brief`, et tout défaut cité (valeur inventée, question redondante, nuance perdue).
6. Si une intention échoue nettement (ex. formulaire déguisé détecté), ouvrir une tranche
   dédiée plutôt que de corriger en marge de ce skill.

## Critère de fin

15 transcriptions relues, 15 verdicts `relecteur-brief` consignés dans `docs/scenarios/relecture.md` avec la
date, et le coût réel de la session (pas l'estimation de l'étape 1) noté à côté.

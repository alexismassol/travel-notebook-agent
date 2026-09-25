# Relecture des 16 conversations, avec le carnet pour seul repère

## À quoi sert ce document

Les taux disent combien de fois l'agent réussit. Ils ne disent pas si le carnet que le voyageur
télécharge est bon. Ce document comble ce trou.

Les 16 conversations mesurées le 2026-09-25 ont été relues mot à mot. Le point de vue retenu est
celui du voyageur qui organise son voyage avec ce seul carnet, sans recherche externe ni rappel
possible.

Une première relecture, sur 7 conversations, avait déjà trouvé trois vrais défauts que les taux ne
montraient pas. Une période affichée « juin 2026 » alors que les dates avaient été décalées en
2027. « Une dizaine de jours » enregistré comme une durée confirmée. Et « on part de Paris » qui ne
laissait aucune trace dans le carnet. Les trois sont corrigés depuis (décisions 18, 19 et 20).

## Comment elle a été faite

Un agent de relecture (`.claude/agents/relecteur-brief.md`, lecture seule) lit chaque transcription
et le carnet final. Il se met à la place du voyageur qui repart avec ce seul document.

La campagne du 2026-09-25 a rejoué 16 scénarios sur 3 passages chacun, 48 conversations réelles au
total. Cette relecture porte sur le premier passage de chaque scénario, celui que
`docs/scenarios/README.md` renvoie en transcription.

Chaque citation notée « faute » a ensuite été revérifiée à la main dans le fichier, mot pour mot.
Une citation introuvable fait redescendre le verdict à « à revoir », jamais l'inverse.

## Comment lire le tableau

Chaque ligne du tableau est un scénario, avec un lien vers sa transcription complète. Les cinq
colonnes viennent de la grille de lecture de l'agent relecteur, avec trois verdicts possibles.

| Verdict | Ce que ça veut dire |
|---|---|
| **bon** | Rien à redire sur ce point, même si le carnet reste volontairement incomplet à ce stade |
| **à revoir** | Un point plus léger, ou un comportement à surveiller : rien de faux, mais pas encore ce qu'on veut |
| **faute** | Un vrai défaut : le voyageur lirait quelque chose de faux, perdu ou présenté à tort comme sûr |

Les cinq colonnes, dans l'ordre du tableau :

- **Exploitable** : le carnet permet-il d'organiser le voyage avec ces seules informations ?
- **Valeurs inventées** : une valeur non dite est-elle affichée comme sûre ?
- **Nuances perdues** : une nuance du voyageur a-t-elle disparu du carnet ?
- **Questions redondantes** : une question déjà répondue revient-elle plus tard ?
- **Affirmation sans recherche** : une saison ou une formalité est-elle donnée comme un fait sans
  recherche visible ?

Un taux cité vient toujours de `docs/scenarios/README.md`, qui fait foi.

## Synthèse

| Scénario | Exploitable | Valeurs inventées | Nuances perdues | Questions redondantes | Affirmation sans recherche |
|---|---|---|---|---|---|
| [1. Destination ouverte, en famille](1-destination-ouverte-famille.md) | à revoir | faute | à revoir | à revoir | à revoir |
| [2. Informations déjà complètes](2-infos-completes.md) | à revoir | faute | faute | bon | faute |
| [3. Demande de conseil qui se heurte à la réalité](3-conseil-trek-nepal.md) | bon | bon | bon | bon | bon |
| [4. Envie floue à ancrer](4-envie-floue-zanzibar.md) | bon | bon | bon | bon | bon |
| [5. Dépaysement sans la foule](5-depaysement-sans-la-foule.md) | à revoir | à revoir | à revoir | bon | à revoir |
| [6. Contradiction dans la durée](6-contradiction.md) | bon | faute | bon | à revoir | faute |
| [7. Composition variable](7-composition-variable.md) | bon | bon | bon | bon | faute |
| [8. Le voyageur pose les questions](8-le-voyageur-interroge.md) | à revoir | à revoir | faute | bon | à revoir |
| [9. Tout donné dès le premier message](9-tout-dun-coup.md) | bon | bon | bon | bon | bon |
| [10. Le voyageur ne sait pas et le dit](10-je-ne-sais-pas.md) | bon | bon | faute | faute | bon |
| [11. Le voyageur hésite à partir](11-pas-sur-de-partir.md) | bon | bon | bon | bon | bon |
| [12. Demande hors sujet, puis retour au voyage](12-hors-sujet-puis-retour.md) | bon | bon | bon | bon | faute |
| [13. Le voyageur se contredit dans la même phrase](13-contradictions-dans-une-phrase.md) | bon | bon | bon | bon | bon |
| [14. Le voyageur pressé veut son carnet tout de suite](14-voyageur-presse.md) | à revoir | bon | faute | faute | à revoir |
| [15. Le voyageur écrit en anglais](15-voyageur-en-anglais.md) | bon | bon | faute | bon | bon |
| [16. Le voyageur veut être surpris](16-surprenez-moi.md) | à revoir | bon | à revoir | bon | bon |

## Par scénario

**1. Destination ouverte, en famille** (`1-destination-ouverte-famille.md`). Le voyageur écrit :
« On veut du soleil en famille cet hiver, mais on sait pas où. » Deux tours plus tard, la
destination reste ouverte, ce que le carnet reconnaît lui-même : « manque : destination encore
ouverte ». Normal à ce stade.

Le voyageur dit aussi : « Plutôt pendant les vacances de février, une dizaine de jours, on part de
Paris. » Le mot « Plutôt » porte un doute. Le carnet l'ignore pour les dates, notées
« [confirmed] », mais le garde pour la durée, notée « [vague] » : faute.

L'agent annonce deux précisions à venir, puis n'en pose qu'une, l'âge des enfants. Il repose
aussitôt l'âge et le nombre d'enfants dans une question à choix. Une recherche a bien lieu avant les
fiches climat. Mais la mesure du tour affiche « 0 recherche(s) », comme le total final : le
voyageur ne peut pas vérifier ces chiffres.

**2. Informations déjà complètes** (`2-infos-completes.md`). Le voyageur donne tout en un
message : « Vietnam, 3 semaines en novembre, on est 2, budget ~4000€. » Le carnet atteint 4/4 dès
ce tour, mais range le budget en « inconnu » : à revoir.

L'agent demande : « votre budget de 4000€, c'est par personne ou pour vous deux ? » Le voyageur ne
répond jamais par écrit. Le récapitulatif affiche pourtant : « avec un budget d'environ 4000€. »
Une question sans réponse écrite devient un chiffre présenté comme sûr : faute.

Le carnet note aussi « envies : bonne saison » sous la destination. Ce sont les mots de l'agent, pas
ceux du voyageur, qui n'a jamais dit « bonne saison » : faute.

Le « ~ » du voyageur disait un ordre de grandeur, pas un chiffre arrêté. Le carnet garde « Nuances
notées : 0 » : cette approximation disparaît sans laisser de trace : faute.

Aucune recherche n'a lieu sur ce tour. L'agent affirme pourtant : « c'est une excellente période.
Vous avez trois semaines pour explorer le pays en bonne saison. » Faute : rien ne l'appuie.

**3. Demande de conseil qui se heurte à la réalité** (`3-conseil-trek-nepal.md`). Un seul
message : « Le trek au Népal en juillet, c'est jouable ? » Le carnet reste à 2/4, et le dit sans
détour : bon.

Aucune valeur ne dépasse ce qui est dit. La recherche a lieu avant toute affirmation sur la mousson.
L'agent écrit : « Le pire de la mousson se situe en juillet et août : fortes pluies, peu de
visibilité, boue et sangsues. » La seule question posée porte sur un point neuf, la composition du
voyage.

**4. Envie floue à ancrer** (`4-envie-floue-zanzibar.md`). Le voyageur demande seulement :
« C'est où Zanzibar ? Ça ressemble à quoi ? » Le carnet reste à 0/4, ce qui est honnête après une
simple question de découverte.

La recherche a lieu avant la fiche et sa saison. La seule question de fin, sur l'intérêt du
voyageur pour Zanzibar, ne redemande rien de déjà su.

**5. Dépaysement sans la foule** (`5-depaysement-sans-la-foule.md`). Le voyageur écrit : « Un truc
dépaysant mais sans les foules, en mai, deux semaines à deux. » La destination reste ouverte entre
deux fiches, et le carnet le dit : à revoir, normal à ce stade.

Le voyageur dit « à deux », le carnet note « 2 adultes ». Le mot « adultes » n'a jamais été dit : à
revoir.

Les envies « dépaysant, sans les foules » sont notées sous la destination, mais « Nuances notées :
0 ». Un voyageur qui relit ces deux lignes peut croire que ses mots n'ont pas compté : à revoir.

Une troisième destination, la Roumanie, est annoncée sans recherche visible à son nom. Elle n'est
heureusement jamais montrée avec un contenu : à revoir plutôt que faute.

**6. Contradiction dans la durée** (`6-contradiction.md`). Le voyageur dit : « On part 3 semaines
en Grèce en juin, on sera 4 adultes. » Puis il se ravise : « Finalement ce sera plutôt 10 jours. »
Le carnet atteint 4/4 : bon, de quoi commencer à organiser le voyage.

Le carnet tranche en silence : « duration [confirmed] 9 nuits ». Rien ne garde trace des 3 semaines
ni du changement d'avis : faute. Un voyageur qui relit son carnet plus tard ne peut pas savoir qu'il
y a eu une hésitation.

Le carnet affiche aussi « dates [confirmed] juin 2027 ». Ni l'un ni l'autre message ne mentionne
d'année : faute, même si 2027 reste une année à venir cohérente.

Aucun style ni aucune envie n'est dit dans les deux messages, donc « Nuances notées : 0 » est
fidèle : bon.

La relance sur la ville de départ et le budget revient presque mot pour mot au tour 2. Pourtant le
voyageur n'a rien dit sur ce point entre les deux tours : à revoir.

L'agent affirme : « La Grèce en juin, c'est parfait : le climat est beau et il n'y a pas encore les
foules de juillet-août. » La mesure du même tour indique « 0 recherche(s) » : faute.

**7. Composition variable** (`7-composition-variable.md`). Le voyageur dit : « On part à Bali, 10
jours en juin, mais on sera 4 ou 6 personnes, ça dépend des amis. » Le carnet garde
« travellers [vague] », sans forcer un chiffre : bon.

La seule question posée porte justement sur ce point resté ouvert, le nombre de personnes. Aucune
nuance n'est perdue : rien d'autre n'était dit dans ce message.

L'agent affirme pourtant : « Bali en juin, c'est une excellente période. » La mesure du tour indique
« 0 recherche(s) », et aucun outil de recherche n'apparaît dans les décisions de l'agent : faute.

**8. Le voyageur pose les questions** (`8-le-voyageur-interroge.md`). Sur quatre tours, la
destination reste ouverte entre Sri Lanka et Thaïlande, ce que le carnet reconnaît : « Le brief
n'est pas complet. » À revoir, la conversation s'arrête avant un choix.

Le voyageur dit : « On est deux, une semaine, on part de Lyon. » « une semaine » est courant mais
imprécis. Le carnet retient « duration [confirmed] 6 nuits », un chiffre exact jamais dit : à
revoir.

Le voyageur demande : « Le décalage horaire c'est gérable ? » L'agent répond : « je vais vous
répondre sur le décalage horaire », puis enchaîne sur une autre question sans jamais y revenir.
« Nuances notées : 0 » le confirme : faute, une vraie question du voyageur disparaît sans réponse.

Chaque tour pose une question neuve, sans redemander une information déjà donnée : bon.

Le premier tour affirme : « Février au soleil, c'est une excellente période » avec « 0
recherche(s) » sur ce même tour : à revoir. Les tours suivants appuient chaque affirmation
climatique sur une recherche visible.

**9. Tout donné dès le premier message** (`9-tout-dun-coup.md`). Le voyageur écrit : « Vietnam, 3
semaines en novembre, à deux, budget 4 000 €. » Le carnet atteint 4/4 dès ce message, budget
compris : bon, de quoi organiser un premier itinéraire.

Chaque valeur confirmée correspond mot pour mot à cette phrase, sans rien ajouter. Aucun style ni
aucune envie n'étant dit, « Nuances notées : 0 » est exact.

La recherche a lieu avant l'affirmation sur la saison de novembre, avec deux sources citées. La
seule question posée, sur la ville de départ, porte sur un point neuf.

**10. Le voyageur ne sait pas et le dit** (`10-je-ne-sais-pas.md`). Après quatre tours de « je
sais pas » et « peu importe », le carnet reste à 0/4 pour les quatre champs obligatoires. C'est
honnête : rien n'est inventé.

Au tour 4, le voyageur dit : « J'ai pas vraiment de budget en tête. » L'agent répond : « Pas de
budget spécifique, c'est noté. » Le carnet final ne garde pourtant qu'une seule nuance, celle du
tour 3 : faute, la phrase sur le budget disparaît malgré le « c'est noté ».

Au tour 2, le voyageur répond « Je sais pas » à la question sur la période. Trois tours plus tard,
l'agent redemande : « et quand pensez-vous partir ? » : faute, une question déjà répondue revient.

Aucune destination n'étant nommée, l'agent n'affirme rien sur une saison ou une formalité : bon,
cohérent avec zéro recherche sur les quatre tours.

**11. Le voyageur hésite à partir** (`11-pas-sur-de-partir.md`). Le voyageur dit : « Je sais même
pas si je vais partir cette année, j'hésite. » Puis : « C'est surtout une question d'argent, et je
suis fatigué en ce moment. » Le carnet reste à 0/4, et le dit : « Le brief n'est pas complet. »

Deux champs utiles sont confirmés, « style [confirmed] repos » et « constraints [confirmed] budget
limité », chacun fidèle à une phrase du voyageur : bon.

Une seule nuance est gardée, « fatigué en ce moment » : le mot du tour 1, « j'hésite », ne devient
pas une nuance à part. Mais rien d'autre n'était à garder dans ces deux phrases factuelles.

L'agent pose une seule question ouverte, sur ce qui freine le voyageur, sans la reposer au tour
suivant. Aucune destination n'étant en jeu, aucune affirmation de saison ou de formalité
n'apparaît : cohérent avec zéro recherche sur les deux tours.

**12. Demande hors sujet, puis retour au voyage** (`12-hors-sujet-puis-retour.md`). Le voyageur
demande d'abord un poème sur la mer. L'agent refuse en une phrase et relance sur le voyage : bon,
rien de superflu.

Le voyageur répond alors : « Je veux partir en Grèce en septembre, on est trois. » Les trois
informations sont enregistrées ensemble, sans retour sur ce qui est déjà su. Le carnet atteint 3/4
et le dit : « Le brief n'est pas complet. »

L'agent affirme : « La Grèce en septembre, c'est très agréable : la mer est encore chaude et les
foules de l'été diminuent. » Sur ce scénario précis, aucune recherche n'a lieu sur les trois
passages de la campagne, recherche web 0/3 (`docs/scenarios/README.md`) : faute.

**13. Le voyageur se contredit dans la même phrase** (`13-contradictions-dans-une-phrase.md`). Le
voyageur écrit : « On part deux semaines, enfin non plutôt quatre jours, en juin ou peut-être
septembre. » Le carnet reste à 0/4 et le dit : « Le brief n'est pas complet. »

Le nombre de voyageurs n'est jamais dit dans cette phrase. Le carnet le note « [inferred] », jamais
confirmé, avec la mention « à confirmer » : bon, rien n'est affiché comme sûr à tort.

L'agent reprend mot pour mot les deux durées données pour aider à trancher. Il demande :
« Penchez-vous plutôt pour un court séjour de quatre jours, ou une plus longue pause de deux
semaines ? » Ce n'est ni une question neuve mal choisie, ni une redite.

**14. Le voyageur pressé veut son carnet tout de suite** (`14-voyageur-presse.md`). Le voyageur
écrit : « Bali. Juillet. 2 pers. Fais-moi le carnet. » Après deux tours, la durée reste vide :
« duration [unknown] - » : à revoir, le carnet ne suffit pas encore.

La seule valeur confirmée, la destination, reprend mot pour mot ce qui est dit : bon.

Le voyageur répète : « Non, fais-le maintenant. » Le carnet garde pourtant « Nuances notées : 0 » :
faute, cette impatience répétée ne laisse aucune trace.

L'agent redemande une confirmation du nombre de voyageurs, pourtant déjà donné dans le tout premier
message, « 2 pers. » Il repose aussi la question sur la durée presque mot pour mot après le refus
du voyageur d'y répondre : faute.

Une recherche précède bien l'affirmation sur la saison sèche de juillet. Mais la phrase sur « la
haute saison touristique, coïncidant avec les vacances scolaires » dépasse ce que cette recherche
couvrait : à revoir.

**15. Le voyageur écrit en anglais** (`15-voyageur-en-anglais.md`). Le voyageur écrit en anglais :
« I want to go somewhere warm in February with my two kids, we are based in Paris. » Le carnet
atteint 1/4 dès ce tour et le dit : bon.

Les deux champs confirmés, le mois et la ville de départ, reprennent mot pour mot cette phrase. Le
nombre de voyageurs, jamais dit comme tel, reste « [inferred] » plutôt que confirmé : bon.

L'envie « somewhere warm » n'est notée que sous la destination, « envies : soleil, chaleur ».
Ailleurs, budget, style et intérêts restent « [unknown] », et « Nuances notées : 0 ». Faute : le
critère qui devrait guider le choix de destination ne ressort nulle part comme nuance.

L'agent ne redemande ni le mois ni la ville, déjà donnés dans la même phrase, et concentre sa
relance sur les deux seuls points manquants : bon. Aucune affirmation de saison n'est faite dans ce
tour, cohérent avec zéro recherche.

**16. Le voyageur veut être surpris** (`16-surprenez-moi.md`). Le voyageur écrit : « Surprenez-moi :
dix jours en mars, on est trois amis et on a déjà fait les grandes capitales d'Europe. » Trois
destinations sont proposées, mais aucune n'est retenue à la fin de ce premier tour : à revoir.

Les trois valeurs confirmées, mars, 9 nuits et 3 amis, reprennent mot pour mot cette phrase, sans
rien ajouter : bon.

Le mot d'ouverture, « Surprenez-moi », porte l'esprit de tout le message : sortir des sentiers
battus. Le carnet ne garde qu'une seule nuance, « déjà fait les grandes capitales d'Europe » : à
revoir, l'envie de surprise elle-même ne laisse pas de trace.

L'agent enchaîne directement sur le choix entre les trois destinations, sans reposer une question
déjà répondue : bon. La recherche précède bien les trois descriptions de climat en mars.

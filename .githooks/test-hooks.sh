#!/usr/bin/env bash
# Matrice de test des hooks commit-msg et pre-commit.
#
# Chaque cas cree un depot jetable neuf (git init), y installe une COPIE des
# deux hooks (core.hooksPath local a ce depot), stage ce qu'il faut, puis
# lance un vrai `git commit` : c'est le pipeline reel de git (pre-commit puis
# commit-msg) qui est exerce, pas un appel direct au script. Un hook non
# teste de cette facon est un hook faux.
#
# Un depot par cas, jamais reutilise ni nettoye par reset/clean : plus simple
# et plus sur qu'un depot partage, et ca evite le piege du test intermittent
# (un cas qui depend de l'etat laisse par le cas precedent).
#
# Le repertoire de base des depots jetables est configurable via la variable
# d'environnement TEST_HOOKS_DIR (utile pour les pointer vers le scratchpad
# de la session) ; a defaut, mktemp -d choisit un repertoire temporaire du
# systeme. Aucun chemin de session n'est code en dur ici : ce script est
# versionne et doit rester utilisable sur n'importe quel poste.
#
# SKIP_BIOME_IN_TESTS=1 est positionne pour toute la matrice : un depot
# jetable n'a pas de node_modules, `npx biome` n'y tourne pas. Le controle
# biome du pre-commit n'est donc PAS exerce par cette matrice : voir le
# controle 4 de pre-commit, et la mention en fin de rapport.
#
# Usage : bash .githooks/test-hooks.sh
#         TEST_HOOKS_DIR=/chemin/vers/scratchpad bash .githooks/test-hooks.sh

set -uo pipefail

HOOKS_SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMIT_MSG_HOOK="$HOOKS_SRC_DIR/commit-msg"
PRE_COMMIT_HOOK="$HOOKS_SRC_DIR/pre-commit"

BASE="${TEST_HOOKS_DIR:-$(mktemp -d)}"
mkdir -p "$BASE"

export SKIP_BIOME_IN_TESTS=1

ok=0
ko=0

# run_case <attendu:PASSE|BLOQUE> <libelle> <message> [fichier=contenu ...]
#
# Chaque "fichier=contenu" cree ce fichier dans le depot jetable et le stage.
# Sans argument de fichier, le commit est force vide (--allow-empty) pour que
# les hooks se declenchent malgre l'absence de changement reel.
run_case() {
  local attendu="$1" libelle="$2" mensaje="$3"
  shift 3

  local repo
  repo="$(mktemp -d "$BASE/repo.XXXXXX")"

  git -C "$repo" init -q
  git -C "$repo" config user.email "test-hooks@example.invalid"
  git -C "$repo" config user.name "Test Hooks"

  mkdir -p "$repo/.githooks"
  cp -- "$COMMIT_MSG_HOOK" "$repo/.githooks/commit-msg"
  cp -- "$PRE_COMMIT_HOOK" "$repo/.githooks/pre-commit"
  chmod +x "$repo/.githooks/commit-msg" "$repo/.githooks/pre-commit"
  git -C "$repo" config core.hooksPath .githooks

  local spec fichier contenu
  for spec in "$@"; do
    fichier="${spec%%=*}"
    contenu="${spec#*=}"
    mkdir -p "$repo/$(dirname "$fichier")"
    printf '%s\n' "$contenu" > "$repo/$fichier"
    git -C "$repo" add -- "$fichier"
  done

  local resultat
  if [ "$#" -eq 0 ]; then
    if git -C "$repo" commit -q --allow-empty -m "$mensaje" >/dev/null 2>&1; then
      resultat="PASSE"
    else
      resultat="BLOQUE"
    fi
  else
    if git -C "$repo" commit -q -m "$mensaje" >/dev/null 2>&1; then
      resultat="PASSE"
    else
      resultat="BLOQUE"
    fi
  fi

  if [ "$resultat" = "$attendu" ]; then
    printf '  ok    %-7s %s\n' "$resultat" "$libelle"
    ok=$((ok + 1))
  else
    printf '  ECHEC attendu=%s obtenu=%s : %s\n' "$attendu" "$resultat" "$libelle"
    ko=$((ko + 1))
  fi

  rm -rf "$repo"
}

# Cle Anthropic factice, construite dynamiquement pour ne jamais faire
# apparaitre dans ce fichier une chaine litterale qui ressemble a une vraie
# cle (ce script sera lui-meme un jour stage, et il ne doit pas se faire
# bloquer par son propre controle).
SUFFIXE_LONG="$(printf 'A%.0s' $(seq 1 30))"
CLE_FACTICE="sk-ant-${SUFFIXE_LONG}"

echo "=== commit-msg : forme du message ==="
run_case BLOQUE "type inconnu"                   "feature: add donation endpoint"
run_case BLOQUE "deux points manquants"          "feat add donation endpoint"
run_case BLOQUE "sujet trop long"                "feat: add a donation endpoint with a subject line that goes far beyond the limit"
run_case BLOQUE "point final"                    "feat: add donation endpoint."
run_case BLOQUE "majuscule apres les deux points" "fix: Handle Stripe webhook"
run_case BLOQUE "Co-Authored-By dans le corps"   "feat: add donation endpoint

Co-Authored-By: Quelqu un <x@y.z>"
run_case BLOQUE "Co-Authored-By malgre skip docs, casse differente" "chore: broutille [skip docs]

co-authored-by: quelqu un <x@y.z>"

run_case PASSE "sujet valide simple"             "feat: add donation endpoint"
run_case PASSE "sujet avec portee"               "fix(stripe): handle duplicate webhook"
run_case PASSE "nom propre au milieu de la phrase" "fix: handle Stripe webhook replay"
run_case PASSE "message de merge"                "Merge branch 'main' into feature/donations"
run_case PASSE "message de revert"               "Revert \"feat: add donation endpoint\""
run_case PASSE "fixup de rebase"                 "fixup! feat: add donation endpoint"
run_case PASSE "squash de rebase"                "squash! feat: add donation endpoint"

echo "=== commit-msg : hors coeur de l'agent, aucune doc exigee ==="
run_case PASSE "src/web seul sans doc"           "feat: tweak web component" \
  "src/web/zz-test-hook-temporaire.tsx=// fichier temporaire de test du hook"
run_case PASSE "scripts/ seul sans doc"          "chore: add helper script" \
  "scripts/zz-test-hook-temporaire.ts=// fichier temporaire de test du hook"
run_case PASSE ".claude/skills/ seul sans doc"   "chore: tweak skill notes" \
  ".claude/skills/zz-test-hook-temporaire/SKILL.md=fichier temporaire de test du hook"
run_case PASSE "commit docs seulement"           "docs: update notes" \
  "docs/zz-test-hook-temporaire.md=fichier temporaire de test du hook"
run_case PASSE "rien d indexe"                   "chore: empty"

echo "=== commit-msg : docs a jour (coeur de l'agent) ==="
run_case BLOQUE "agent/ sans doc"                "feat: touch agent core" \
  "src/server/agent/zz-test-hook-temporaire.ts=// fichier temporaire de test du hook"
run_case BLOQUE "shared/ sans doc"               "feat: touch shared contract" \
  "src/shared/zz-test-hook-temporaire.ts=// fichier temporaire de test du hook"
run_case BLOQUE "agent/ avec une doc hors liste" "feat: touch agent core with notes" \
  "src/server/agent/zz-test-hook-temporaire.ts=// fichier temporaire de test du hook" \
  "docs/zz-test-hook-temporaire.md=fichier temporaire de test du hook"

run_case PASSE "agent/ avec spec-technique"      "feat: touch agent core with doc" \
  "src/server/agent/zz-test-hook-temporaire.ts=// fichier temporaire de test du hook" \
  "docs/spec-technique.md=notes de test du hook"
run_case PASSE "agent/ avec [skip docs]"         "chore: tweak agent internals [skip docs]" \
  "src/server/agent/zz-test-hook-temporaire.ts=// fichier temporaire de test du hook"
run_case PASSE "agent/ avec choix-techniques"    "feat: touch agent core with choix" \
  "src/server/agent/zz-test-hook-temporaire.ts=// fichier temporaire de test du hook" \
  "docs/choix-techniques.md=notes de test du hook"
run_case PASSE "agent/ et shared/ ensemble, un seul doc suffit" \
  "feat: touch agent and shared together" \
  "src/server/agent/zz-test-hook-temporaire.ts=// fichier temporaire de test du hook" \
  "src/shared/zz-test-hook-temporaire.ts=// fichier temporaire de test du hook" \
  "docs/architecture.md=notes de test du hook"

echo "=== pre-commit : .env ==="
run_case BLOQUE ".env stage"                     "chore: local env" \
  ".env=ANTHROPIC_API_KEY=xxx"
run_case BLOQUE ".env.local stage"               "chore: local env" \
  ".env.local=ANTHROPIC_API_KEY=xxx"
run_case PASSE  ".env.example stage"             "chore: add env example" \
  ".env.example=ANTHROPIC_API_KEY=REMPLACER_ICI"

echo "=== pre-commit : cle Anthropic ==="
run_case BLOQUE "cle Anthropic factice dans un fichier" "chore: notes internes" \
  "notes/zz-test-hook-temporaire.txt=avant ${CLE_FACTICE} apres"
run_case PASSE  "sk-ant- trop court pour matcher" "chore: notes internes courtes" \
  "notes/zz-test-hook-temporaire-court.txt=le prefixe sk-ant-abc123 est trop court"

echo "=== pre-commit : documents de travail non verses ==="
run_case BLOQUE "note de travail de resources/ stage" "chore: update brief" \
  "resources/zz-test-hook-temporaire.md=contenu de travail"
run_case BLOQUE "pdf de resources/ stage"        "chore: add resource" \
  "resources/zz-test-hook-temporaire.pdf=contenu factice"

echo
echo "bilan : $ok ok, $ko echec(s)"
[ "$ko" -eq 0 ]

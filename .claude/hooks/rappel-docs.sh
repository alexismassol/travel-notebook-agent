#!/usr/bin/env bash
# Stop hook Claude Code du projet. Rappelle une seule fois par arret de tour
# de mettre a jour docs/ quand le code a bouge sans que docs/ ait suivi.
#
# Installation : declare dans .claude/settings.json sur l'evenement Stop.
# Pris en compte au PROCHAIN lancement de `claude`, pas dans une session en
# cours. Apres une copie hors git, verifier le chmod +x.
#
# Doit ne JAMAIS echouer bruyamment : toute defaillance (pas de git, pas de
# depot, JSON illisible sur stdin) sort silencieusement en 0. Un hook qui
# plante ou pollue stdout casse l'arret de Claude Code, pas seulement le
# rappel.

set -uo pipefail

INPUT="$(cat 2>/dev/null || true)"

# --- anti-boucle : ce hook a deja fait relancer Claude une fois -> laisser passer ---
# Sans ce garde-fou, un blocage qui persiste ferait boucler Stop indefiniment
# (Claude Code abandonne de lui-meme apres 8 blocages consecutifs, mais ce
# hook ne doit jamais compter sur cette limite).
if printf '%s' "$INPUT" | grep -o '"stop_hook_active"[[:space:]]*:[[:space:]]*true' >/dev/null 2>&1; then
  exit 0
fi

# --- doit etre dans un depot git ; sinon rien a comparer ---
RACINE="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -z "$RACINE" ] && exit 0
cd "$RACINE" 2>/dev/null || exit 0

# --untracked-files=all force git a lister le CHEMIN de chaque fichier non
# suivi plutot que de regrouper tout un repertoire neuf en une seule ligne
# ("?? src/" au lieu de "?? src/server/agent/nouveau.ts") - sans quoi un
# fichier neuf dans un repertoire neuf passe sous le radar (bug constate en
# testant ce hook : cas "fichier untracked dans un repertoire neuf").
# Le cout de -all est borne aux pathspecs ci-dessous (pas le depot entier) :
# Une regle du poste interdit -uall sur un `git status` non borne pour cette
# raison, mais un scan borne a 5 repertoires n'a pas ce cout.
STATUT="$(git status --porcelain --untracked-files=all -- \
  src/server/agent src/shared src/web scripts docs 2>/dev/null || true)"
[ -z "$STATUT" ] && exit 0

# git status --porcelain prefixe chaque ligne de 3 caracteres (" M ", "?? ",
# "A  ", etc.) : on retire ce prefixe plutot que de decouper sur l'espace,
# qui casserait sur un chemin contenant un espace.
FICHIERS="$(printf '%s\n' "$STATUT" | while IFS= read -r ligne; do
  [ -z "$ligne" ] && continue
  printf '%s\n' "${ligne:3}"
done)"

CODE_TOUCHE=0
DOC_TOUCHE=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    src/server/agent/*|src/shared/*|src/web/*|scripts/*)
      CODE_TOUCHE=1 ;;
  esac
  case "$f" in
    docs/*)
      DOC_TOUCHE=1 ;;
  esac
done <<< "$FICHIERS"

# Rien touche cote code, ou docs/ a deja suivi : rien a signaler.
if [ "$CODE_TOUCHE" -eq 0 ] || [ "$DOC_TOUCHE" -eq 1 ]; then
  exit 0
fi

RAISON="Code modifié sans mise à jour de docs/ : lance l'agent gardien-docs (.claude/agents/gardien-docs.md) ou justifie."
printf '{"decision":"block","reason":"%s"}\n' "$RAISON"
exit 0

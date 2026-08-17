#!/usr/bin/env bash
# Recale le clone du homelab qui sert le site sur origin/main, pour que le flux "veille"
# régénéré par .github/workflows/veille.yml (2x/jour, ou lancé à la main) apparaisse sans
# intervention manuelle. Pensé pour tourner en cron toutes les 5-15 min (voir crontab
# d'exemple plus bas) : la latence entre le push de l'Action et le prochain tick de cron
# est le seul délai qui reste.
set -euo pipefail

# Se place dans le repo quel que soit le répertoire d'où cron lance le script (cron ne
# fixe aucun CWD particulier, contrairement à un lancement manuel depuis un terminal).
cd "$(dirname "$(readlink -f "$0")")/.."

# Empêche deux exécutions concurrentes : si un tick chevauche le précédent (réseau lent,
# gros pull d'images...), deux `git pull` simultanés sur le même clone pourraient se
# marcher dessus.
LOCK="/tmp/homelab-pull-portfolio.lock"
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "$(date -Is) déjà en cours, on saute ce tick."
  exit 0
fi

BRANCH="main"
git fetch origin "$BRANCH" --quiet

LOCAL=$(git rev-parse "$BRANCH")
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0  # rien de neuf : silence total pour ne pas polluer les logs cron à chaque tick
fi

echo "$(date -Is) nouveau contenu détecté ($LOCAL -> $REMOTE), pull..."
# --ff-only : ce clone ne doit jamais diverger d'origin (rien n'y est édité localement) ;
# un fast-forward impossible est un signal à regarder à la main, pas un cas à fusionner
# automatiquement.
git pull --ff-only origin "$BRANCH"
echo "$(date -Is) à jour sur $(git rev-parse --short HEAD)."

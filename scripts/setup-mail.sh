#!/usr/bin/env bash
# One-time setup: gives the production server its Gmail login so sign-up / password-reset codes are actually emailed.
# Usage:   bash scripts/setup-mail.sh                 (asks for the app password, input hidden)
#     or:  SMTP_PASS='abcd efgh ijkl mnop' bash scripts/setup-mail.sh
# Needs the GitHub CLI logged in (gh auth status). The password is stored ONLY as a GitHub Actions secret.
set -euo pipefail
cd "$(dirname "$0")/.."
U="${SMTP_USER:-chinmaya.dob1999@gmail.com}"
P="${SMTP_PASS:-}"
if [ -z "$P" ]; then read -r -s -p "Gmail app password for $U (input hidden): " P; echo; fi
[ -n "$P" ] || { echo "No password given"; exit 1; }
printf '%s' "$U" | gh secret set SMTP_USER
printf '%s' "$P" | gh secret set SMTP_PASS
echo "Secrets saved. Starting a deploy so the server picks them up…"
gh workflow run ci-cd.yml --ref main
sleep 6
ID=$(gh run list --workflow ci-cd.yml -L 1 --json databaseId -q '.[0].databaseId')
echo "Deploy run: https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/actions/runs/$ID"
gh run watch "$ID" --exit-status --interval 15 >/dev/null && echo "DONE: sign-up emails are live. Try registering in the app." || echo "Deploy did not finish cleanly — open the run link above."

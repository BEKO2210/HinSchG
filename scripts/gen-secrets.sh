#!/usr/bin/env bash
# HinSchG — erzeugt eine .env mit frischen, zufaelligen Secrets.
# Wird von `make setup` aufgerufen. Ueberschreibt eine vorhandene .env NICHT.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  echo ".env existiert bereits — es werden keine neuen Secrets erzeugt."
  echo "Loeschen Sie die Datei manuell, wenn Sie neu generieren wollen."
  exit 0
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "Fehler: openssl wird benoetigt, ist aber nicht installiert." >&2
  exit 1
fi

MASTER_ENCRYPTION_KEY="$(openssl rand -base64 32)"
SESSION_SECRET="$(openssl rand -base64 48)"
# Postgres-Passwort ohne Sonderzeichen, damit es problemlos in die URL passt.
POSTGRES_PASSWORD="$(openssl rand -hex 24)"

cat > .env <<EOF
# Von scripts/gen-secrets.sh erzeugt. Secrets NICHT committen oder weitergeben.

# --- Domain / TLS (bitte anpassen) -------------------------------------------
DOMAIN=meldungen.example.org
ACME_EMAIL=admin@example.org

# --- Datenbank ---------------------------------------------------------------
POSTGRES_USER=hinschg
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=hinschg
DATABASE_URL=postgresql://hinschg:${POSTGRES_PASSWORD}@db:5432/hinschg?schema=public

# --- Verschluesselung & Sessions ---------------------------------------------
# WICHTIG: MASTER_ENCRYPTION_KEY zusaetzlich separat sichern. Geht er verloren,
# sind die verschluesselten Inhalte nicht mehr lesbar.
MASTER_ENCRYPTION_KEY=${MASTER_ENCRYPTION_KEY}
SESSION_SECRET=${SESSION_SECRET}

# --- Aufbewahrung ------------------------------------------------------------
CASE_RETENTION_DAYS=0
EOF

chmod 600 .env
echo ".env wurde mit frischen Secrets erstellt (Rechte 600)."
echo "Bitte DOMAIN und ACME_EMAIL anpassen, dann 'make up'."

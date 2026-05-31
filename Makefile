# HinSchG — Make-Targets für das Self-Hosting (Produktion)

COMPOSE = docker compose -f docker-compose.prod.yml

.PHONY: help setup up down logs migrate seed backup ps

help: ## Diese Übersicht anzeigen
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-10s %s\n", $$1, $$2}'

setup: ## .env mit frischen Secrets erzeugen (überschreibt nichts)
	./scripts/gen-secrets.sh

up: ## Bauen und im Hintergrund starten (App + DB + Caddy/TLS)
	$(COMPOSE) up -d --build

down: ## Dienste stoppen
	$(COMPOSE) down

ps: ## Status der Dienste
	$(COMPOSE) ps

logs: ## Logs folgen
	$(COMPOSE) logs -f

migrate: ## Datenbank-Migrationen anwenden (prisma migrate deploy)
	$(COMPOSE) run --rm migrate npx prisma migrate deploy

seed: ## Demo-Meldestelle + Admin anlegen (SEED_ADMIN_PASSWORD erforderlich)
	$(COMPOSE) run --rm -e SEED_ADMIN_PASSWORD migrate npx prisma db seed

backup: ## Datenbank-Dump nach backup_<timestamp>.sql schreiben
	@set -a; . ./.env; set +a; \
	$(COMPOSE) exec -T db pg_dump -U $$POSTGRES_USER $$POSTGRES_DB \
		> backup_$$(date +%Y%m%d_%H%M%S).sql && echo "Backup erstellt."

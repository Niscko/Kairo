# Kairo — atajos de desarrollo
#
# `make help` lista los objetivos disponibles.

SHELL := /bin/bash
.DEFAULT_GOAL := help
COMPOSE := docker compose

.PHONY: help
help: ## Muestra esta ayuda
	@echo "Kairo — objetivos disponibles:"
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# --- Ciclo principal -------------------------------------------------------

.PHONY: up
# Lee una variable del .env con valor por defecto. `make` no carga el .env por
# sí solo, y usar $(FRONTEND_PORT) a secas expandiría a la cadena vacía.
env = $(shell grep -E '^$(1)=' .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' || true)
FRONTEND_PORT ?= $(call env,FRONTEND_PORT)
BACKEND_PORT  ?= $(call env,BACKEND_PORT)
WAIT_TIMEOUT  ?= 180

up: ## Levanta base de datos, API y web
	$(COMPOSE) up -d --build
	@echo "Esperando a que los servicios estén sanos (máx. $(WAIT_TIMEOUT)s)..."
	@$(MAKE) --no-print-directory wait
	@$(MAKE) --no-print-directory seed-if-empty
	@echo ""
	@echo "Kairo está en marcha:"
	@echo "  Web  http://localhost:$(FRONTEND_PORT)"
	@echo "  API  http://localhost:$(BACKEND_PORT)/api/health/ready"

.PHONY: down
down: ## Detiene los servicios (conserva los datos)
	$(COMPOSE) down

.PHONY: destroy
destroy: ## Detiene los servicios y BORRA el volumen de datos
	$(COMPOSE) down -v

.PHONY: restart
restart: down up ## Reinicia todo desde cero

.PHONY: wait
wait: ## Espera a que db, api y web respondan (aborta si no se Vance)
	@i=0; until [ "$$(docker inspect -f '{{.State.Health.Status}}' kairo-db 2>/dev/null)" = "healthy" ]; do \
		i=$$((i+2)); \
		if [ $$i -ge $(WAIT_TIMEOUT) ]; then \
			echo "ERROR: kairo-db no quedó healthy tras $(WAIT_TIMEOUT)s."; \
			$(COMPOSE) logs --tail=30 db; exit 1; \
		fi; sleep 2; \
	done
	@i=0; until curl -fsS --max-time 5 "http://localhost:$(BACKEND_PORT)/api/health/ready" >/dev/null 2>&1; do \
		i=$$((i+2)); \
		if [ $$i -ge $(WAIT_TIMEOUT) ]; then \
			echo "ERROR: la API no respondió en $(WAIT_TIMEOUT)s."; \
			$(COMPOSE) logs --tail=30 backend; exit 1; \
		fi; sleep 2; \
	done
	@i=0; until curl -fsS --max-time 5 "http://localhost:$(FRONTEND_PORT)/" >/dev/null 2>&1; do \
		i=$$((i+2)); \
		if [ $$i -ge $(WAIT_TIMEOUT) ]; then \
			echo "ERROR: el frontend no respondió en $(WAIT_TIMEOUT)s."; \
			$(COMPOSE) logs --tail=30 frontend; exit 1; \
		fi; sleep 2; \
	done
	@echo "Todos los servicios están sanos."

# --- Datos -----------------------------------------------------------------

.PHONY: seed
seed: ## Siembra datos de demostración (idempotente)
	$(COMPOSE) exec -T backend node dist/seed/prisma/seed.js

.PHONY: seed-if-empty
seed-if-empty: ## Siembra solo si la tabla de usuarios está vacía
	@usuarios=$$($(COMPOSE) exec -T db psql -U $${POSTGRES_USER:-kairo} -d $${POSTGRES_DB:-kairo} \
		-tAc "SELECT count(*) FROM usuarios" 2>/dev/null | tr -d '[:space:]'); \
	if [ "$$usuarios" = "0" ]; then \
		echo "Base vacía: sembrando datos de demostración..."; \
		$(MAKE) --no-print-directory seed; \
	else \
		echo "La base ya tiene $${usuarios:-?} usuarios; no se siembra."; \
	fi

.PHONY: migrate
migrate: ## Aplica las migraciones pendientes
	@echo "Las migraciones se aplican al arrancar el contenedor del backend."
	@$(COMPOSE) exec -T backend node /app/node_modules/prisma/build/index.js migrate deploy

.PHONY: migrate-dev
migrate-dev: ## Crea una migración a partir de los cambios en schema.prisma
	$(COMPOSE) exec backend pnpm run prisma:migrate:dev

.PHONY: db-reset
db-reset: ## Borra la base, la vuelve a crear, migra y siembra
	@echo "Recreando la base de datos..."
	@$(COMPOSE) exec -T db psql -v ON_ERROR_STOP=1 -U $${POSTGRES_USER:-kairo} -d postgres \
		-c "DROP DATABASE IF EXISTS $${POSTGRES_DB:-kairo} WITH (FORCE);" \
		-c "CREATE DATABASE $${POSTGRES_DB:-kairo};"
	@# El pool del backend mantiene conexiones a la base eliminada: se reinicia.
	@$(COMPOSE) restart backend >/dev/null
	@$(MAKE) --no-print-directory wait
	@$(MAKE) --no-print-directory migrate
	@$(MAKE) --no-print-directory seed

.PHONY: studio
studio: ## Abre Prisma Studio contra la base local
	@cd backend && DATABASE_URL="$$(grep '^DATABASE_URL_LOCAL=' ../.env | cut -d= -f2- | tr -d '\"')" \
		pnpm exec prisma studio

# --- Calidad ---------------------------------------------------------------

.PHONY: check
check: ## Lint, typecheck y tests en ambos paquetes
	@$(MAKE) --no-print-directory lint
	@$(MAKE) --no-print-directory typecheck
	@$(MAKE) --no-print-directory test

.PHONY: lint
lint: ## ESLint en backend y frontend
	cd backend && pnpm run lint
	cd frontend && pnpm run lint

.PHONY: typecheck
typecheck: ## TypeScript en modo estricto
	cd backend && pnpm run typecheck
	cd frontend && pnpm run typecheck

.PHONY: test
test: ## Vitest en backend y frontend
	cd backend && pnpm run test
	cd frontend && pnpm run test

.PHONY: test-e2e
test-e2e: ## Pruebas de extremo a extremo (requiere el stack en marcha)
	@# La suite e2e hace muchas peticiones desde la misma IP: con el límite
	@# normal (100 por ventana) el backend bloquearía la suite. Se levanta el
	@# backend relajando el límite; en producción la variable está en false.
	RELAJAR_RATE_LIMIT=true $(COMPOSE) up -d backend
	@$(MAKE) --no-print-directory wait
	cd frontend && pnpm run test:e2e

.PHONY: format
format: ## Aplica Prettier
	cd backend && pnpm run format
	cd frontend && pnpm run format

# --- Desarrollo -------------------------------------------------------------

.PHONY: dev-api
dev-api: ## API con recarga en caliente contra la base local
	cd backend && pnpm run dev

.PHONY: dev-web
dev-web: ## Web con recarga en caliente
	cd frontend && pnpm run dev

.PHONY: logs
logs: ## Sigue los logs de todos los servicios
	$(COMPOSE) logs -f

.PHONY: psql
psql: ## Abre psql en la base de datos
	$(COMPOSE) exec db psql -U $${POSTGRES_USER:-kairo} -d $${POSTGRES_DB:-kairo}
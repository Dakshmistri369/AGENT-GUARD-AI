.PHONY: dev test lint format backend frontend install

## Start backend (SQLite dev mode)
backend:
	cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

## Start frontend dev server
frontend:
	cd frontend && npm run dev

## Install all dependencies
install:
	pip install -r backend/requirements-dev.txt
	cd frontend && npm install

## Run backend tests
test:
	cd backend && python -m pytest tests/ -v --tb=short

## Lint backend
lint:
	cd backend && python -m ruff check app/ tests/
	cd backend && python -m bandit -r app/ -ll
	cd frontend && npx tsc --noEmit

## Format backend
format:
	cd backend && python -m ruff format app/ tests/

## Run Alembic migration (PostgreSQL)
migrate:
	cd backend && python -m alembic upgrade head

## Rollback one migration
rollback:
	cd backend && python -m alembic downgrade -1

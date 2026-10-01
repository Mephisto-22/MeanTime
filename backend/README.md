# MeanTime Backend

Django Ninja backend service running on Python 3.14 with PostgreSQL 18.

## Structure

```
backend/
├── config/
│   ├── __init__.py
│   ├── api.py          # Root Ninja API instance
│   ├── asgi.py         # ASGI application entrypoint for Uvicorn
│   ├── settings.py     # Django project settings
│   ├── urls.py         # Root URL configuration
│   └── wsgi.py         # WSGI application entrypoint
├── docker/
│   ├── Dockerfile      # Container definition based on python:3.14-slim
│   └── entrypoint.sh   # DB readiness wait, migrations, and server startup
├── tests/
│   ├── __init__.py
│   └── test_health.py  # Health check and DB integration tests
├── manage.py           # Django management CLI
└── pyproject.toml      # Dependency specifications managed with uv
```

## Running Locally

Run via Docker Compose at project root:
```bash
docker compose up --build
```

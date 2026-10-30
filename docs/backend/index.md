# Backend Developer Guide

The MeanTime backend is an asynchronous, type-safe REST API built on **Python 3.14**, **Django 5.2+**, and **Django Ninja 1.6+**, running under **Uvicorn** (ASGI) and backed by **PostgreSQL 18**.

---

## Tech Stack Overview

- **Runtime**: Python 3.14 (`python:3.14-slim`)
- **Web Framework**: Django 5.2+
- **API Framework**: [Django Ninja](https://django-ninja.dev/) 1.6+ (type hints, Pydantic schemas, auto-generated OpenAPI 3 documentation)
- **ASGI Server**: Uvicorn with `watchfiles` live reloading
- **Database Driver**: `psycopg` (v3)
- **Dependency Management**: Standard `pyproject.toml` specification managed with `uv`

---

## Directory Structure

```
backend/
├── config/                     # Project configuration root
│   ├── __init__.py
│   ├── api.py                  # Root NinjaAPI instance and mounted routers
│   ├── asgi.py                 # ASGI entrypoint for Uvicorn
│   ├── settings.py             # Django settings and INSTALLED_APPS
│   ├── urls.py                 # Root URL routing (admin/ and api/)
│   └── wsgi.py                 # WSGI entrypoint
├── docker/
│   ├── Dockerfile              # Container definition (Python 3.14 slim)
│   └── entrypoint.sh           # DB readiness check, auto-migrations, server start
├── tests/
│   ├── __init__.py
│   └── test_health.py          # API and DB integration tests
├── manage.py                   # Django CLI entrypoint
├── pyproject.toml              # Dependencies and package metadata
└── README.md                   # Backend service documentation
```

When building new domain features, create dedicated modular Django app directories inside `backend/` (e.g., `backend/tasks/`, `backend/boards/`).

---

## Core Architecture & Concepts

### 1. Django Project vs. Django Apps
- **Project (`config/`)**: Global configuration including database connections, middleware, root URLs, and the root `NinjaAPI` instance.
- **Apps**: Self-contained packages dedicated to a single domain entity or feature. A project is composed of multiple apps.

### 2. Django ORM Models
Database tables are declared as Python classes inheriting from `django.db.models.Model`. The ORM maps Python class attributes to SQL columns and handles queries.

### 3. Migrations Lifecycle
Migrations track database schema history:
1. When you edit `models.py`, generate migration files:
   ```bash
   docker compose exec backend python manage.py makemigrations
   ```
2. Apply migrations to the running database:
   ```bash
   docker compose exec backend python manage.py migrate
   ```

### 4. Django Ninja Schemas & Routers
Django Ninja uses Pydantic models (called `Schema`) for strict request validation and response serialisation:
- **`Schema`**: Defines the data shape for inputs and outputs.
- **`Router`**: Defines HTTP path operations (`@router.get`, `@router.post`, etc.).
- **Auto-OpenAPI**: Every route and schema is automatically documented at `/api/docs`.

---

## Interactive API Documentation

When the development containers are running, explore and test API endpoints interactively:

| Interface | Local URL | Proxied URL | Description |
|---|---|---|---|
| **Swagger UI** | [http://localhost:8000/api/docs](http://localhost:8000/api/docs) | [http://localhost:3000/api/docs](http://localhost:3000/api/docs) | Interactive API explorer with request runner |
| **ReDoc** | [http://localhost:8000/api/redoc](http://localhost:8000/api/redoc) | — | Clean, responsive reference documentation |
| **OpenAPI Schema** | [http://localhost:8000/api/openapi.json](http://localhost:8000/api/openapi.json) | [http://localhost:3000/api/openapi.json](http://localhost:3000/api/openapi.json) | Raw OpenAPI 3 specification in JSON format |

---

## Step-by-Step: Adding a New Feature

Follow this workflow to create a new domain feature (e.g. `boards`):

### 1. Create the App
```bash
docker compose exec backend python manage.py startapp boards
```

### 2. Register the App
Add the app name to `INSTALLED_APPS` in `backend/config/settings.py`:
```python
INSTALLED_APPS = [
    # ...
    "boards",
]
```

### 3. Define Models (`boards/models.py`)
```python
from django.db import models

class Board(models.Model):
    title = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title
```

### 4. Create and Run Migrations
```bash
docker compose exec backend python manage.py makemigrations boards
docker compose exec backend python manage.py migrate
```

### 5. Define Schemas (`boards/schemas.py`)
```python
from ninja import Schema
from datetime import datetime

class BoardIn(Schema):
    title: str

class BoardOut(Schema):
    id: int
    title: str
    created_at: datetime
    updated_at: datetime
```

### 6. Create Router Endpoints (`boards/api.py`)
```python
from ninja import Router
from typing import List
from .models import Board
from .schemas import BoardIn, BoardOut

router = Router()

@router.get("/", response=List[BoardOut])
def list_boards(request):
    return Board.objects.all()

@router.post("/", response={201: BoardOut})
def create_board(request, payload: BoardIn):
    board = Board.objects.create(**payload.dict())
    return 201, board
```

### 7. Mount the Router in `config/api.py`
```python
from boards.api import router as boards_router

api.add_router("/boards", boards_router, tags=["Boards"])
```

Your new endpoints will immediately appear in the interactive Swagger docs at `/api/docs`.

---

## Management & Testing Commands

See [Password reset](../password-reset.md) for reset endpoints, user fields,
authentication restrictions, console delivery, and test commands.

Execute commands in the running backend container via `docker compose exec`:

```bash
# Run unit and integration tests
docker compose exec backend python manage.py test

# Create an admin user for http://localhost:8000/admin
docker compose exec backend python manage.py createsuperuser

# Interactive Django Python shell
docker compose exec backend python manage.py shell

# Show migration status
docker compose exec backend python manage.py showmigrations
```

### Tests in CI

Every pull request, and every push to `dev` or `main`, runs the **Tests** workflow (`.github/workflows/tests.yml`). It has three jobs, each running in the Docker Compose containers:

| Job | What it runs |
|---|---|
| **Backend unit tests** | `python manage.py test` |
| **Frontend unit tests** | `pnpm typecheck`, `pnpm test`, `pnpm build`, then `pnpm test:smoke` (see the [Frontend Testing Guide](../frontend/testing.md)) |
| **Smoke check against the running app** | Starts the whole stack and makes a few API calls through the frontend's `/api` proxy (below) |

Pull requests into `dev` and `main` can't be merged until all three pass.

**If a job fails:** open the PR's **Checks** tab, choose **Tests**, then the failed job. The failed step shows the test output.

#### Integration smoke check

Django's tests cover the API and database, and the frontend's `pnpm test:smoke` checks the built frontend's HTML on its own. The smoke check tests them together. It starts the normal Docker Compose stack, then:

1. `/api/health` reports the database connected
2. Register a user, log in, and fetch `/api/auth/me`
3. Create a board and check it starts with the default columns, then find it in the board list

If it fails, the last numbered line printed in the **Smoke check** step is the check that failed. The **Show container logs** step below it has the frontend, backend and database logs.

#### Branch protection

Branch protection is active on `dev` and `main` via branch protection rules and repository rulesets (**PR Review** and **Unit Tests and Smoke Checks**):

- **Require a pull request before merging**: at least 1 approving review required before merging.
- **Require status checks to pass before merging**:
  - `Backend unit tests`
  - `Frontend unit tests`
  - `Smoke check against the running app`

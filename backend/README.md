# MeanTime Backend Service

Django Ninja backend service running on Python 3.14 with PostgreSQL 18, managed via Docker Compose and Uvicorn (ASGI).

---

## Tech Stack & Architecture

- **Runtime**: Python 3.14 (`python:3.14-slim`)
- **Web Framework**: Django 5.2+
- **API Framework**: [Django Ninja](https://django-ninja.dev/) 1.6+ (type hints, Pydantic-powered schemas, automatic OpenAPI docs)
- **ASGI Server**: Uvicorn with `watchfiles` live reloading
- **Database**: PostgreSQL 18 (Alpine) accessed through `psycopg` (v3)
- **Dependency Management**: Standard `pyproject.toml` specification

---

## Directory Structure

```
backend/
├── config/                     # Project configuration root
│   ├── __init__.py
│   ├── api.py                  # Root NinjaAPI instance and router mounting
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
└── README.md                   # This documentation
```

When building new features, create dedicated Django app directories inside `backend/` (for example, `backend/users/`, `backend/tasks/`).

---

## Core Concepts for Beginners

If you are new to Django, Django Ninja, or web development in general, keep the following architectural concepts in mind:

1. **Django Project vs. Django Apps**:
   - The **project** (`config/`) contains global configuration: database credentials, middleware, root URLs, and top-level API mounting.
   - An **app** is a modular package dedicated to a single domain or feature (e.g., authentication, tasks, kanban boards). A Django project consists of one or more apps.

2. **Django ORM (Object-Relational Mapping)**:
   - Instead of writing raw SQL, you define database tables as Python classes called **Models** (in `<app>/models.py`).
   - Django translates model classes into database tables and columns automatically.

3. **Migrations**:
   - Migrations are Django's version-control system for your database schema.
   - When you create or modify a **model**, Django compares your Python code against the previous migration state and generates Python migration scripts that alter the database.

4. **Django Ninja**:
   - Unlike traditional Django (which renders HTML templates) or Django REST Framework (DRF), **Django Ninja** uses standard Python type annotations and Pydantic schemas.
   - It validates incoming request bodies, serializes outgoing JSON responses, and generates interactive Swagger/OpenAPI documentation automatically.

---

## Working with Database Models & Migrations

### Where to Add Code

- **Models**: Always define models inside your feature app's `models.py` (e.g., `backend/tasks/models.py`).
- **Migrations**: Migration files are stored inside your feature app's `migrations/` folder (e.g., `backend/tasks/migrations/`).

> [!IMPORTANT]
> **Never create or edit migration files by hand** under normal circumstances. Django generates them automatically based on changes to your `models.py`.

### Step-by-Step Migration Lifecycle

#### 1. Define or update your model in `<app>/models.py`:
```python
from django.db import models

class Task(models.Model):
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    is_completed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title
```

#### 2. Register the app in `config/settings.py`:
If you created a new app, add its name to `INSTALLED_APPS` in `config/settings.py`:
```python
INSTALLED_APPS = [
    # Built-in apps...
    "django.contrib.admin",
    "django.contrib.auth",
    # Local apps...
    "tasks",
]
```

#### 3. Generate migration files (`makemigrations`):
Run the command inside the running backend container:
```bash
docker compose exec backend python manage.py makemigrations
```
Django inspects your models and writes a new file (e.g., `0001_initial.py`) to your app's `migrations/` folder. This file is bind-mounted back to your host filesystem—commit it to git!

#### 4. Apply migrations to the database (`migrate`):
```bash
docker compose exec backend python manage.py migrate
```
Django executes the SQL statements against PostgreSQL.

> [!NOTE]
> Database migrations run automatically whenever the backend container starts up via `backend/docker/entrypoint.sh`. However, when developing interactively, you can run `makemigrations` and `migrate` anytime without restarting the container.

#### 5. Check migration status:
To see which migrations have been applied:
```bash
docker compose exec backend python manage.py showmigrations
```

---

## Adding New APIs and Routes with Django Ninja

Django Ninja organizes API code into **Schemas** (data validation) and **Routers** (endpoints).

### Recommended File Structure for an App

When creating an app (e.g., `tasks`), organize its API layer as follows:

```
backend/tasks/
├── __init__.py
├── admin.py            # Optional: register models for Django Admin portal
├── api.py              # Ninja Router and endpoint definitions
├── apps.py             # App configuration
├── models.py           # Database models
├── schemas.py          # Ninja/Pydantic request and response schemas
├── tests.py            # Unit and integration tests
└── migrations/         # Auto-generated migrations
```

### Step-by-Step API Implementation

#### Step 1: Define Request & Response Schemas (`schemas.py`)
Schemas declare the data shape for API inputs and outputs. They handle type validation, parsing, and serialization.

```python
# backend/tasks/schemas.py
from datetime import datetime
from ninja import Schema

class TaskIn(Schema):
    """Payload expected when creating or updating a task."""
    title: str
    description: str = ""
    is_completed: bool = False

class TaskOut(Schema):
    """Shape of the task returned to clients."""
    id: int
    title: str
    description: str
    is_completed: bool
    created_at: datetime
```

#### Step 2: Define Routes & Endpoints (`api.py`)
Create a `ninja.Router` instance and attach route handlers with HTTP decorators (`@router.get`, `@router.post`, etc.).

```python
# backend/tasks/api.py
from typing import List
from django.shortcuts import get_object_or_404
from ninja import Router
from .models import Task
from .schemas import TaskIn, TaskOut

router = Router(tags=["Tasks"])

@router.get("/", response=List[TaskOut])
def list_tasks(request):
    """Retrieve all tasks."""
    return Task.objects.all()

@router.post("/", response={201: TaskOut})
def create_task(request, payload: TaskIn):
    """Create a new task."""
    task = Task.objects.create(**payload.dict())
    return 201, task

@router.get("/{task_id}", response=TaskOut)
def get_task(request, task_id: int):
    """Retrieve a single task by ID."""
    return get_object_or_404(Task, id=task_id)

@router.delete("/{task_id}", response={204: None})
def delete_task(request, task_id: int):
    """Delete a task."""
    task = get_object_or_404(Task, id=task_id)
    task.delete()
    return 204, None

@router.post("/custom-route")
def custom_action(request):
    """
    Demonstrates custom non-CRUD action endpoints.
    Routes do not need to be limited to CRUD roots or IDs.
    """
    return {"message": "Custom task action executed successfully"}
```

> [!TIP]
> **Async Support**: Django Ninja supports both synchronous (`def`) and asynchronous (`async def`) handlers. When writing `async def` endpoints that perform ORM operations, use Django's asynchronous queries (e.g., `await Task.objects.acreate(...)`) or `asgiref.sync.sync_to_async`.

#### Step 3: Mount the Router in `config/api.py`
Open `backend/config/api.py` and mount your router onto the root `api` instance:

```python
from ninja import NinjaAPI
from tasks.api import router as tasks_router  # 1. Import your router

api = NinjaAPI(
    title="MeanTime API",
    version="1.0.0",
    description="MeanTime API service with Django Ninja",
)

# 2. Mount the router with a URL prefix
api.add_router("/tasks", tasks_router)
```

With `api.add_router("/tasks", tasks_router)`, your endpoints will automatically be available at:
- `GET /api/tasks/`
- `POST /api/tasks/`
- `GET /api/tasks/{task_id}`
- `DELETE /api/tasks/{task_id}`
- `POST /api/tasks/custom-route` (custom action endpoint)

---

## Interactive OpenAPI Documentation (Swagger / ReDoc)

Django Ninja automatically inspects your type annotations, docstrings, and schemas to generate interactive API documentation:

- **Swagger UI**: Accessible at `http://localhost:8000/api/docs` (or via frontend proxy at `http://localhost:3000/api/docs`). You can test endpoints directly in your browser.
- **ReDoc UI**: Accessible at `http://localhost:8000/api/redoc`.
- **OpenAPI JSON Specification**: Accessible at `http://localhost:8000/api/openapi.json`.

---

## Common Development Commands

All development commands should be executed inside the running container using `docker compose exec`:

| Action | Command |
|---|---|
| **Create a new Django app** | `docker compose exec backend python manage.py startapp <app_name>` |
| **Generate migration files** | `docker compose exec backend python manage.py makemigrations` |
| **Apply migrations** | `docker compose exec backend python manage.py migrate` |
| **Show migration status** | `docker compose exec backend python manage.py showmigrations` |
| **Create superuser (Admin)** | `docker compose exec backend python manage.py createsuperuser` |
| **Interactive Python Shell** | `docker compose exec backend python manage.py shell` |
| **Run Backend Tests** | `docker compose exec backend python manage.py test` |
| **View Backend Logs** | `docker compose logs -f backend` |

---

## Running Locally

Run via Docker Compose at the project root:

```bash
docker compose up backend --build
```

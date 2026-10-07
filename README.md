# MeanTime

MeanTime is a modern, containerized full-stack web application designed for task management, kanban tracking, and productivity workflows. 

The project is built on a containerized microservice-friendly architecture featuring a **Nuxt 4 / Vue 3** frontend, an asynchronous **Django Ninja** backend, and a **PostgreSQL 18** database.

---

## Architecture Overview

```
                      +---------------------------------------+
                      |             Browser Client            |
                      +---------------------------------------+
                                          |
                        HTTP / Vite HMR   |  Port 3000
                                          v
                      +---------------------------------------+
                      |         frontend (Nuxt 4 / Vue 3)     |
                      |  - PrimeVue 5 + Tailwind CSS          |
                      |  - Nitro Engine API Proxy (/api/**)   |
                      +---------------------------------------+
                                          |
                       Internal Docker    |  http://backend:8000
                       Network Proxy      v
                      +---------------------------------------+
                      |       backend (Django Ninja / ASGI)   |
                      |  - Python 3.14 + Uvicorn              |
                      |  - Auto-generated OpenAPI / Swagger   |
                      +---------------------------------------+
                                          |
                         SQL / psycopg3   |  Port 5432
                                          v
                      +---------------------------------------+
                      |          db (PostgreSQL 18)           |
                      |  - Named volume persistence           |
                      +---------------------------------------+
```

- **Frontend**: [Nuxt 4](https://nuxt.com/) (Vue 3, TypeScript, Vite) with [Pinia](https://pinia.vuejs.org/) for state management, [PrimeVue 5](https://primevue.org/) (Aura preset), [Tailwind CSS 3.4](https://tailwindcss.com/), and [PrimeIcons](https://primevue.org/icons/).
- **Backend**: Python 3.14, [Django 5.2+](https://docs.djangoproject.com/), and [Django Ninja 1.6+](https://django-ninja.dev/) running under [Uvicorn](https://www.uvicorn.org/) (ASGI) with automatic schema validation and OpenAPI generation.
- **Database**: [PostgreSQL 18](https://www.postgresql.org/) (Alpine) with health checks and persistent Docker volume storage.
- **Orchestration**: Single-command development environment via Docker Compose with automated startup checks, database migrations, and live code reloading.

---

## Service Documentation Links

For specialized guides on adding code and framework conventions, consult the subproject documentation:

- 📘 **[Backend Developer Guide](backend/README.md)**: Django Ninja setup, creating Django apps, database models, migrations lifecycle, schema definitions, and router registration.
- 🎨 **[Frontend Developer Guide](frontend/README.md)**: Nuxt 4 app structure, page routing, auto-imported components, centralized HTTP client (`app/services/ApiService.ts`), domain APIs (`app/api/`), Pinia stores (`app/stores/`), and PrimeVue styling.

---

## Getting Started: Running the Project

### Prerequisites

You do **not** need to install Python, Node.js, pnpm, or PostgreSQL on your local machine. All dependencies, runtimes, and tools run within Docker containers.

You only need:
1. **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** (version 24+ recommended, with WSL 2 backend on Windows) or Docker Engine with Docker Compose v2+.
2. **[Git](https://git-scm.com/)**.

### Step 1: Clone the Repository

```bash
git clone https://github.com/Mephisto-22/MeanTime.git
cd MeanTime
```

### Step 2: Configure Environment Variables

Create your local `.env` file by copying the provided `.env.example`:

```bash
# On Linux / macOS / Git Bash:
cp .env.example .env

# On Windows PowerShell:
Copy-Item .env.example .env
```

The default values in `.env.example` are pre-configured to work out of the box for local development. See the [Environment Variables](#environment-variables-reference) section below if you need to adjust ports or credentials.

### Step 3: Launch the Development Environment

Build container images and start all services:


```bash
docker compose up -d --build
```

### Step 4: Verify Services

Once the containers are running and database readiness checks pass, the following endpoints are available:

| Service | Address | Description |
|---|---|---|
| **Frontend Web App** | [http://localhost:3000](http://localhost:3000) | Nuxt 4 application with hot module replacement (HMR) |
| **Interactive API Docs (Swagger)** | [http://localhost:8000/api/docs](http://localhost:8000/api/docs) | Interactive Django Ninja OpenAPI Swagger UI |
| **API Docs (via Frontend Proxy)** | [http://localhost:3000/api/docs](http://localhost:3000/api/docs) | Proxied Swagger documentation |
| **ReDoc API Documentation** | [http://localhost:8000/api/redoc](http://localhost:8000/api/redoc) | Alternative ReDoc OpenAPI interface |
| **OpenAPI Specification** | [http://localhost:8000/api/openapi.json](http://localhost:8000/api/openapi.json) | Raw OpenAPI schema definition |
| **Django Admin Portal** | [http://localhost:8000/admin](http://localhost:8000/admin) | Django administrative interface |
| **Backend Health Check** | [http://localhost:8000/api/health](http://localhost:8000/api/health) | Verifies backend and database connectivity |
| **PostgreSQL Database** | `localhost:5432` | Accessible via psql, DBeaver, or pgAdmin |

---

## Environment Variables Reference

Environment variables are managed in `.env` at the project root.

| Variable | Default Value | Description | Notes |
|---|---|---|---|
| **`POSTGRES_DB`** | `meantime` | PostgreSQL database name | Used by both database container and Django settings. |
| **`POSTGRES_USER`** | `meantime_user` | PostgreSQL database user | |
| **`POSTGRES_PASSWORD`** | `meantime_password` | PostgreSQL user password | Change in production environments. |
| **`POSTGRES_HOST`** | `db` | Database hostname for backend | Resolves to the `db` service container name. |
| **`POSTGRES_PORT`** | `5432` | Internal database port | Internal container port for PostgreSQL. |
| **`DB_PORT`** | `5432` | Exposed host database port | Change if your local machine already runs PostgreSQL on port 5432. |
| **`DJANGO_SECRET_KEY`** | `django-insecure-...` | Cryptographic signing key | Change in production. |
| **`DJANGO_DEBUG`** | `1` | Django debug mode flag | `1` (true) for local dev; `0` (false) for production. |
| **`DJANGO_ALLOWED_HOSTS`** | `*` | Comma-separated allowed hosts | `*` permits requests from local browser and Docker network. |
| **`BACKEND_PORT`** | `8000` | Exposed host port for Django | Change if port 8000 is occupied on your host. |
| **`FRONTEND_PORT`** | `3000` | Exposed host port for Nuxt | Change if port 3000 is occupied on your host. |
| **`BACKEND_INTERNAL_URL`** | `http://backend:8000` | Internal backend URL for Nuxt proxy | Used by Nuxt Nitro proxy to forward `/api/**` traffic internally. |
| **`PRIMEVUE_LICENSE_KEY`** | _(empty)_ | PrimeVue license key | Optional; only needed for commercial PrimeVue offerings. |
| **`WATCHFILES_FORCE_POLLING`** | `true` | Watchfiles file watcher polling | Ensures hot reloading triggers reliably across Windows mounts. |

---

## Repository File Structure

```
MeanTime/
├── backend/                             # Django Ninja backend service
│   ├── config/                          # Django configuration & entrypoints
│   │   ├── api.py                       # Root NinjaAPI instance and mounted routers
│   │   ├── asgi.py                      # ASGI entrypoint for Uvicorn
│   │   ├── settings.py                  # Django settings, database & app configuration
│   │   ├── urls.py                      # Root URL routing (admin/ and api/)
│   │   └── wsgi.py                      # WSGI entrypoint
│   ├── docker/                          # Backend container definitions
│   │   ├── Dockerfile                   # Python 3.14 slim container
│   │   └── entrypoint.sh                # DB readiness check, auto-migrations, server start
│   ├── tests/                           # Backend test suite
│   ├── manage.py                        # Django management command CLI
│   ├── pyproject.toml                   # Python dependencies managed with uv
│   └── README.md                        # Backend developer guide
├── frontend/                            # Nuxt 4 / Vue 3 frontend service
│   ├── app/                             # Frontend application source
│   │   ├── api/                         # Domain API endpoints & interfaces
│   │   ├── assets/                      # Global styles and Tailwind layers
│   │   ├── components/                  # Auto-imported Vue components
│   │   ├── composables/                 # Auto-imported UI composables
│   │   ├── layouts/                     # Page layout wrappers (default.vue)
│   │   ├── pages/                       # File-based routing pages
│   │   ├── services/                    # Centralized ApiService & infrastructure clients
│   │   ├── stores/                      # Pinia state management stores
│   │   └── app.vue                      # Root Vue template
│   ├── docker/                          # Frontend container definitions
│   │   ├── Dockerfile                   # Node 22 Alpine container
│   │   └── entrypoint.sh                # Dependency sync & Nuxt development server startup
│   ├── nuxt.config.ts                   # Nuxt configuration (Nitro proxy, PrimeVue, Tailwind)
│   ├── package.json                     # Frontend npm packages
│   ├── tailwind.config.ts               # Tailwind CSS theme configuration
│   └── README.md                        # Frontend developer guide
├── docs/                                # Documentation and architecture decisions
│   ├── adr/                             # Architectural Decision Records (ADRs)
│   └── agents/                          # Coding agent instructions and conventions
├── .env.example                         # Example environment variables template
├── docker-compose.yml                   # Multi-container orchestration definition
├── Backlog.md                           # Product backlog and feature roadmaps
└── README.md                            # Main project documentation (this file)
```

---

## Common Development Commands

### Managing Containers

```bash
# Start all containers in the foreground
docker compose up

# Start all containers in detached mode (background)
docker compose up -d

# Stop all containers
docker compose stop

# Stop and remove containers and networks
docker compose down

# Stop containers and wipe the database volume (clean slate)
docker compose down -v

# View streaming logs for all services or a specific service
docker compose logs -f
docker compose logs -f backend
docker compose logs -f frontend
```

### Backend Management Commands

Execute Django management commands inside the running container using `docker compose exec`:

```bash
# Create database migrations after modifying models
docker compose exec backend python manage.py makemigrations

# Apply migrations
docker compose exec backend python manage.py migrate

# Create an administrator account for Django Admin (http://localhost:8000/admin)
docker compose exec backend python manage.py createsuperuser

# Open an interactive Django Python shell
docker compose exec backend python manage.py shell

# Run backend test suite
docker compose exec backend python manage.py test
```

### Zero-Install Host IDE Autocomplete

The frontend service uses pnpm's hoisted linker directly onto your host filesystem mount:
- **No Node/pnpm required on host**: Types and dependencies are automatically generated by the container into `frontend/node_modules/` and `frontend/.nuxt/`.
- Host IDEs (VS Code, Cursor, WebStorm) will immediately resolve imports, types, and component definitions.
- **Do not run `pnpm install` or `npm install` on the host**: All dependency installations should be handled inside Docker to avoid platform binary mismatches.

---

## Relevant Documentation & References

### Frontend
- [Nuxt 4 Documentation](https://nuxt.com/docs)
- [Vue 3 Documentation](https://vuejs.org/)
- [Pinia Documentation](https://pinia.vuejs.org/)
- [PrimeVue 5 Documentation](https://primevue.org/)
- [PrimeIcons Directory](https://primevue.org/icons/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

### Backend
- [Django Documentation](https://docs.djangoproject.com/)
- [Django Ninja Documentation](https://django-ninja.dev/)
- [Uvicorn Documentation](https://www.uvicorn.org/)
- [psycopg (v3) Documentation](https://www.psycopg.org/psycopg3/docs/)

### Database & Infrastructure
- [PostgreSQL 18 Documentation](https://www.postgresql.org/docs/)
- [Docker Compose Specification](https://docs.docker.com/compose/)
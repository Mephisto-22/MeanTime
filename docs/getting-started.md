# Getting Started

This guide walks you through launching the MeanTime application locally using Docker Compose.

---

## Prerequisites

You do **not** need to install Python, Node.js, pnpm, or PostgreSQL directly on your local machine. All dependencies, runtimes, database servers, and development tools execute entirely within Docker containers.

You only need:

1. **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** (version 24+ recommended, with WSL 2 backend enabled on Windows) or Docker Engine with Docker Compose v2+.
2. **[Git](https://git-scm.com/)**.

---

## Step 1: Clone the Repository

Clone the repository and enter the project directory:

```bash
git clone https://github.com/Mephisto-22/MeanTime.git
cd MeanTime
```

---

## Step 2: Configure Environment Variables

Create your local `.env` file by copying the provided `.env.example`:

=== "Linux / macOS / Git Bash"

    ```bash
    cp .env.example .env
    ```

=== "Windows PowerShell"

    ```powershell
    Copy-Item .env.example .env
    ```

The default values in `.env.example` are pre-configured to work out of the box for local development.

### Environment Variables Reference

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

## Step 3: Launch the Development Environment

Build container images and start all services in detached mode:

```bash
docker compose up -d --build
```

Docker Compose starts three coordinated containers:
1. `db`: PostgreSQL 18 with persistent volume storage and readiness health checks.
2. `backend`: Django Ninja ASGI server (starts once the database is healthy, auto-runs migrations).
3. `frontend`: Nuxt 4 development server with hot module replacement (HMR).

---

## Step 4: Verify Services

Once the containers are running and database readiness checks pass, access the following endpoints:

| Service | Address | Description |
|---|---|---|
| **Frontend Web App** | [http://localhost:3000](http://localhost:3000) | Nuxt 4 application with hot module replacement (HMR) |
| **Interactive API Docs (Swagger)** | [http://localhost:8000/api/docs](http://localhost:8000/api/docs) | Interactive Django Ninja OpenAPI Swagger UI |
| **API Docs (via Frontend Proxy)** | [http://localhost:3000/api/docs](http://localhost:3000/api/docs) | Proxied Swagger documentation |
| **ReDoc API Documentation** | [http://localhost:8000/api/redoc](http://localhost:8000/api/redoc) | Alternative ReDoc OpenAPI interface |
| **OpenAPI Specification** | [http://localhost:8000/api/openapi.json](http://localhost:8000/api/openapi.json) | Raw OpenAPI schema definition |
| **Django Admin Portal** | [http://localhost:8000/admin](http://localhost:8000/admin) | Django administrative interface |
| **Backend Health Check** | [http://localhost:8000/api/health](http://localhost:8000/api/health) | Verifies backend and database connectivity |
| **PostgreSQL Database** | `localhost:5432` | Accessible via `psql`, DBeaver, or pgAdmin |

---

## Common Development Commands

### Container Lifecycle

```bash
# Start all containers in the foreground
docker compose up

# Start all containers in detached mode (background)
docker compose up -d

# Stop all containers
docker compose stop

# Stop and remove containers and networks
docker compose down

# Stop containers and wipe database volume (fresh clean slate)
docker compose down -v
```

### Viewing Logs

```bash
# View streaming logs for all services
docker compose logs -f

# Follow logs for backend or frontend only
docker compose logs -f backend
docker compose logs -f frontend
```

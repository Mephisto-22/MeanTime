# MeanTime

[![Documentation Status](https://readthedocs.org/projects/meantime/badge/?version=latest)](https://meantime.readthedocs.io/en/latest/?badge=latest)

MeanTime is a modern, containerized full-stack web application designed for task management, kanban tracking, and productivity workflows.

The project features a **Nuxt 4 / Vue 3** frontend, an asynchronous **Django Ninja** backend, and a **PostgreSQL 18** database, orchestrated via **Docker Compose**.

---

## Official Documentation

For comprehensive guides, architecture diagrams, and service walkthroughs, visit our documentation hosted on ReadTheDocs:

- **[Stable Release (`main`)](https://meantime.readthedocs.io/en/latest/)**: Production documentation tracking the `main` branch
- **[Active Development (`dev`)](https://meantime.readthedocs.io/en/dev/)**: Development documentation tracking the `dev` branch

### Direct Guides

- **[Getting Started](https://meantime.readthedocs.io/en/latest/getting-started/)**: Detailed setup, `.env` reference, and service verification.
- **[Architecture & Domain](https://meantime.readthedocs.io/en/latest/architecture/)**: Container networking, Nitro proxy flow, and ubiquitous domain vocabulary.
- **[Backend Service Guide](https://meantime.readthedocs.io/en/latest/backend/)**: Django Ninja architecture, database migrations, Pydantic schemas, and API testing.
- **[Frontend Service Guide](https://meantime.readthedocs.io/en/latest/frontend/)**: Nuxt 4, PrimeVue 5 + Tailwind integration, Pinia stores, and the `ApiService` pattern.
- **[Infrastructure Guide](https://meantime.readthedocs.io/en/latest/infrastructure/)**: Terraform for the AWS Dev and Prod environments: bringing them up and down, opening Dev, and Prod's domain and HTTPS.
- **[Google Sign-In](https://meantime.readthedocs.io/en/latest/google-sign-in/)**: How signing in with Google works, the Google OAuth client, and setting it up locally and in AWS.

---

## System Architecture

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

---

## Quickstart

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (v24+ with WSL 2 backend on Windows) or Docker Engine with Docker Compose v2+.
- [Git](https://git-scm.com/).
*(No local installation of Python, Node, pnpm, or PostgreSQL required.)*

### 1. Clone & Configure
```bash
git clone https://github.com/Mephisto-22/MeanTime.git
cd MeanTime

# Linux / macOS / Git Bash:
cp .env.example .env

# Windows PowerShell:
Copy-Item .env.example .env
```

### 2. Start Services
```bash
docker compose up -d --build
```

### 3. Access Service Endpoints

| Service | URL | Description |
|---|---|---|
| **Frontend Web App** | [http://localhost:3000](http://localhost:3000) | Nuxt 4 application (HMR enabled) |
| **Interactive API Docs (Swagger)** | [http://localhost:8000/api/docs](http://localhost:8000/api/docs) | Interactive Django Ninja OpenAPI Swagger UI |
| **ReDoc API Documentation** | [http://localhost:8000/api/redoc](http://localhost:8000/api/redoc) | Alternative ReDoc documentation |
| **Django Admin** | [http://localhost:8000/admin](http://localhost:8000/admin) | Administrative portal |
| **Health Check** | [http://localhost:8000/api/health](http://localhost:8000/api/health) | API and database connectivity verification |

---

## Repository Map

```
MeanTime/
├── backend/                             # Django Ninja backend service (Python 3.14, Uvicorn)
├── frontend/                            # Nuxt 4 / Vue 3 frontend service (PrimeVue 5, Tailwind)
├── infra/                               # Terraform for the AWS Dev and Prod environments
├── docs/                                # Documentation source (MkDocs Material)
│   ├── getting-started.md               # Quickstart and configuration guides
│   ├── architecture.md                  # System architecture and domain glossary
│   ├── backend.md                       # Backend development guide
│   ├── frontend.md                      # Frontend development guide
│   ├── adr/                             # Architectural Decision Records (internal)
│   └── agents/                          # Coding agent instructions (internal)
├── .env.example                         # Example environment variables template
├── docker-compose.yml                   # Container orchestration
├── mkdocs.yml                           # MkDocs site configuration
├── .readthedocs.yaml                    # ReadTheDocs build configuration
└── README.md                            # Project orientation (this file)
```

For more details, see the full [MeanTime Documentation](https://meantime.readthedocs.io).

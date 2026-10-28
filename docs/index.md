# MeanTime

Welcome to the **MeanTime** documentation.

See the [password reset guide](password-reset.md) for the Sprint 2 flow and local testing.

MeanTime is a modern, containerized full-stack web application designed for task management, kanban tracking, and productivity workflows.

The project is built on a containerized microservice architecture featuring a **Nuxt 4 / Vue 3** frontend, an asynchronous **Django Ninja** backend, and a **PostgreSQL 18** database.

---

## Architecture at a Glance

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

## Key Documentation Sections

Navigate through the guides below to get started or dive into service architectures:

- **[Getting Started](getting-started.md)**: Zero-install setup prerequisites, `.env` configuration, Docker Compose commands, and service health checks.
- **[Architecture & Domain](architecture.md)**: Container topology, internal Docker networking, proxy routing, and canonical domain concepts.
- **[Backend Service Guide](backend/index.md)**: Django Ninja setup, database models, schema contracts, migrations lifecycle, unit testing, and interactive Swagger/ReDoc links.
- **[Frontend Service Guide](frontend/index.md)**: Nuxt 4, Vue 3, PrimeVue 5 + Tailwind CSS layering, Pinia stores, and the centralized `ApiService` pattern.
- **[Infrastructure Guide](infrastructure/index.md)**: Terraform for the AWS Dev and Prod environments: bringing them up and down, opening Dev, and finding Prod's URL.

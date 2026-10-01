FROM python:3.14-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH"

# Copy uv from pinned official image
COPY --from=ghcr.io/astral-sh/uv:0.12.21 /uv /uvx /bin/

# Install system dependencies (curl for healthchecks and container inspection)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create virtualenv in /opt/venv so host volume mounts onto /app do not mask packages
RUN uv venv /opt/venv

# Install Python dependencies defined in pyproject.toml
COPY pyproject.toml ./
RUN uv pip install -r pyproject.toml

# Copy project source
COPY . .

# Copy and prepare entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "config.asgi:application", "--host", "0.0.0.0", "--port", "8000", "--reload"]

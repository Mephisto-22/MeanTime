#!/bin/sh
set -e

echo "Verifying database connection..."
python - <<'EOF'
import os
import sys
import time
import psycopg

db_name = os.environ.get("POSTGRES_DB")
user = os.environ.get("POSTGRES_USER")
password = os.environ.get("POSTGRES_PASSWORD")
host = os.environ.get("POSTGRES_HOST")
port = os.environ.get("POSTGRES_PORT")

missing = [var for var in ["POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_HOST", "POSTGRES_PORT"] if not os.environ.get(var)]
if missing:
    print(f"Error: Missing required database environment variables: {', '.join(missing)}")
    sys.exit(1)

conn_str = f"dbname='{db_name}' user='{user}' password='{password}' host='{host}' port='{port}'"

start_time = time.time()
connected = False

while time.time() - start_time < 60:
    try:
        conn = psycopg.connect(conn_str)
        conn.close()
        connected = True
        print("Database connection successfully established.")
        break
    except psycopg.OperationalError:
        time.sleep(1)

if not connected:
    print("Database connection timed out after 60 seconds.")
    sys.exit(1)
EOF

echo "Applying database migrations..."
python manage.py migrate --noinput

echo "Starting backend process: $@"
exec "$@"

from asgiref.sync import sync_to_async
from django.db import connection
from ninja import NinjaAPI, Schema

api = NinjaAPI(
    title="MeanTime API",
    version="1.0.0",
    description="MeanTime API service with Django Ninja",
)


class HealthResponse(Schema):
    status: str
    database: str


def _check_database() -> bool:
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        row = cursor.fetchone()
        return row is not None and row[0] == 1


@api.get("/health", response={200: HealthResponse, 503: HealthResponse})
async def health_check(request):
    """Health check endpoint verifying API and database operational status asynchronously."""
    try:
        is_healthy = await sync_to_async(_check_database, thread_sensitive=True)()
        if not is_healthy:
            return 503, {"status": "error", "database": "unhealthy"}
        return 200, {"status": "ok", "database": "connected"}
    except Exception as exc:
        return 503, {"status": "error", "database": f"unhealthy: {exc}"}

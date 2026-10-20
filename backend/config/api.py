from asgiref.sync import sync_to_async
from django.db import connection
from ninja import NinjaAPI, Schema
from ninja_extra.exceptions import APIException
from ninja_jwt.authentication import JWTAuth
from users.api import auth_router

from kanban.api import router as kanban_router


api = NinjaAPI(
    title="MeanTime API",
    version="1.0.0",
    description="MeanTime API service with Django Ninja",
    auth=JWTAuth(),
)

# router registrations (import above)
api.add_router("/kanban", kanban_router)

@api.exception_handler(APIException)
def api_exception_handler(request, exc):
    """Handle exceptions raised by ninja_extra and ninja_jwt components."""
    headers = {}
    if getattr(exc, "auth_header", None):
        headers["WWW-Authenticate"] = exc.auth_header
    detail = getattr(exc, "detail", str(exc))
    if isinstance(detail, dict) and "detail" in detail:
        detail = detail["detail"]
    elif not isinstance(detail, (str, dict, list)):
        detail = str(exc)
    return api.create_response(
        request,
        {"detail": detail},
        status=getattr(exc, "status_code", 400),
        headers=headers,
    )


api.add_router("/auth", auth_router, tags=["Authentication"])


class HealthResponse(Schema):
    status: str
    database: str


def _check_database() -> bool:
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        row = cursor.fetchone()
        return row is not None and row[0] == 1


@api.get("/health", response={200: HealthResponse, 503: HealthResponse}, auth=None)
async def health_check(request):
    """Health check endpoint verifying API and database operational status asynchronously."""
    try:
        is_healthy = await sync_to_async(_check_database, thread_sensitive=True)()
        if not is_healthy:
            return 503, {"status": "error", "database": "unhealthy"}
        return 200, {"status": "ok", "database": "connected"}
    except Exception as exc:
        return 503, {"status": "error", "database": f"unhealthy: {exc}"}

"""ASGI config for MeanTime project."""
import logging
import os
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

django_application = get_asgi_application()
logger = logging.getLogger(__name__)

from kanban.scheduler import start_scheduler, stop_scheduler


async def application(scope, receive, send):
    """
    Root ASGI application wrapping Django's ASGI handler with lifespan support
    for background APScheduler initialization and graceful shutdown.
    """
    if scope["type"] == "lifespan":
        while True:
            message = await receive()
            message_type = message.get("type")
            if message_type == "lifespan.startup":
                try:
                    start_scheduler()
                    await send({"type": "lifespan.startup.complete"})
                except Exception as exc:
                    logger.exception("Failed to start background scheduler: %s", exc)
                    await send({"type": "lifespan.startup.failed", "message": str(exc)})
            elif message_type == "lifespan.shutdown":
                try:
                    stop_scheduler()
                    await send({"type": "lifespan.shutdown.complete"})
                except Exception as exc:
                    logger.exception("Failed to stop background scheduler: %s", exc)
                    await send({"type": "lifespan.shutdown.failed", "message": str(exc)})
                return
    else:
        await django_application(scope, receive, send)

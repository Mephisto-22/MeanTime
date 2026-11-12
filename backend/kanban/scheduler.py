"""Embedded APScheduler integration for MeanTime background tasks."""

import logging
from apscheduler.schedulers.background import BackgroundScheduler
from kanban.services import run_auto_clear_job

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def get_scheduler() -> BackgroundScheduler:
    """Return the global BackgroundScheduler instance, creating it if needed."""
    global _scheduler
    if _scheduler is None:
        _scheduler = BackgroundScheduler()
    return _scheduler


def start_scheduler() -> BackgroundScheduler:
    """
    Start the embedded APScheduler and register background jobs.
    Runs the column auto-clear routine every 5 minutes.
    """
    scheduler = get_scheduler()
    if not scheduler.running:
        scheduler.add_job(
            run_auto_clear_job,
            "interval",
            minutes=5,
            id="auto_clear_expired_tasks",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )
        scheduler.start()
        logger.info("APScheduler started: auto-clear job scheduled every 5 minutes.")
    return scheduler


def stop_scheduler() -> None:
    """Cleanly terminate the embedded APScheduler upon application shutdown."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped.")
    _scheduler = None

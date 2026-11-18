"""Run only against a new temporary SQLite database, never the developer database."""
import os
import tempfile
from pathlib import Path

os.environ["DJANGO_SETTINGS_MODULE"] = "config.test_settings"

import django
django.setup()

from django.conf import settings
from django.core.management import call_command

_database = tempfile.TemporaryDirectory(prefix="meantime-schemathesis-")
settings.DATABASES["default"]["NAME"] = str(Path(_database.name) / "pilot.sqlite3")
settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
settings.DEBUG = False
call_command("migrate", verbosity=0)


def pytest_sessionfinish(session, exitstatus):
    import json
    from advancement.schemathesis.telemetry import counts
    results = Path(__file__).parent / "results"
    results.mkdir(exist_ok=True)
    mode = os.environ.get("PILOT_MODE", "contract")
    (results / f"{mode}-requests.json").write_text(json.dumps([
        {"test": test, "method": method, "path": path, "status": status, "requests": count}
        for (test, method, path, status), count in sorted(counts.items())
    ], indent=2))
    from django.db import connections
    connections.close_all()
    _database.cleanup()

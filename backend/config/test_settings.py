import os

# Set dummy environment variables for unit test execution if not already provided
for key, val in [
    ("DJANGO_SECRET_KEY", "test-secret-key-for-unit-tests-only-32bytes+"),
    ("POSTGRES_DB", "test"),
    ("POSTGRES_USER", "test"),
    ("POSTGRES_PASSWORD", "test"),
    ("POSTGRES_HOST", "localhost"),
    ("POSTGRES_PORT", "5432"),
]:
    os.environ.setdefault(key, val)

from .settings import *

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

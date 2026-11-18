"""Record request counts without payloads, tokens, or generated path values."""
import os
from collections import Counter

counts = Counter()


def instrument(app):
    def wrapped(environ, start_response):
        path = environ.get("PATH_INFO", "")
        if path.startswith("/api/kanban/boards/"):
            path = "/api/kanban/boards/{board_id}"

        def capture(status, headers, exc_info=None):
            test = os.environ.get("PYTEST_CURRENT_TEST", "collection").split(" (", 1)[0]
            counts[(test, environ["REQUEST_METHOD"], path, int(status.split()[0]))] += 1
            return start_response(status, headers, exc_info)

        return app(environ, capture)
    return wrapped

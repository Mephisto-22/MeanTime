# this file contains SSE specific formatting and
# response configuration for kanban event pub/sub

import json
from typing import Any

# HTTP headers required for SSE responses
SSE_RESPONSE_HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
}

# How long the browser should wait before attempting to reconnect
SSE_RETRY_INTERVAL_MS = 3000

def _validate_sse_field(value: str) -> str:
    """Prevent newline characters from injecting additional SSE fields."""
    if "\n" in value or "\r" in value:
        raise ValueError("SSE fields cannot contain newline characters.")

    return value

def format_sse_event(event: dict[str, Any]) -> str:
    """
    Sends an application event.
    Convert an event dictionary into the SSE wire format.

    Supported fields:
        id: Unique event identifier.
        type: Event name, such as task.created.
        data: Event payload.
    """
    lines = []

    event_id = event.get("id")
    event_type = event.get("type", "message")

    if event_id:
        lines.append(f"id: {_validate_sse_field(str(event_id))}")
    if event_type:
        lines.append(f"event: {_validate_sse_field(str(event_type))}")

    # JSON serialization keeps the payload on one line
    data = json.dumps(event, separators=(",", ":"), ensure_ascii=False)
    lines.append(f"data: {data}")

    return "\n".join(lines) + "\n\n"

def format_sse_retry(interval_ms: int = SSE_RETRY_INTERVAL_MS) -> str:
    """Tell the browser how long to wait before reconnecting."""
    if interval_ms < 0:
        raise ValueError("SSE retry interval cannot be negative.")
    return f"retry: {interval_ms}\n\n"

def format_sse_comment(comment: str = "keep-alive") -> str:
    """Format as an SSE comment, commonly used as a heartbeat."""
    if "\n" in comment or "\r" in comment:
        raise ValueError("SSE commens cannot contain newline characters")
    return f": {comment}\n\n"


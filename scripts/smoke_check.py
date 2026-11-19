"""Exercise the running frontend proxy, including console email confirmation.

Run from the repository root with Python 3 after docker compose up -d.
The smoke stack must use Django's console email backend, never real delivery.
"""
import json
import os
import re
import subprocess
import time
from urllib.error import HTTPError
from urllib.parse import parse_qs, quote, urlsplit
from urllib.request import Request, urlopen


BASE_URL = os.environ.get("BASE_URL", "http://localhost:3000").rstrip("/")


def request(path, *, data=None, token=None, expected=200):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = Request(f"{BASE_URL}/api{path}", headers=headers,
                  data=json.dumps(data).encode() if data is not None else None)
    try:
        response = urlopen(req, timeout=20)
    except HTTPError as error:
        response = error
    with response:
        if response.status != expected:
            raise RuntimeError(f"{req.get_method()} {path}: expected {expected}, received {response.status}")
        return json.load(response)


def mask(value):
    if os.environ.get("GITHUB_ACTIONS") == "true":
        print(f"::add-mask::{value}", flush=True)


def delivered_link(email, page):
    logs = subprocess.check_output(
        ["docker", "compose", "logs", "--no-color", "--no-log-prefix", "backend"], text=True
    )
    for block in reversed(logs.split("MeanTime email (development only)")):
        if f"To: {email}" not in block.splitlines():
            continue
        match = re.search(r"https?://[^\s]+/" + re.escape(page) + r"#[^\s]+", block)
        if match:
            values = {key: value[0] for key, value in parse_qs(urlsplit(match[0]).fragment).items()}
            token = values.get("token")
            if token:
                mask(token)
                mask(quote(token, safe=""))
                return values
    raise RuntimeError(f"No {page} link for this smoke account in console mail logs")


def main():
    print("1. Health check reports the database connected", flush=True)
    assert request("/health")["database"] == "connected"
    email = f"smoke-{os.environ.get('GITHUB_RUN_ID', 'local')}-{time.time_ns()}@example.com"
    credentials = {"email": email, "password": "Smoke-check-pass-123!"}

    print("2. Register an unverified account", flush=True)
    user = request("/auth/register", data={**credentials, "display_name": "Smoke Check"}, expected=201)
    assert user["email"] == email and user["is_verified"] is False

    print("3. Login is denied before confirmation", flush=True)
    request("/auth/login", data=credentials, expected=403)

    print("4. Confirm using the link actually delivered to console mail", flush=True)
    request("/auth/email-verification/confirm", data=delivered_link(email, "confirm-email"))

    print("5. Log in after confirmation", flush=True)
    session = request("/auth/login", data=credentials)
    token = session["access_token"]
    mask(token)
    mask(session["refresh_token"])

    print("6. Fetch the verified user", flush=True)
    user = request("/auth/me", token=token)
    assert user["email"] == email and user["is_verified"] is True

    print("7. Create a board with default columns", flush=True)
    board = request("/kanban/boards", data={"title": "Smoke check board", "description": ""}, token=token, expected=201)
    assert [column["title"] for column in board["columns"]] == ["To Do", "In Progress", "Done"]

    print("8. Find the board in this user's list", flush=True)
    assert any(item["id"] == board["id"] for item in request("/kanban/boards", token=token))

    print("9. Request and validate the delivered password-reset link", flush=True)
    request("/auth/password-reset", data={"email": email})
    link = delivered_link(email, "reset-password")
    request("/auth/password-reset/validate", data=link)
    request("/auth/login", data=credentials, expected=403)

    print("10. Reset the password and reject the old session", flush=True)
    password = "Replacement-smoke-pass-729!"
    request("/auth/password-reset/confirm", data={**link, "password": password, "password_confirm": password})
    request("/auth/me", token=token, expected=401)
    request("/auth/refresh", data={"refresh_token": session["refresh_token"]}, expected=401)
    request("/auth/login", data=credentials, expected=401)
    request("/auth/password-reset/validate", data=link, expected=400)

    print("11. Log in with the replacement password", flush=True)
    session = request("/auth/login", data={"email": email, "password": password})
    mask(session["access_token"])
    mask(session["refresh_token"])
    assert request("/auth/me", token=session["access_token"])["email"] == email
    print("Smoke check passed", flush=True)


if __name__ == "__main__":
    main()

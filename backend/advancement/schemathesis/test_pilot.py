"""Generated API contract checks and authenticated board workflows."""
import os

import schemathesis
from hypothesis import HealthCheck, settings
from django.contrib.auth import get_user_model
from django.core.wsgi import get_wsgi_application
from django.test import Client
from schemathesis.checks import not_a_server_error
from advancement.schemathesis.telemetry import counts, instrument

APP = instrument(get_wsgi_application())
client = Client()
owner = get_user_model().objects.create_user(
    email="pilot@example.test", password="Pilot-Only!672", display_name="Pilot"
)
# Use the real login route, not a mocked auth handler.
login = client.post("/api/auth/login", {"email": owner.email, "password": "Pilot-Only!672"}, content_type="application/json")
assert login.status_code == 200, login.content
HEADERS = {"Authorization": f"Bearer {login.json()['access_token']}"}

schema = schemathesis.openapi.from_wsgi("/api/openapi.json", APP)


class PilotAuth:
    def get(self, case, ctx):
        return HEADERS["Authorization"]

    def set(self, case, data, ctx):
        case.headers = {**(case.headers or {}), "Authorization": data}


schema.auth()(PilotAuth)
scope = schema.include(path_regex=r"^/api/(auth/password-requirements|kanban/boards(?:/\{board_id\})?)$")
EXAMPLES = int(os.environ.get("PILOT_EXAMPLES", "30"))
ROBUSTNESS = os.environ.get("PILOT_MODE", "contract") == "robustness"


@scope.parametrize()
@settings(max_examples=EXAMPLES, deadline=None, suppress_health_check=[HealthCheck.too_slow])
def test_generated_contract(case):
    if ROBUSTNESS:
        case.call_and_validate(checks=[not_a_server_error])
    else:
        case.call_and_validate()


# Test-only links preserve the production schema while making the workflow explicit.
raw = client.get("/api/openapi.json").json()
paths = raw["paths"]
create = paths["/api/kanban/boards"]["post"]
create["responses"]["201"]["links"] = {
    method: {
        "operationId": paths["/api/kanban/boards/{board_id}"][method]["operationId"],
        "parameters": {"board_id": "$response.body#/id"},
    }
    for method in ["get", "patch", "delete"]
}
linked = schemathesis.openapi.from_dict(raw).include(path_regex=r"^/api/kanban/boards(?:/\{board_id\})?$")
linked.app = APP
linked.auth()(PilotAuth)


class BoardWorkflow(linked.as_state_machine()):
    def validate_response(self, response, case, additional_checks=(), **kwargs):
        if ROBUSTNESS:
            case.validate_response(response, checks=[not_a_server_error])
        else:
            super().validate_response(response, case, additional_checks=additional_checks, **kwargs)


class TestBoardWorkflow(BoardWorkflow.TestCase):
    settings = settings(
        max_examples=EXAMPLES, stateful_step_count=6, deadline=None,
        suppress_health_check=[HealthCheck.too_slow],
    )

    def tearDown(self):
        super().tearDown()
        if ROBUSTNESS:
            successful = {
                (method, path, status)
                for (test, method, path, status), count in counts.items()
                if "TestBoardWorkflow" in test and count
            }
            self.assertIn(("POST", "/api/kanban/boards", 201), successful,
                          "Stateful pilot never created a board successfully")
            self.assertTrue(any(
                path == "/api/kanban/boards/{board_id}" and status == 200
                for method, path, status in successful
            ), "Stateful pilot never exercised a successful linked operation")

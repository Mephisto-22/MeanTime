from unittest.mock import patch
from django.test import TestCase, Client


class HealthEndpointTests(TestCase):
    def setUp(self):
        self.client = Client()

    def test_health_check_returns_ok_when_database_connected(self):
        """GET /api/health should return 200 OK and database connected status."""
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "database": "connected"})

    @patch("config.api._check_database", side_effect=Exception("Database unreachable"))
    def test_health_check_returns_503_when_database_fails(self, mock_check):
        """GET /api/health should return 503 when the database connection cannot be established."""
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 503)
        data = response.json()
        self.assertEqual(data["status"], "error")
        self.assertIn("Database unreachable", data["database"])

    def test_openapi_schema_accessible(self):
        """GET /api/openapi.json should return 200 OK with Ninja schema and HealthResponse."""
        response = self.client.get("/api/openapi.json")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["info"]["title"], "MeanTime API")
        self.assertIn("/api/health", data["paths"])

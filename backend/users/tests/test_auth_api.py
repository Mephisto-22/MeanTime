import json
from django.contrib.auth import get_user_model
from django.test import Client, TestCase

User = get_user_model()


class AuthAPITests(TestCase):
    def setUp(self):
        self.client = Client()
        self.register_url = "/api/auth/register"
        self.login_url = "/api/auth/login"
        self.refresh_url = "/api/auth/refresh"
        self.me_url = "/api/auth/me"

    def test_register_success(self):
        """User registration with valid payload returns 201 and user representation without password."""
        payload = {
            "email": "newuser@example.com",
            "password": "SecurePassword123!",
            "display_name": "New User",
            "timezone": "America/New_York",
        }
        response = self.client.post(
            self.register_url,
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["email"], "newuser@example.com")
        self.assertEqual(data["display_name"], "New User")
        self.assertEqual(data["timezone"], "America/New_York")
        self.assertIn("id", data)
        self.assertIsInstance(data["id"], int)
        self.assertIn("created_at", data)
        self.assertNotIn("password", data)

        # Verify persisted user in database
        user = User.objects.get(email="newuser@example.com")
        self.assertTrue(user.check_password("SecurePassword123!"))
        self.assertNotEqual(user.password, "SecurePassword123!")

    def test_register_invalid_email_format(self):
        """Malformed email string returns 422 Unprocessable Entity."""
        payload = {
            "email": "not-a-valid-email",
            "password": "SecurePassword123!",
            "display_name": "Invalid Email",
        }
        response = self.client.post(
            self.register_url,
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 422)

    def test_register_duplicate_email_conflict(self):
        """Attempting to register with an existing email returns 409 Conflict."""
        User.objects.create_user(
            email="existing@example.com",
            password="InitialPassword123!",
            display_name="Existing User",
        )
        payload = {
            "email": "EXISTING@example.com",
            "password": "AnotherPassword123!",
            "display_name": "Duplicate User",
        }
        response = self.client.post(
            self.register_url,
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)
        data = response.json()
        self.assertIn("already exists", data["detail"])

    def test_register_weak_password_rejected(self):
        """Password failing Django password validators returns 400 Bad Request."""
        payload = {
            "email": "weak@example.com",
            "password": "12345678",  # Entirely numeric
            "display_name": "Weak Password User",
        }
        response = self.client.post(
            self.register_url,
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn("detail", data)

    def test_register_invalid_timezone_defaults_to_utc(self):
        """Unrecognized timezone string falls back gracefully to UTC."""
        payload = {
            "email": "invalidtz@example.com",
            "password": "SecurePassword123!",
            "display_name": "Invalid TZ",
            "timezone": "NonExistent/Timezone",
        }
        response = self.client.post(
            self.register_url,
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["timezone"], "UTC")

    def test_login_success(self):
        """Valid credentials return 200 with JWT tokens and user profile."""
        User.objects.create_user(
            email="login@example.com",
            password="LoginPassword123!",
            display_name="Login User",
            timezone="America/Chicago",
        )
        payload = {
            "email": "login@example.com",
            "password": "LoginPassword123!",
        }
        response = self.client.post(
            self.login_url,
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("access_token", data)
        self.assertIn("refresh_token", data)
        self.assertEqual(data["token_type"], "bearer")
        self.assertEqual(data["expires_in"], 900)
        self.assertEqual(data["user"]["email"], "login@example.com")
        self.assertEqual(data["user"]["display_name"], "Login User")
        self.assertEqual(data["user"]["timezone"], "America/Chicago")
        self.assertIsInstance(data["user"]["id"], int)

    def test_login_invalid_password(self):
        """Incorrect password returns 401 Unauthorized."""
        User.objects.create_user(
            email="login2@example.com",
            password="CorrectPassword123!",
            display_name="Login User 2",
        )
        payload = {
            "email": "login2@example.com",
            "password": "WrongPassword123!",
        }
        response = self.client.post(
            self.login_url,
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)
        data = response.json()
        self.assertEqual(data["detail"], "Invalid email or password.")

    def test_login_nonexistent_email(self):
        """Nonexistent email returns 401 Unauthorized."""
        payload = {
            "email": "nonexistent@example.com",
            "password": "AnyPassword123!",
        }
        response = self.client.post(
            self.login_url,
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)
        data = response.json()
        self.assertEqual(data["detail"], "Invalid email or password.")

    def test_login_inactive_user(self):
        """Inactive user account returns 403 Forbidden."""
        user = User.objects.create_user(
            email="inactive@example.com",
            password="ActivePassword123!",
            display_name="Inactive User",
        )
        user.is_active = False
        user.save()

        payload = {
            "email": "inactive@example.com",
            "password": "ActivePassword123!",
        }
        response = self.client.post(
            self.login_url,
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)
        data = response.json()
        self.assertIn("inactive", data["detail"].lower())

    def test_refresh_token_flow(self):
        """Valid refresh token generates new access token."""
        User.objects.create_user(
            email="refresh@example.com",
            password="RefreshPassword123!",
            display_name="Refresh User",
        )
        login_resp = self.client.post(
            self.login_url,
            data=json.dumps({"email": "refresh@example.com", "password": "RefreshPassword123!"}),
            content_type="application/json",
        )
        refresh_token = login_resp.json()["refresh_token"]

        response = self.client.post(
            self.refresh_url,
            data=json.dumps({"refresh_token": refresh_token}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("access_token", data)
        self.assertEqual(data["token_type"], "bearer")

    def test_refresh_token_invalid(self):
        """Invalid refresh token returns 401 Unauthorized."""
        response = self.client.post(
            self.refresh_url,
            data=json.dumps({"refresh_token": "bogus-invalid-token"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)
        data = response.json()
        self.assertIn("Invalid or expired", data["detail"])

    def test_me_endpoint_authenticated(self):
        """Accessing /me with valid Bearer token returns current user profile."""
        User.objects.create_user(
            email="me@example.com",
            password="MePassword123!",
            display_name="Me User",
            timezone="Europe/London",
        )
        login_resp = self.client.post(
            self.login_url,
            data=json.dumps({"email": "me@example.com", "password": "MePassword123!"}),
            content_type="application/json",
        )
        access_token = login_resp.json()["access_token"]

        response = self.client.get(
            self.me_url,
            HTTP_AUTHORIZATION=f"Bearer {access_token}",
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["email"], "me@example.com")
        self.assertEqual(data["display_name"], "Me User")
        self.assertEqual(data["timezone"], "Europe/London")

    def test_me_endpoint_unauthenticated(self):
        """Accessing /me without Authorization header returns 401 Unauthorized."""
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, 401)

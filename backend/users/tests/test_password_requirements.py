import json

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings

User = get_user_model()


class PasswordRequirementsTests(TestCase):
    def check(self, password, email="user@example.com"):
        return self.client.post("/api/auth/password-requirements", json.dumps({
            "password": password, "email": email, "display_name": "Test User",
        }), content_type="application/json")

    def test_public_checks_match_registration_validators_and_do_not_persist(self):
        for password in ["", "short", "123456789", "password", "user@example.com", "StrongPass!746xyz"]:
            with self.subTest(password_length=len(password)):
                response = self.check(password)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response["Cache-Control"], "no-store")
                requirements = response.json()["requirements"]
                self.assertEqual(len(requirements), 5)
                try:
                    validate_password(password, User(email="user@example.com", display_name="Test User"))
                    expected = bool(password)
                except ValidationError:
                    expected = False
                self.assertEqual(all(rule["met"] for rule in requirements), expected)
                self.assertTrue(all(set(rule) == {"id", "description", "met"} for rule in requirements))
        self.assertEqual(User.objects.count(), 0)

    def test_individual_rules_change_as_password_changes(self):
        short = {rule["id"]: rule["met"] for rule in self.check("Abc!").json()["requirements"]}
        numeric = {rule["id"]: rule["met"] for rule in self.check("123456789").json()["requirements"]}
        common = {rule["id"]: rule["met"] for rule in self.check("password").json()["requirements"]}
        self.assertFalse(short["MinimumLengthValidator"])
        self.assertTrue(numeric["MinimumLengthValidator"])
        self.assertFalse(numeric["NumericPasswordValidator"])
        self.assertFalse(common["CommonPasswordValidator"])

    def test_similarity_uses_the_current_email_context(self):
        rules = {rule["id"]: rule["met"] for rule in self.check("user@example.com").json()["requirements"]}
        self.assertFalse(rules["UserAttributeSimilarityValidator"])

    @override_settings(AUTH_PASSWORD_VALIDATORS=[{
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},
    }])
    def test_policy_is_read_from_backend_settings(self):
        rule = self.check("Abcde!789").json()["requirements"][0]
        self.assertFalse(rule["met"])
        self.assertIn("12", rule["description"])

    def test_oversized_inputs_are_rejected(self):
        self.assertEqual(self.check("x" * 129).status_code, 422)

    def test_empty_password_has_no_green_checks(self):
        self.assertFalse(any(rule["met"] for rule in self.check("").json()["requirements"]))

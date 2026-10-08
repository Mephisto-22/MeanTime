import uuid
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase

User = get_user_model()


class UserModelTests(TestCase):
    def test_create_user_successful(self):
        """Standard user creation should populate all required fields and defaults."""
        user = User.objects.create_user(
            email="test@example.com",
            password="securePassword123!",
            display_name="Test User",
            timezone="America/Chicago",
        )
        self.assertIsInstance(user.id, uuid.UUID)
        self.assertEqual(user.email, "test@example.com")
        self.assertEqual(user.display_name, "Test User")
        self.assertEqual(user.timezone, "America/Chicago")
        self.assertTrue(user.is_active)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertIsNotNone(user.created_at)
        self.assertTrue(user.check_password("securePassword123!"))
        self.assertNotEqual(user.password, "securePassword123!")

    def test_create_user_default_timezone(self):
        """Timezone should default to UTC when unspecified."""
        user = User.objects.create_user(
            email="default_tz@example.com",
            password="password",
            display_name="Default Tz",
        )
        self.assertEqual(user.timezone, "UTC")

    def test_create_user_normalizes_email(self):
        """Email should be normalized to lowercase."""
        user = User.objects.create_user(
            email="TEST@Example.COM",
            password="password",
            display_name="Normalized",
        )
        self.assertEqual(user.email, "test@example.com")

    def test_create_user_missing_email_raises_error(self):
        """create_user without email should raise ValueError."""
        with self.assertRaises(ValueError):
            User.objects.create_user(
                email="",
                password="password",
                display_name="No Email",
            )
        with self.assertRaises(ValueError):
            User.objects.create_user(
                email=None,
                password="password",
                display_name="None Email",
            )

    def test_duplicate_email_raises_integrity_error(self):
        """Duplicate emails must trigger database integrity error."""
        User.objects.create_user(
            email="duplicate@example.com",
            password="password",
            display_name="First",
        )
        with self.assertRaises(IntegrityError):
            User.objects.create_user(
                email="duplicate@example.com",
                password="password",
                display_name="Second",
            )

    def test_create_superuser_successful(self):
        """create_superuser sets is_staff and is_superuser to True."""
        admin = User.objects.create_superuser(
            email="admin@example.com",
            password="adminPassword123!",
            display_name="Admin",
        )
        self.assertEqual(admin.email, "admin@example.com")
        self.assertTrue(admin.is_staff)
        self.assertTrue(admin.is_superuser)
        self.assertTrue(admin.is_active)

    def test_create_superuser_invalid_flags(self):
        """create_superuser with is_staff=False or is_superuser=False raises ValueError."""
        with self.assertRaises(ValueError):
            User.objects.create_superuser(
                email="admin2@example.com",
                password="pass",
                display_name="Admin2",
                is_staff=False,
            )
        with self.assertRaises(ValueError):
            User.objects.create_superuser(
                email="admin3@example.com",
                password="pass",
                display_name="Admin3",
                is_superuser=False,
            )

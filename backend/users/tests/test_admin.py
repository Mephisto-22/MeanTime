from django.contrib import admin
from django.contrib.auth import get_user_model
from django.test import TestCase
from users.admin import UserAdmin

User = get_user_model()


class UserAdminTests(TestCase):
    def test_user_is_registered_in_admin(self):
        """User model should be registered in admin site with UserAdmin class."""
        self.assertIn(User, admin.site._registry)
        self.assertIsInstance(admin.site._registry[User], UserAdmin)

    def test_user_admin_configuration(self):
        """UserAdmin should configure list_display, search_fields, and ordering."""
        user_admin = admin.site._registry[User]
        self.assertEqual(
            user_admin.list_display,
            ("email", "display_name", "timezone", "is_active", "is_staff", "created_at"),
        )
        self.assertEqual(user_admin.search_fields, ("email", "display_name"))
        self.assertEqual(user_admin.ordering, ("email",))
        self.assertIn("created_at", user_admin.readonly_fields)

    def test_user_admin_forms_bound_to_custom_user_model(self):
        """UserAdmin add_form and form must use the custom User model without errors."""
        user_admin = admin.site._registry[User]
        add_form_class = user_admin.add_form
        change_form_class = user_admin.form
        self.assertEqual(add_form_class._meta.model, User)
        self.assertEqual(change_form_class._meta.model, User)


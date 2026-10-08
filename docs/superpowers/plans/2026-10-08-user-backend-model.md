# Backend User Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the custom Django `User` model, manager, database migrations, and admin configuration to store user information securely in the MeanTime backend.

**Architecture:** A dedicated `users` Django app containing a custom `User` model that subclasses `AbstractBaseUser` and `PermissionsMixin`, configured as `AUTH_USER_MODEL`. It utilizes UUIDv4 for primary keys, email as the unique login credential, password hashing, and custom metadata fields (`display_name`, `timezone`, `created_at`, `is_active`).

**Tech Stack:** Python 3.13+, Django 5.2+, PostgreSQL 18, Docker Compose.

**Spec:** [docs/superpowers/specs/2026-10-08-user-backend-model-design.md](file:///c:/Users/andre/OneDrive/Desktop/MeanTime/docs/superpowers/specs/2026-10-08-user-backend-model-design.md)

## Global Constraints

* Model table name must be `users` (`db_table = "users"`).
* Primary key must be `models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)`.
* `USERNAME_FIELD` must be `"email"`, normalized to lowercase on save.
* `REQUIRED_FIELDS` must be `["display_name"]`.
* `AUTH_USER_MODEL` in `backend/config/settings.py` must point to `"users.User"`.
* Passwords must always be cryptographically hashed via `AbstractBaseUser` / `set_password()`.
* Every task must follow strict TDD: failing tests written and run before implementation code.

## Review Focus

1. **Email case sensitivity**: Emails like `User@Example.COM` and `user@example.com` must normalize identically and collide as duplicates.
2. **Email uniqueness collision**: Creating a second user with the same email must raise `django.db.utils.IntegrityError`.
3. **Empty email validation**: Calling `create_user` with an empty or `None` email must raise `ValueError`.
4. **Superuser permission flags**: Calling `create_superuser` with `is_staff=False` or `is_superuser=False` must raise `ValueError`.
5. **Password security**: Passwords must never be stored in plaintext under any circumstance.

---

### Task 1: Custom User Model and Manager

**Files:**
* Create: `backend/users/__init__.py`
* Create: `backend/users/apps.py`
* Create: `backend/users/managers.py`
* Create: `backend/users/models.py`
* Create: `backend/users/tests/__init__.py`
* Create: `backend/users/tests/test_models.py`
* Modify: `backend/config/settings.py:38-45`

**Interfaces:**
* Consumes: Django `AbstractBaseUser`, `PermissionsMixin`, `BaseUserManager`.
* Produces:
  * `User(AbstractBaseUser, PermissionsMixin)` model with fields: `id` (UUID), `email` (str), `display_name` (str), `password` (str hash), `timezone` (str), `created_at` (datetime), `is_active` (bool), `is_staff` (bool).
  * `UserManager(BaseUserManager)` with `create_user(...) -> User` and `create_superuser(...) -> User`.

- [ ] **Step 1: Write the failing tests in `backend/users/tests/test_models.py`**

```python
import uuid
from django.db import IntegrityError
from django.test import TestCase
from django.contrib.auth import get_user_model

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec backend python manage.py test users.tests.test_models`
Expected: FAIL (ModuleNotFoundError: No module named 'users' or model does not exist)

- [ ] **Step 3: Implement `UsersConfig`, `UserManager`, `User` model, and configure settings**

1. Create `backend/users/apps.py`:
   ```python
   from django.apps import AppConfig

   class UsersConfig(AppConfig):
       default_auto_field = "django.db.models.BigAutoField"
       name = "users"
   ```
2. Create `backend/users/managers.py` implementing `UserManager(BaseUserManager)`.
3. Create `backend/users/models.py` implementing `User(AbstractBaseUser, PermissionsMixin)` with table name `users`.
4. Update `backend/config/settings.py` adding `"users.apps.UsersConfig"` to `INSTALLED_APPS` and setting `AUTH_USER_MODEL = "users.User"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec backend python manage.py test users.tests.test_models`
Expected: PASS (all 7 tests pass)

- [ ] **Step 5: Commit**

```bash
git add backend/config/settings.py backend/users/
git commit -m "feat(users): implement custom user model and manager"
```

---

### Task 2: Database Migration Creation and Verification

**Files:**
* Create: `backend/users/migrations/__init__.py`
* Create: `backend/users/migrations/0001_initial.py` (auto-generated)

**Interfaces:**
* Consumes: `users.User` model definition.
* Produces: PostgreSQL `users` table with UUID primary key, indexes, and constraints.

- [ ] **Step 1: Verify current migration state**

Run: `docker compose exec backend python manage.py showmigrations users`
Expected: `users` has no migrations.

- [ ] **Step 2: Generate initial migration**

Run: `docker compose exec backend python manage.py makemigrations users`
Expected: Output `Migrations for 'users': backend/users/migrations/0001_initial.py - Create model User`.

- [ ] **Step 3: Apply migrations and verify system check**

Run: `docker compose exec backend python manage.py migrate`
Run: `docker compose exec backend python manage.py check`
Expected: `Applying users.0001_initial... OK` and `System check identified no issues (0 silenced)`.

- [ ] **Step 4: Run model tests against migrated database**

Run: `docker compose exec backend python manage.py test users.tests.test_models`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/users/migrations/
git commit -m "feat(users): add initial migration for custom user model"
```

---

### Task 3: Django Admin Registration

**Files:**
* Create: `backend/users/admin.py`
* Create: `backend/users/tests/test_admin.py`

**Interfaces:**
* Consumes: `users.models.User`, `django.contrib.admin.site`.
* Produces: `UserAdmin(admin.ModelAdmin)` registered for `User` in Django admin.

- [ ] **Step 1: Write failing admin unit test in `backend/users/tests/test_admin.py`**

```python
from django.contrib import admin
from django.test import TestCase
from django.contrib.auth import get_user_model
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec backend python manage.py test users.tests.test_admin`
Expected: FAIL (`ImportError: cannot import name 'UserAdmin' from 'users.admin'`)

- [ ] **Step 3: Implement `backend/users/admin.py`**

Implement `UserAdmin` subclassing `django.contrib.auth.admin.UserAdmin` with custom `fieldsets`, `list_display`, `search_fields`, `ordering`, and `readonly_fields`. Register with `admin.site.register(User, UserAdmin)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec backend python manage.py test users.tests.test_admin`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/users/admin.py backend/users/tests/test_admin.py
git commit -m "feat(users): register custom user model in django admin"
```

---

### Task 4: Full Test Suite & Health Endpoint Regression Check

**Files:**
* None modified (verification task).

**Interfaces:**
* Consumes: All tests in `users` and `tests/test_health.py`.
* Produces: Clean pass across the entire MeanTime backend test suite.

- [ ] **Step 1: Run full test suite**

Run: `docker compose exec backend python manage.py test`
Expected: All tests pass (both `users.tests` and `test_health.py`).

- [ ] **Step 2: Verify OpenAPI schema includes clean health checks and system check is clean**

Run: `docker compose exec backend python manage.py check`
Expected: `System check identified no issues (0 silenced)`.

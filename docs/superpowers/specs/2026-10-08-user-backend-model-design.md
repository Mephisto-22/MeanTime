# Specification: Backend User Model

## 1. Overview & Objectives

MeanTime requires a backend persistence model for storing user account details, credentials, and profile configuration. This specification defines the foundational User model and database schema within the Django backend.

### 1.1 In Scope
* Custom Django `User` model implementing required fields:
  * Primary key (UUIDv4)
  * Display name
  * Email (unique identifier and login field)
  * Password (cryptographically hashed)
  * Timezone (default `"UTC"`)
  * Creation timestamp (`created_at`)
  * "Currently active?" status flag (`is_active`, default `True`)
* Custom user manager (`UserManager`) providing `create_user` and `create_superuser`.
* Setting `AUTH_USER_MODEL = "users.User"` in `config/settings.py`.
* Registering `User` in Django Admin with a customized `UserAdmin`.
* Creating and validating the initial database migration.
* Comprehensive unit tests covering user creation, password hashing, email uniqueness, and manager validations.

### 1.2 Out of Scope
* HTTP API endpoints for registration, login, logout, and profile editing (deferred to subsequent backlog items).
* Authentication tokens / JWT / session views.
* Frontend integration or profile UI.

---

## 2. Architecture & File Layout

A new Django app named `users` will be introduced in `backend/users/`:

```
backend/
├── config/
│   ├── settings.py           # Updated to add users app and AUTH_USER_MODEL
│   └── ...
└── users/
    ├── __init__.py
    ├── admin.py              # Custom UserAdmin for Django admin
    ├── apps.py               # UsersConfig app configuration
    ├── managers.py           # UserManager implementation
    ├── models.py             # User model definition
    ├── migrations/
    │   ├── __init__.py
    │   └── 0001_initial.py   # Generated initial migration
    └── tests/
        ├── __init__.py
        └── test_models.py    # Unit tests for User model and manager
```

---

## 3. Data Model Specification

### 3.1 Model Definition: `User`
* **Base Classes**: `django.contrib.auth.models.AbstractBaseUser`, `django.contrib.auth.models.PermissionsMixin`
* **Database Table**: `users` (`Meta.db_table = "users"`)
* **Ordering**: Default ordering by `email` (`Meta.ordering = ["email"]`)

### 3.2 Fields
| Field Name | Django Field Type | Constraints & Defaults | Description |
|---|---|---|---|
| `id` | `UUIDField` | `primary_key=True`, `default=uuid.uuid4`, `editable=False` | Secure unique identifier preventing enumeration attacks. |
| `email` | `EmailField` | `unique=True`, `max_length=254`, `db_index=True` | Unique login identifier (`USERNAME_FIELD = "email"`). |
| `display_name` | `CharField` | `max_length=50` | User's preferred display name. Included in `REQUIRED_FIELDS`. |
| `password` | Handled by `AbstractBaseUser` | `max_length=128` | Cryptographically hashed password. Never stored in plaintext. |
| `timezone` | `CharField` | `max_length=63`, `default="UTC"` | Standard IANA timezone identifier. Defaults to `"UTC"`. |
| `created_at` | `DateTimeField` | `auto_now_add=True`, `editable=False` | Immutable timestamp of when the user account was created. |
| `is_active` | `BooleanField` | `default=True` | "Currently active?" status flag. Inactive users cannot authenticate. |
| `is_staff` | `BooleanField` | `default=False` | Controls whether user can access the Django admin site. |
| `is_superuser` | `BooleanField` | `default=False` (inherited via `PermissionsMixin`) | Superuser flag with all permissions. |
| `groups` | `ManyToManyField` | Inherited via `PermissionsMixin` | Permission groups. |
| `user_permissions` | `ManyToManyField` | Inherited via `PermissionsMixin` | Granular user-specific permissions. |

---

## 4. Model Manager Specification

### 4.1 Class: `UserManager(BaseUserManager)`
Attached to `User.objects = UserManager()`.

* **`create_user(email, password=None, display_name="", timezone="UTC", **extra_fields)`**:
  1. Validates that `email` is provided (raises `ValueError("Users must have an email address")` if blank or `None`).
  2. Normalizes email via `self.normalize_email(email).lower()`.
  3. Sets `display_name` and `timezone` on the model instance along with any `extra_fields`.
  4. Sets password via `user.set_password(password)`.
  5. Saves instance using `user.save(using=self._db)` and returns the user.

* **`create_superuser(email, password=None, display_name="Admin", **extra_fields)`**:
  1. Sets `extra_fields.setdefault("is_staff", True)`.
  2. Sets `extra_fields.setdefault("is_superuser", True)`.
  3. Sets `extra_fields.setdefault("is_active", True)`.
  4. Validates that `is_staff` and `is_superuser` are `True` (raises `ValueError` otherwise).
  5. Calls `self.create_user(email, password, display_name=display_name, **extra_fields)`.

---

## 5. Django Settings & Admin Integration

### 5.1 Settings Updates (`backend/config/settings.py`)
* Append `"users.apps.UsersConfig"` to `INSTALLED_APPS`.
* Define `AUTH_USER_MODEL = "users.User"`.

### 5.2 Admin Customization (`backend/users/admin.py`)
* Subclass `django.contrib.auth.admin.UserAdmin`.
* Override configuration:
  * `list_display = ("email", "display_name", "timezone", "is_active", "is_staff", "created_at")`
  * `list_filter = ("is_active", "is_staff", "is_superuser")`
  * `search_fields = ("email", "display_name")`
  * `ordering = ("email",)`
  * `fieldsets`:
    * General: `(None, {"fields": ("email", "password")})`
    * Personal Info: `("Personal Info", {"fields": ("display_name", "timezone")})`
    * Permissions: `("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")})`
    * Important Dates: `("Important Dates", {"fields": ("created_at", "last_login")})`
  * `readonly_fields = ("created_at", "last_login")`

---

## 6. Testing & Verification Plan

Following Test-Driven Development (TDD):
1. **Model creation test**: Verify normal user creation sets all fields (`id` is UUID4, `email`, `display_name`, `timezone="UTC"`, `created_at` populated, `is_active=True`, `is_staff=False`).
2. **Password test**: Verify `check_password` validates correctly and `user.password` is hashed.
3. **Email validation**: Verify `create_user` without email raises `ValueError`.
4. **Email normalization**: Verify `create_user` normalizes domain and lowercase representation.
5. **Email uniqueness**: Verify creating duplicate emails raises `IntegrityError`.
6. **Superuser test**: Verify `create_superuser` creates superuser with appropriate flags.
7. **Superuser flags validation**: Verify error is raised if `is_staff` or `is_superuser` is set to `False`.
8. **Django check & migration**: Verify `python manage.py check` passes with 0 issues and migrations run without conflict.
9. **Regression check**: Verify existing health checks (`backend/tests/test_health.py`) continue to pass.

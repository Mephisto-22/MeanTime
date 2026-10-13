# Specification: User Registration and Login Payloads & Endpoints

## 1. Overview & Objectives

MeanTime requires secure HTTP API endpoints for user registration, authentication, token refresh, and user profile inspection. This specification defines the request/response payloads, authentication mechanism, validation rules, and error contracts.

### 1.1 In Scope
* API Schemas:
  * `RegisterIn`: User registration request payload.
  * `LoginIn`: User authentication request payload.
  * `RefreshIn`: Token renewal request payload.
  * `UserOut`: Public safe user profile representation.
  * `TokenRefreshOut`: Renewed JWT access token response.
  * `AuthTokenOut`: JWT access and refresh token response with user profile.
* Endpoints mounted on `/api/auth/`:
  * `POST /register`: Registers new user; returns `201 Created` with `UserOut`. Does not auto-login.
  * `POST /login`: Authenticates email/password; returns `200 OK` with `AuthTokenOut`.
  * `POST /refresh`: Renews access token; returns `200 OK` with `TokenRefreshOut`.
  * `GET /me`: Returns profile of authenticated user; secured with `JWTAuth()`.
* Validation & Security:
  * Password validation using Django's configured `AUTH_PASSWORD_VALIDATORS`.
  * Email normalization to lowercase.
  * Timezone resolution against IANA timezone database with fallback to `"UTC"`.
  * Generic error messages on authentication failure to prevent account enumeration.
* Unit testing covering happy paths, validation failures, conflicts, inactive user states, and authorization checks.

### 1.2 Out of Scope
* Nuxt frontend UI forms and pages (handled in subsequent backlog tasks).
* Email verification and password reset workflows.
* Social OAuth login (Google/GitHub).

---

## 2. Architecture & File Layout

```
backend/
├── config/
│   ├── api.py                  # Mounts auth_router at /auth and handles APIException
│   └── settings.py             # Configures ninja_jwt and NINJA_JWT settings
├── pyproject.toml              # Adds django-ninja-jwt dependency
└── users/
    ├── api.py                  # Router with /register, /login, /refresh, and /me endpoints
    ├── schemas.py              # Pydantic schemas (RegisterIn, LoginIn, UserOut, etc.)
    └── tests/
        └── test_auth_api.py    # Unit tests for authentication endpoints
```

---

## 3. Data Contracts & Schemas

### 3.1 `RegisterIn`
| Field | Type | Required | Constraints / Default | Description |
|---|---|---|---|---|
| `email` | `EmailStr` | Yes | Valid email format | User's unique login email. |
| `password` | `str` | Yes | 8–128 chars, validated against Django rules | Raw password. |
| `display_name` | `str` | Yes | 1–50 chars | User display name. |
| `timezone` | `str` | No | Default `"UTC"`, validated against IANA zones | Client-detected timezone. |

### 3.2 `LoginIn`
| Field | Type | Required | Description |
|---|---|---|---|
| `email` | `EmailStr` | Yes | User's email. |
| `password` | `str` | Yes | User's password. |

### 3.3 `RefreshIn`
| Field | Type | Required | Description |
|---|---|---|---|
| `refresh_token` | `str` | Yes | Opaque JWT refresh token. |

### 3.4 `UserOut`
| Field | Type | Description |
|---|---|---|
| `id` | `UUID` | User's unique identifier. |
| `email` | `str` | User's email. |
| `display_name` | `str` | Display name. |
| `timezone` | `str` | IANA timezone identifier. |
| `created_at` | `datetime` | Account creation timestamp. |

### 3.5 `AuthTokenOut`
| Field | Type | Description |
|---|---|---|
| `access_token` | `str` | JWT access token (15-minute TTL). |
| `refresh_token` | `str` | JWT refresh token (7-day TTL). |
| `token_type` | `str` | `"bearer"` |
| `expires_in` | `int` | `900` (seconds) |
| `user` | `UserOut` | Authenticated user profile. |

---

## 4. Error Responses

| Status Code | Scenario | Response Shape |
|---|---|---|
| `400 Bad Request` | Password fails Django validation rules | `{"detail": "<error message>"}` |
| `401 Unauthorized` | Invalid credentials or invalid/expired token | `{"detail": "Invalid email or password."}` |
| `403 Forbidden` | Account inactive (`is_active = False`) | `{"detail": "This account is inactive."}` |
| `409 Conflict` | Email already registered | `{"detail": "An account with this email address already exists."}` |
| `422 Unprocessable` | Malformed body or schema type error | `{"detail": [...]}` (Django Ninja default) |

---

## 5. Verification & Testing

Tests reside in `backend/users/tests/test_auth_api.py` validating:
1. Registration creation, hashing, and response shape.
2. Duplicate email returns 409 Conflict.
3. Weak passwords rejected with 400 Bad Request.
4. Invalid timezones fallback gracefully to UTC.
5. Login returning tokens and user profile.
6. Incorrect credentials and nonexistent emails returning 401 Unauthorized.
7. Inactive users returning 403 Forbidden.
8. Refresh token cycle generating valid access tokens.
9. Protected `/me` access with Bearer tokens and rejection of unauthenticated requests.

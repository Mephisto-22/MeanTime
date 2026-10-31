from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from users.forms import CustomUserChangeForm, CustomUserCreationForm
from users.models import ExternalAccount, User


class ExternalAccountInline(admin.TabularInline):
    """Google (or other provider) accounts that sign in as this user. Read-only."""

    model = ExternalAccount
    fields = ("provider", "subject", "created_at")
    readonly_fields = fields
    extra = 0
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Custom admin representation for MeanTime User model."""

    form = CustomUserChangeForm
    add_form = CustomUserCreationForm
    inlines = (ExternalAccountInline,)

    list_display = ("email", "display_name", "timezone", "is_active", "is_staff", "created_at")
    list_filter = ("is_active", "is_staff", "is_superuser")
    search_fields = ("email", "display_name")
    ordering = ("email",)
    readonly_fields = ("created_at", "last_login", "resetting_password", "password_reset_started_at")

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal Info", {"fields": ("display_name", "timezone")}),
        (
            "Permissions",
            {
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                )
            },
        ),
        ("Important Dates", {"fields": ("created_at", "last_login")}),
        ("Password Reset", {"fields": ("resetting_password", "password_reset_started_at")}),
    )

    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "email",
                    "display_name",
                    "password1",
                    "password2",
                    "timezone",
                    "is_active",
                    "is_staff",
                ),
            },
        ),
    )

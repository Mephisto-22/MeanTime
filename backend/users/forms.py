from django.contrib.auth import get_user_model
from django.contrib.auth.forms import UserChangeForm, UserCreationForm

User = get_user_model()


class CustomUserCreationForm(UserCreationForm):
    """Admin creation form for custom User model."""

    class Meta(UserCreationForm.Meta):
        model = User
        fields = ("email", "display_name", "timezone")


class CustomUserChangeForm(UserChangeForm):
    """Admin change form for custom User model."""

    class Meta(UserChangeForm.Meta):
        model = User
        fields = "__all__"

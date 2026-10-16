from django.contrib.auth.models import BaseUserManager


class UserManager(BaseUserManager):
    """Custom manager for the MeanTime User model with email as unique identifier."""

    def create_user(self, email, password=None, display_name="", timezone="UTC", **extra_fields):
        if not email:
            raise ValueError("Users must have an email address")

        email = self.normalize_email(email).lower()
        user = self.model(
            email=email,
            display_name=display_name,
            timezone=timezone,
            **extra_fields,
        )
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, display_name="Admin", **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self.create_user(
            email=email,
            password=password,
            display_name=display_name,
            **extra_fields,
        )

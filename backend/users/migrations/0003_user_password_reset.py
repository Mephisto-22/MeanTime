from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("users", "0002_user_unique_user_email_case_insensitive")]

    operations = [
        migrations.AddField(
            model_name="user",
            name="password_version",
            field=models.PositiveIntegerField(default=0, editable=False),
        ),
        migrations.AddField(
            model_name="user",
            name="resetting_password",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="user",
            name="password_reset_started_at",
            field=models.DateTimeField(null=True, blank=True),
        ),
    ]

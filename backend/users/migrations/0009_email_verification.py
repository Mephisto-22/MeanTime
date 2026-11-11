from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("users", "0008_remove_friendship_blocked_by_alter_friendship_status")]
    operations = [
        migrations.AddField("user", "is_verified", models.BooleanField(default=True)),
        migrations.AddField("user", "email_verification_version", models.PositiveIntegerField(default=0, editable=False)),
        migrations.AddField("user", "email_verification_sent_at", models.DateTimeField(null=True, blank=True, editable=False)),
    ]

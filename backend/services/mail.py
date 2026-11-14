"""Shared transactional mail delivery through Django backends or Amazon SES."""
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.mail import send_mail
from django.core.mail.backends.base import BaseEmailBackend


class SESBackend(BaseEmailBackend):
    def send_messages(self, email_messages):
        if not email_messages:
            return 0
        if not settings.AWS_SES_REGION or not settings.DEFAULT_FROM_EMAIL:
            raise ImproperlyConfigured("Configure AWS_SES_REGION and DEFAULT_FROM_EMAIL for SES delivery.")
        import boto3
        from botocore.config import Config

        # boto3 obtains temporary credentials from the ECS task role on AWS.
        client = boto3.client("sesv2", region_name=settings.AWS_SES_REGION,
                              config=Config(connect_timeout=5, read_timeout=10, retries={"max_attempts": 1}))
        count = 0
        for message in email_messages:
            try:
                client.send_email(
                    FromEmailAddress=message.from_email,
                    Destination={"ToAddresses": message.recipients()},
                    Content={"Raw": {"Data": message.message().as_bytes()}},
                )
                count += 1
            except Exception:
                if not self.fail_silently:
                    raise
        return count


def send_transactional_email(subject, body, recipient):
    if settings.EMAIL_BACKEND == "django.core.mail.backends.dummy.EmailBackend":
        raise ImproperlyConfigured("Transactional emails cannot use the dummy email backend.")
    if settings.EMAIL_BACKEND == "django.core.mail.backends.console.EmailBackend":
        # Plain output preserves long fragment URLs for local development.
        print(f"MeanTime email (development only)\nTo: {recipient}\n{subject}\n{body}", flush=True)
        return
    if send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [recipient], fail_silently=False) != 1:
        raise RuntimeError("The mail backend did not accept the email.")

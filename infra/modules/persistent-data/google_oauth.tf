# Google sign-in credentials (#92), from the OAuth client in the Google Cloud
# console. One client serves every environment.
#
# Unlike the secrets in main.tf, these can't be generated. Terraform creates
# them with a placeholder; enter the real values in Parameter Store after the
# first apply. Terraform then leaves them alone, so the real values are never
# in the repository or the Terraform state.

resource "aws_ssm_parameter" "google_oauth_client_id" {
  name  = "/meantime/${var.environment}/google-oauth-client-id"
  type  = "SecureString"
  value = "set-me-in-parameter-store"

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "google_oauth_client_secret" {
  name  = "/meantime/${var.environment}/google-oauth-client-secret"
  type  = "SecureString"
  value = "set-me-in-parameter-store"

  lifecycle {
    ignore_changes = [value]
  }
}

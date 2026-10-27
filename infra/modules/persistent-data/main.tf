# Data that outlives the app layer (#66): the database's files and the secrets
# that go with them. The app layer can be torn down every night and brought
# back up with the same data.
#
# The file system isn't tied to a network. Each time the app layer comes up,
# it connects the file system to its VPC with mount targets.

locals {
  name = "meantime-${var.environment}"
}

# ---------------------------------------------------------------------------
# Database files
# ---------------------------------------------------------------------------

# The app module finds the file system by this creation token.
resource "aws_efs_file_system" "db" {
  creation_token = "${local.name}-db"
  encrypted      = true

  tags = { Name = "${local.name}-db" }
}

# Postgres's folder on the file system, owned by the postgres user of the
# postgres:18-alpine image (uid and gid 70).
resource "aws_efs_access_point" "db" {
  file_system_id = aws_efs_file_system.db.id

  root_directory {
    path = "/postgres"

    creation_info {
      owner_uid   = 70
      owner_gid   = 70
      permissions = "0700"
    }
  }

  tags = { Name = "${local.name}-db" }
}

# ---------------------------------------------------------------------------
# Secrets: generated here, stored encrypted in SSM Parameter Store, and
# injected into the containers by ECS when they start. The database keeps
# the password it was created with, so it must outlive the app layer too.
# ---------------------------------------------------------------------------

resource "random_password" "django_secret_key" {
  length  = 50
  special = true
}

resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "aws_ssm_parameter" "django_secret_key" {
  name  = "/meantime/${var.environment}/django-secret-key"
  type  = "SecureString"
  value = random_password.django_secret_key.result
}

resource "aws_ssm_parameter" "db_password" {
  name  = "/meantime/${var.environment}/db-password"
  type  = "SecureString"
  value = random_password.db_password.result
}

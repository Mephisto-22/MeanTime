# prod / base layer (kept between demos): ECR image repositories (#45), the
# GitHub Actions role (#61), and the database's files and secrets (#66).
#
# Initialize with the shared backend settings for this environment:
#   terraform init -backend-config=../backend.hcl

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  backend "s3" {
    key = "base/terraform.tfstate"
  }
}

variable "aws_profile" {
  description = "AWS CLI profile to sign in with. Set to null to use the default credential chain (for example in CI)."
  type        = string
  default     = "meantime-prod"
  nullable    = true
}

provider "aws" {
  profile = var.aws_profile
  region  = "us-east-2"

  default_tags {
    tags = {
      Project     = "MeanTime"
      Environment = "prod"
      ManagedBy   = "Terraform"
      Layer       = "base"
    }
  }
}

module "ecr" {
  source = "../../../modules/ecr"
}

output "repository_urls" {
  description = "Image repository URLs for our own images: frontend and backend."
  value       = module.ecr.repository_urls
}

output "registry" {
  description = "Registry host to `docker login` to."
  value       = module.ecr.registry
}

module "github_oidc" {
  source = "../../../modules/github-oidc"

  environment      = "prod"
  allowed_branches = ["main"]
}

output "github_actions_role_arn" {
  description = "Role for GitHub Actions workflows to assume in the prod account."
  value       = module.github_oidc.role_arn
}

module "persistent_data" {
  source = "../../../modules/persistent-data"

  environment = "prod"
}

output "db_file_system_id" {
  description = "EFS file system holding the database's files. Destroying base deletes the data."
  value       = module.persistent_data.db_file_system_id
}

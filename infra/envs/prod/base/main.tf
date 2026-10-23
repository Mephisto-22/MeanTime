# prod / base layer (kept between demos): ECR image repositories (#45).
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

# ECR repositories are added in #45.

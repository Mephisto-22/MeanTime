# dev / app layer (temporary, brought up and torn down): the network (#46) and the ECS service (#47).
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
    key = "app/terraform.tfstate"
  }
}

variable "aws_profile" {
  description = "AWS CLI profile to sign in with. Set to null to use the default credential chain (for example in CI)."
  type        = string
  default     = "meantime-dev"
  nullable    = true
}

provider "aws" {
  profile = var.aws_profile
  region  = "us-east-2"

  default_tags {
    tags = {
      Project     = "MeanTime"
      Environment = "dev"
      ManagedBy   = "Terraform"
      Layer       = "app"
    }
  }
}

module "network" {
  source = "../../../modules/network"

  environment = "dev"
  public      = false
  vpc_cidr    = "10.10.0.0/16"
}

# The ECS service is added in #47.

output "vpc_id" {
  description = "ID of the dev VPC."
  value       = module.network.vpc_id
}

output "task_subnet_ids" {
  description = "Subnets the ECS task runs in."
  value       = module.network.task_subnet_ids
}

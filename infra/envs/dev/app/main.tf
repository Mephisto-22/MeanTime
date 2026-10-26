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
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
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

module "app" {
  source = "../../../modules/app"

  environment = "dev"
  public      = false
  aws_region  = "us-east-2"
  aws_profile = "meantime-dev"
  source_root = abspath("${path.root}/../../../..")

  vpc_id                          = module.network.vpc_id
  task_subnet_ids                 = module.network.task_subnet_ids
  task_assign_public_ip           = module.network.task_assign_public_ip
  task_security_group_id          = module.network.task_security_group_id
  load_balancer_subnet_ids        = module.network.load_balancer_subnet_ids
  load_balancer_security_group_id = module.network.load_balancer_security_group_id
}

output "vpc_id" {
  description = "ID of the dev VPC."
  value       = module.network.vpc_id
}

output "task_subnet_ids" {
  description = "Subnets the ECS task runs in."
  value       = module.network.task_subnet_ids
}

output "dev_tunnel_command" {
  description = "Paste into Git Bash (or any bash shell) to open Dev at http://localhost:3000."
  value       = module.app.dev_tunnel_command
}

output "log_group" {
  description = "CloudWatch log group with each container's logs."
  value       = module.app.log_group
}

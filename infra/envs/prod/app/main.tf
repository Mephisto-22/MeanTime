# prod / app layer (temporary, brought up and torn down): the network (#46) and the ECS service (#47).
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
      Layer       = "app"
    }
  }
}

module "network" {
  source = "../../../modules/network"

  environment = "prod"
  public      = true
  vpc_cidr    = "10.20.0.0/16"
}

module "app" {
  source = "../../../modules/app"

  environment = "prod"
  public      = true
  aws_region  = "us-east-2"
  aws_profile = "meantime-prod"
  source_root = abspath("${path.root}/../../../..")

  # HTTPS on the domain from the base layer (#93). Remove this line to go back
  # to plain HTTP at the load balancer's own address.
  domain_name = "meantime.click"

  vpc_id                          = module.network.vpc_id
  task_subnet_ids                 = module.network.task_subnet_ids
  task_assign_public_ip           = module.network.task_assign_public_ip
  task_security_group_id          = module.network.task_security_group_id
  load_balancer_subnet_ids        = module.network.load_balancer_subnet_ids
  load_balancer_security_group_id = module.network.load_balancer_security_group_id
}

output "vpc_id" {
  description = "ID of the prod VPC."
  value       = module.network.vpc_id
}

output "task_subnet_ids" {
  description = "Subnets the ECS task runs in."
  value       = module.network.task_subnet_ids
}

output "app_url" {
  description = "Public URL of MeanTime in Prod."
  value       = module.app.app_url
}

output "log_group" {
  description = "CloudWatch log group with each container's logs."
  value       = module.app.log_group
}

variable "environment" {
  description = "Environment name, used in resource names (dev or prod)."
  type        = string
}

variable "public" {
  description = "true: serve the app through a public load balancer (Prod). false: no public access; developers use the Session Manager tunnel (Dev)."
  type        = bool
}

variable "aws_region" {
  description = "Region everything runs in. Used for log configuration and the Dev tunnel command."
  type        = string
}

variable "aws_profile" {
  description = "AWS CLI profile name to put in the Dev tunnel command."
  type        = string
}

variable "domain_name" {
  description = "Domain to serve the app at over HTTPS (Prod only). Its Route 53 zone and ACM certificate come from the base layer. null: plain HTTP at the load balancer's own address."
  type        = string
  default     = null
}

variable "source_root" {
  description = "Absolute path to the repository root, where the backend/ and frontend/ folders are."
  type        = string
}

# --- From the network module (#46) ---------------------------------------------

variable "vpc_id" {
  description = "VPC the app runs in."
  type        = string
}

variable "task_subnet_ids" {
  description = "Subnets to run the ECS task in."
  type        = list(string)
}

variable "task_assign_public_ip" {
  description = "Whether the task gets a public IP for outbound traffic (Prod)."
  type        = bool
}

variable "task_security_group_id" {
  description = "Security group for the ECS task."
  type        = string
}

variable "load_balancer_subnet_ids" {
  description = "Public subnets for the load balancer (Prod only)."
  type        = list(string)
}

variable "load_balancer_security_group_id" {
  description = "Security group for the load balancer (Prod only; null in Dev)."
  type        = string
  default     = null
}

# --- Task sizing ----------------------------------------------------------------

variable "task_cpu" {
  description = "CPU units for the whole task (1024 = 1 vCPU), shared by all three containers."
  type        = number
  default     = 512
}

variable "task_memory" {
  description = "Memory in MiB for the whole task, shared by all three containers."
  type        = number
  default     = 1024
}

variable "log_retention_days" {
  description = "How long to keep container logs in CloudWatch."
  type        = number
  default     = 7
}

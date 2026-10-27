variable "environment" {
  description = "Environment name, used in resource names (dev or prod)."
  type        = string
}

variable "public" {
  description = <<-EOT
    true: public network for a load balancer (two public subnets, no NAT gateway).
    false: private network with no public IPs; outbound internet through a NAT gateway.
  EOT
  type        = bool
}

variable "vpc_cidr" {
  description = "IP range for the VPC."
  type        = string
}

variable "app_port" {
  description = "Port the load balancer forwards to on the ECS task (the frontend container)."
  type        = number
  default     = 3000
}

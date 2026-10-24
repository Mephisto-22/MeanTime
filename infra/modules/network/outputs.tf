output "vpc_id" {
  description = "ID of the VPC."
  value       = aws_vpc.this.id
}

output "task_subnet_ids" {
  description = "Subnets to run the ECS task in: private in Dev, public in Prod."
  value       = var.public ? aws_subnet.public[*].id : aws_subnet.private[*].id
}

output "task_assign_public_ip" {
  description = "Whether the ECS task needs a public IP for outbound traffic (Prod only; Dev uses the NAT gateway)."
  value       = var.public
}

output "task_security_group_id" {
  description = "Security group for the ECS task."
  value       = aws_security_group.task.id
}

output "load_balancer_subnet_ids" {
  description = "Public subnets for the load balancer (Prod only; empty in Dev)."
  value       = var.public ? aws_subnet.public[*].id : []
}

output "load_balancer_security_group_id" {
  description = "Security group for the load balancer (Prod only; null in Dev)."
  value       = var.public ? aws_security_group.load_balancer[0].id : null
}

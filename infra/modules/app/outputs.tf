locals {
  cli = "--profile ${var.aws_profile} --region ${var.aws_region}"

  # Looks up the running task when you run it, so it keeps working after the
  # task restarts. Connects through the db container; the tunnel reaches port
  # 3000 because all containers share the task's network.
  dev_tunnel_command = join(" && ", [
    "TASK=$(aws ecs list-tasks ${local.cli} --cluster ${local.name} --query 'taskArns[0]' --output text)",
    "RUNTIME=$(aws ecs describe-tasks ${local.cli} --cluster ${local.name} --tasks \"$TASK\" --query \"tasks[0].containers[?name=='db'].runtimeId | [0]\" --output text)",
    "aws ssm start-session ${local.cli} --target \"ecs:${local.name}_$${TASK##*/}_$RUNTIME\" --document-name AWS-StartPortForwardingSession --parameters '{\"portNumber\":[\"3000\"],\"localPortNumber\":[\"3000\"]}'",
  ])
}

output "app_url" {
  description = "Public URL of the app (Prod only; null in Dev)."
  value       = var.public ? "http://${aws_lb.this[0].dns_name}" : null
}

output "dev_tunnel_command" {
  description = "Command that opens the Dev app at http://localhost:3000 through Session Manager (Dev only; null in Prod)."
  value       = var.public ? null : local.dev_tunnel_command
}

output "cluster_name" {
  description = "Name of the ECS cluster."
  value       = aws_ecs_cluster.this.name
}

output "log_group" {
  description = "CloudWatch log group with each container's logs."
  value       = aws_cloudwatch_log_group.this.name
}

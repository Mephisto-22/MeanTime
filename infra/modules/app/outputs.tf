locals {
  cli = "--profile ${var.aws_profile} --region ${var.aws_region}"

  # The Dev tunnel commands look up the running task when you run them, so
  # they keep working after the task restarts. They connect through the db
  # container; the tunnel reaches port 3000 because all containers share the
  # task's network.
  tunnel_query_task    = "--cluster ${local.name} --query 'taskArns[0]' --output text"
  tunnel_query_runtime = "--query \"tasks[0].containers[?name=='db'].runtimeId | [0]\" --output text"
  tunnel_start         = "--document-name AWS-StartPortForwardingSession --parameters portNumber=3000,localPortNumber=3000"

  dev_tunnel_command_bash = join(" && ", [
    "TASK=$(aws ecs list-tasks ${local.cli} ${local.tunnel_query_task})",
    "RUNTIME=$(aws ecs describe-tasks ${local.cli} --cluster ${local.name} --tasks \"$TASK\" ${local.tunnel_query_runtime})",
    "aws ssm start-session ${local.cli} --target \"ecs:${local.name}_$${TASK##*/}_$RUNTIME\" ${local.tunnel_start}",
  ])

  dev_tunnel_command_powershell = join("; ", [
    "$task = aws ecs list-tasks ${local.cli} ${local.tunnel_query_task}",
    "$runtime = aws ecs describe-tasks ${local.cli} --cluster ${local.name} --tasks $task ${local.tunnel_query_runtime}",
    "aws ssm start-session ${local.cli} --target \"ecs:${local.name}_$($task.Split('/')[-1])_$runtime\" ${local.tunnel_start}",
  ])
}

output "app_url" {
  description = "Public URL of the app (Prod only; null in Dev)."
  value       = local.app_url
}

output "dev_tunnel_command" {
  description = "Bash command (Git Bash, macOS, Linux) that opens the Dev app at http://localhost:3000 (Dev only; null in Prod)."
  value       = var.public ? null : local.dev_tunnel_command_bash
}

output "dev_tunnel_command_powershell" {
  description = "PowerShell command that opens the Dev app at http://localhost:3000 (Dev only; null in Prod)."
  value       = var.public ? null : local.dev_tunnel_command_powershell
}

output "cluster_name" {
  description = "Name of the ECS cluster."
  value       = aws_ecs_cluster.this.name
}

output "log_group" {
  description = "CloudWatch log group with each container's logs."
  value       = aws_cloudwatch_log_group.this.name
}

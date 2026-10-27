output "role_arn" {
  description = "ARN of the role GitHub Actions workflows assume (aws-actions/configure-aws-credentials role-to-assume)."
  value       = aws_iam_role.github_actions.arn
}

# The sender identity must already be verified in SES in this region.
# No identities, DNS records, or production-access requests are created here.
variable "ses_sender_identity_arn" {
  description = "Verified SES sender identity ARN; null leaves email delivery unconfigured."
  type        = string
  default     = null
}

variable "email_from_address" {
  description = "From address belonging to the verified SES identity."
  type        = string
  default     = ""
}

# While the account is in the SES sandbox, SES also checks permission on the
# recipient's verified identity, not just the sender's. So the policy covers
# every identity in the account, and the From address condition still limits
# sending to the one sender.
resource "aws_iam_role_policy" "ses_send" {
  count = var.ses_sender_identity_arn == null ? 0 : 1
  name  = "send-transactional-email"
  role  = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ses:SendEmail"]
      Resource = replace(var.ses_sender_identity_arn, "/identity/.*$/", "identity/*")
      Condition = {
        StringEquals = { "ses:FromAddress" = var.email_from_address }
      }
    }]
  })
}

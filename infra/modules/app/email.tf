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

resource "aws_iam_role_policy" "ses_send" {
  count = var.ses_sender_identity_arn == null ? 0 : 1
  name  = "send-transactional-email"
  role  = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ses:SendEmail"]
      Resource = var.ses_sender_identity_arn
      Condition = {
        StringEquals = { "ses:FromAddress" = var.email_from_address }
      }
    }]
  })
}

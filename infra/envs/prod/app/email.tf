# Confirmation and password reset emails come from Prod's domain. Its SES
# identity and DKIM records are in the base layer (base/domain.tf). The values
# are set here rather than passed in, because CI applies this layer without
# any inputs. The ARN is built from the signed-in account so the account ID
# isn't written into the repository.
data "aws_caller_identity" "current" {}

locals {
  email_domain            = "meantime.click"
  email_from_address      = "noreply@${local.email_domain}"
  ses_sender_identity_arn = "arn:aws:ses:us-east-2:${data.aws_caller_identity.current.account_id}:identity/${local.email_domain}"
}

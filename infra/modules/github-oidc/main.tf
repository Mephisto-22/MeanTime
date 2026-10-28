# Lets GitHub Actions workflows sign in to this AWS account with short-lived
# credentials (OIDC), so no AWS keys are stored in GitHub.
#
# Only workflows from the allowed branches of one repository can use the role.
# Pull requests and forks get a different identity and are refused. Workflows
# must not set `environment:` on their jobs, because that changes the identity
# GitHub presents and the branch rule below would no longer match.

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [for b in var.allowed_branches : "repo:${var.github_repository}:ref:refs/heads/${b}"]
    }
  }
}

resource "aws_iam_role" "github_actions" {
  name                 = "meantime-${var.environment}-github-actions"
  description          = "Used by GitHub Actions workflows in ${var.github_repository} (${join(", ", var.allowed_branches)})"
  assume_role_policy   = data.aws_iam_policy_document.trust.json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "github_actions" {
  for_each = toset(var.policy_arns)

  role       = aws_iam_role.github_actions.name
  policy_arn = each.value
}

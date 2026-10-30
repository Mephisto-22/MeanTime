variable "environment" {
  description = "Environment name, used in the role name (dev or prod)."
  type        = string
}

variable "github_repository" {
  description = "GitHub repository allowed to use the role, as it appears in the OIDC subject. The repository uses immutable subjects, so that's owner@owner-id/name@repo-id rather than owner/name."
  type        = string
  default     = "Mephisto-22@127533986/MeanTime@1393919934"
}

variable "allowed_branches" {
  description = "Branches whose workflows may use the role. Scheduled workflows always run on the default branch (main)."
  type        = list(string)
}

variable "policy_arns" {
  description = "Managed policies attached to the role."
  type        = list(string)
  default     = ["arn:aws:iam::aws:policy/AdministratorAccess"]
}

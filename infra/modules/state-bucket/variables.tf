variable "environment" {
  description = "This bucket holds Terraform state for (dev or prod)."
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be \"dev\" or \"prod\"."
  }
}

variable "noncurrent_version_days" {
  description = "Days to keep old versions of each state file before S3 deletes them."
  type        = number
  default     = 90
}

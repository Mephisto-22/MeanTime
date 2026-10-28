variable "repositories" {
  description = "Short names of the image repositories to create for our own images. Each becomes meantime/<name>."
  type        = set(string)
  default     = ["frontend", "backend"]
}

variable "keep_images" {
  description = "How many of the most recent images to keep in each repository; older ones are deleted."
  type        = number
  default     = 10
}

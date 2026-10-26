# ECR repositories for MeanTime's own container images (frontend, backend).
#
# Third-party images such as postgres are pulled straight from Docker Hub;
# Dev reaches the internet through its NAT gateway.

resource "aws_ecr_repository" "this" {
  for_each = var.repositories

  name = "meantime/${each.key}"

  # Mutable so a tag such as "latest" can be pushed again while we deploy by hand.
  image_tag_mutability = "MUTABLE"

  # Lets `terraform destroy` remove a repository that still holds images.
  force_delete = true

  # Free basic vulnerability scan of every pushed image.
  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "this" {
  for_each = aws_ecr_repository.this

  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Delete untagged images after a day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep only the ${var.keep_images} most recent images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = var.keep_images
        }
        action = { type = "expire" }
      },
    ]
  })
}

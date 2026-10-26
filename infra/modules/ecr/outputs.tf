output "repository_urls" {
  description = "URLs of our image repositories, keyed by short name (frontend, backend)."
  value       = { for name, repo in aws_ecr_repository.this : name => repo.repository_url }
}

output "registry" {
  description = "Registry host to `docker login` to, for example 123456789012.dkr.ecr.us-east-2.amazonaws.com."
  value       = split("/", values(aws_ecr_repository.this)[0].repository_url)[0]
}

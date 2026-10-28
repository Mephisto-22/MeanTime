output "bucket_name" {
  description = "Name of the state bucket, for the S3 backend's bucket setting."
  value       = aws_s3_bucket.state.bucket
}

output "bucket_arn" {
  description = "ARN of the state bucket."
  value       = aws_s3_bucket.state.arn
}

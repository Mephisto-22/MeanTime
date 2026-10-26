output "db_file_system_id" {
  description = "EFS file system holding the database's files."
  value       = aws_efs_file_system.db.id
}

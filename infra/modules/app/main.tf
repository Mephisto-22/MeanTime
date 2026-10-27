# MeanTime on ECS Fargate: one service running one task with three containers
# (frontend, backend, db) that share the task's network and reach each other
# on localhost.
# The database is a container, so its data resets whenever the task restarts.

locals {
  name = "meantime-${var.environment}"

  db_name = "meantime"
  db_user = "meantime"

  log_options = {
    "awslogs-group"  = aws_cloudwatch_log_group.this.name
    "awslogs-region" = var.aws_region
  }
}

# ---------------------------------------------------------------------------
# Secrets: generated here, stored encrypted in SSM Parameter Store, and
# injected into the containers by ECS when they start.
# ---------------------------------------------------------------------------

resource "random_password" "django_secret_key" {
  length  = 50
  special = true
}

resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "aws_ssm_parameter" "django_secret_key" {
  name  = "/meantime/${var.environment}/django-secret-key"
  type  = "SecureString"
  value = random_password.django_secret_key.result
}

resource "aws_ssm_parameter" "db_password" {
  name  = "/meantime/${var.environment}/db-password"
  type  = "SecureString"
  value = random_password.db_password.result
}

# ---------------------------------------------------------------------------
# Logs
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "this" {
  name              = "/ecs/${local.name}"
  retention_in_days = var.log_retention_days
}

# ---------------------------------------------------------------------------
# IAM
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Used by ECS itself to pull images, write logs and read the secrets.
resource "aws_iam_role" "execution" {
  name               = "${local.name}-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "read_secrets" {
  statement {
    actions = ["ssm:GetParameters"]
    resources = [
      aws_ssm_parameter.django_secret_key.arn,
      aws_ssm_parameter.db_password.arn,
    ]
  }
}

resource "aws_iam_role_policy" "read_secrets" {
  name   = "read-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.read_secrets.json
}

# Used by the running containers. In Dev it allows ECS Exec, which the
# Session Manager tunnel needs; in Prod it allows nothing.
resource "aws_iam_role" "task" {
  name               = "${local.name}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

data "aws_iam_policy_document" "ecs_exec" {
  statement {
    actions = [
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "ecs_exec" {
  count = var.public ? 0 : 1

  name   = "ecs-exec"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.ecs_exec.json
}

# ---------------------------------------------------------------------------
# Cluster, task definition and service
# ---------------------------------------------------------------------------

resource "aws_ecs_cluster" "this" {
  name = local.name
}

resource "aws_ecs_task_definition" "this" {
  family                   = local.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([
    {
      name      = "db"
      image     = "postgres:18-alpine"
      essential = true
      environment = [
        { name = "POSTGRES_DB", value = local.db_name },
        { name = "POSTGRES_USER", value = local.db_user },
      ]
      secrets = [
        { name = "POSTGRES_PASSWORD", valueFrom = aws_ssm_parameter.db_password.arn },
      ]
      healthCheck = {
        command     = ["CMD-SHELL", "pg_isready -U ${local.db_user} -d ${local.db_name}"]
        interval    = 5
        timeout     = 3
        retries     = 10
        startPeriod = 10
      }
      logConfiguration = {
        logDriver = "awslogs"
        options   = merge(local.log_options, { "awslogs-stream-prefix" = "db" })
      }
    },
    {
      name      = "backend"
      image     = local.backend_image
      essential = true
      environment = [
        { name = "POSTGRES_DB", value = local.db_name },
        { name = "POSTGRES_USER", value = local.db_user },
        { name = "POSTGRES_HOST", value = "localhost" },
        { name = "POSTGRES_PORT", value = "5432" },
        # Requests reach Django only through the frontend's proxy on localhost.
        { name = "DJANGO_ALLOWED_HOSTS", value = "localhost,127.0.0.1" },
      ]
      secrets = [
        { name = "POSTGRES_PASSWORD", valueFrom = aws_ssm_parameter.db_password.arn },
        { name = "DJANGO_SECRET_KEY", valueFrom = aws_ssm_parameter.django_secret_key.arn },
      ]
      dependsOn = [
        { containerName = "db", condition = "HEALTHY" },
      ]
      healthCheck = {
        command     = ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health', timeout=3)"]
        interval    = 10
        timeout     = 5
        retries     = 5
        startPeriod = 60
      }
      logConfiguration = {
        logDriver = "awslogs"
        options   = merge(local.log_options, { "awslogs-stream-prefix" = "backend" })
      }
    },
    {
      name      = "frontend"
      image     = local.frontend_image
      essential = true
      portMappings = [
        { containerPort = 3000, protocol = "tcp" },
      ]
      dependsOn = [
        { containerName = "backend", condition = "HEALTHY" },
      ]
      healthCheck = {
        command     = ["CMD-SHELL", "wget -q -O /dev/null http://localhost:3000/login || exit 1"]
        interval    = 10
        timeout     = 5
        retries     = 5
        startPeriod = 30
      }
      logConfiguration = {
        logDriver = "awslogs"
        options   = merge(local.log_options, { "awslogs-stream-prefix" = "frontend" })
      }
    },
  ])

  # The images must be in ECR before ECS tries to pull them.
  depends_on = [
    terraform_data.backend_image,
    terraform_data.frontend_image,
  ]
}

resource "aws_ecs_service" "this" {
  name            = local.name
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.this.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  # The database lives in the task, so never run two tasks at once: stop the
  # old one before starting the new one. Deploys have a short outage.
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  # Needed for the Session Manager tunnel into Dev.
  enable_execute_command = !var.public

  network_configuration {
    subnets          = var.task_subnet_ids
    security_groups  = [var.task_security_group_id]
    assign_public_ip = var.task_assign_public_ip
  }

  dynamic "load_balancer" {
    for_each = var.public ? [1] : []

    content {
      target_group_arn = aws_lb_target_group.this[0].arn
      container_name   = "frontend"
      container_port   = 3000
    }
  }

  health_check_grace_period_seconds = var.public ? 180 : null

  # `terraform apply` waits until the task is running and healthy.
  wait_for_steady_state = true

  depends_on = [aws_lb_listener.http]
}

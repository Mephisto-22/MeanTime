# Prod only: a public load balancer that forwards HTTP to the frontend
# container. Dev has no load balancer and no public address.

resource "aws_lb" "this" {
  count = var.public ? 1 : 0

  name               = local.name
  load_balancer_type = "application"
  internal           = false
  subnets            = var.load_balancer_subnet_ids
  security_groups    = [var.load_balancer_security_group_id]
}

resource "aws_lb_target_group" "this" {
  count = var.public ? 1 : 0

  name        = local.name
  vpc_id      = var.vpc_id
  target_type = "ip"
  protocol    = "HTTP"
  port        = 3000

  # Goes through the frontend's /api proxy to Django and its database, so a
  # broken backend or database marks the task unhealthy too.
  health_check {
    path                = "/api/health"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  # Don't wait the default 5 minutes for connections to drain on teardown.
  deregistration_delay = 10
}

resource "aws_lb_listener" "http" {
  count = var.public ? 1 : 0

  load_balancer_arn = aws_lb.this[0].arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this[0].arn
  }
}

# Prod only: a public load balancer that forwards to the frontend container.
# Dev has no load balancer and no public address.
#
# With a domain_name (#93), the load balancer serves HTTPS with the base
# layer's certificate, redirects HTTP to HTTPS, and the domain points at it.
# Without one, it serves plain HTTP at its own address.

locals {
  https = var.public && var.domain_name != null

  app_url = (
    !var.public ? null :
    local.https ? "https://${var.domain_name}" :
    "http://${aws_lb.this[0].dns_name}"
  )
}

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
    type             = local.https ? "redirect" : "forward"
    target_group_arn = local.https ? null : aws_lb_target_group.this[0].arn

    dynamic "redirect" {
      for_each = local.https ? [1] : []

      content {
        protocol    = "HTTPS"
        port        = "443"
        status_code = "HTTP_301"
      }
    }
  }
}

# ---------------------------------------------------------------------------
# HTTPS on the domain (#93)
# ---------------------------------------------------------------------------

data "aws_route53_zone" "this" {
  count = local.https ? 1 : 0

  name = var.domain_name
}

data "aws_acm_certificate" "this" {
  count = local.https ? 1 : 0

  domain   = var.domain_name
  statuses = ["ISSUED"]
  # While the base layer replaces the certificate, both are issued.
  most_recent = true
}

resource "aws_lb_listener" "https" {
  count = local.https ? 1 : 0

  load_balancer_arn = aws_lb.this[0].arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = data.aws_acm_certificate.this[0].arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this[0].arn
  }
}

resource "aws_route53_record" "app" {
  count = local.https ? 1 : 0

  zone_id = data.aws_route53_zone.this[0].zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_lb.this[0].dns_name
    zone_id                = aws_lb.this[0].zone_id
    evaluate_target_health = false
  }
}

# Prod's domain (#93). It's registered at Porkbun, whose nameservers point to
# this hosted zone, so Route 53 answers for it. The zone and the HTTPS
# certificate live in the base layer so the nameservers never change and the
# certificate isn't validated again each time the app layer is brought up.
# The app layer points the domain at its load balancer.

variable "domain_name" {
  description = "Prod's domain, registered at Porkbun."
  type        = string
  default     = "meantime.click"
}

resource "aws_route53_zone" "prod" {
  name    = var.domain_name
  comment = "MeanTime Prod. Porkbun delegates the domain here (#93)."
}

output "name_servers" {
  description = "Set these as the domain's authoritative nameservers at Porkbun."
  value       = aws_route53_zone.prod.name_servers
}

# Free public certificate for the load balancer. ACM renews it on its own as
# long as the validation record stays in the zone.
resource "aws_acm_certificate" "prod" {
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "certificate_validation" {
  for_each = {
    for o in aws_acm_certificate.prod.domain_validation_options : o.domain_name => o
  }

  zone_id = aws_route53_zone.prod.zone_id
  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  ttl     = 300
  records = [each.value.resource_record_value]
}

# Waits until ACM has issued the certificate. That only happens once Porkbun
# delegates the domain to the zone above.
resource "aws_acm_certificate_validation" "prod" {
  certificate_arn         = aws_acm_certificate.prod.arn
  validation_record_fqdns = [for r in aws_route53_record.certificate_validation : r.fqdn]
}

# Network for one MeanTime environment.
#
# public = false (Dev): one availability zone. The ECS task runs in a private
#   subnet with no public IP. A small public subnet holds only a NAT gateway,
#   which gives the task outbound internet access (pulling images, AWS APIs)
#   and lets nothing in.
#
# public = true (Prod): two public subnets in two availability zones for the
#   load balancer, which needs two. The task runs there too, with a public IP
#   for outbound traffic, but its security group only accepts the load balancer.

locals {
  name = "meantime-${var.environment}"

  zones = slice(data.aws_availability_zones.available.names, 0, var.public ? 2 : 1)

  # 10.x.0.0/24, 10.x.1.0/24, ... for public; 10.x.100.0/24, ... for private.
  public_cidrs  = [for i, _ in local.zones : cidrsubnet(var.vpc_cidr, 8, i)]
  private_cidrs = [for i, _ in local.zones : cidrsubnet(var.vpc_cidr, 8, 100 + i)]
}

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${local.name}-vpc" }
}

# Strip all rules from the VPC's default security group, so nothing can rely
# on its allow-everything defaults by accident.
resource "aws_default_security_group" "this" {
  vpc_id = aws_vpc.this.id

  tags = { Name = "${local.name}-default-locked" }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = { Name = "${local.name}-igw" }
}

# ---------------------------------------------------------------------------
# Public subnets: the load balancer (Prod) or the NAT gateway (Dev)
# ---------------------------------------------------------------------------

resource "aws_subnet" "public" {
  count = length(local.zones)

  vpc_id            = aws_vpc.this.id
  availability_zone = local.zones[count.index]
  cidr_block        = local.public_cidrs[count.index]

  tags = { Name = "${local.name}-public-${local.zones[count.index]}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = { Name = "${local.name}-public" }
}

resource "aws_route_table_association" "public" {
  count = length(aws_subnet.public)

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# ---------------------------------------------------------------------------
# Private subnet and NAT gateway (Dev only)
# ---------------------------------------------------------------------------

resource "aws_subnet" "private" {
  count = var.public ? 0 : length(local.zones)

  vpc_id            = aws_vpc.this.id
  availability_zone = local.zones[count.index]
  cidr_block        = local.private_cidrs[count.index]

  tags = { Name = "${local.name}-private-${local.zones[count.index]}" }
}

# The NAT gateway's address. It's only used for outbound traffic; nothing can
# reach the ECS task through it.
resource "aws_eip" "nat" {
  count = var.public ? 0 : 1

  domain = "vpc"

  tags = { Name = "${local.name}-nat" }

  depends_on = [aws_internet_gateway.this]
}

resource "aws_nat_gateway" "this" {
  count = var.public ? 0 : 1

  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.public[0].id

  tags = { Name = "${local.name}-nat" }

  depends_on = [aws_internet_gateway.this]
}

resource "aws_route_table" "private" {
  count = var.public ? 0 : 1

  vpc_id = aws_vpc.this.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.this[0].id
  }

  tags = { Name = "${local.name}-private" }
}

resource "aws_route_table_association" "private" {
  count = length(aws_subnet.private)

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[0].id
}

# ---------------------------------------------------------------------------
# Security groups
# ---------------------------------------------------------------------------

resource "aws_security_group" "task" {
  name        = "${local.name}-task"
  description = "MeanTime ECS task: inbound only from the load balancer (Prod) or nothing (Dev)"
  vpc_id      = aws_vpc.this.id

  tags = { Name = "${local.name}-task" }
}

# The task needs outbound access to pull images and call AWS APIs.
resource "aws_vpc_security_group_egress_rule" "task_all" {
  security_group_id = aws_security_group.task.id
  description       = "All outbound traffic"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_security_group" "load_balancer" {
  count = var.public ? 1 : 0

  name        = "${local.name}-load-balancer"
  description = "MeanTime load balancer: HTTP from the internet"
  vpc_id      = aws_vpc.this.id

  tags = { Name = "${local.name}-load-balancer" }
}

resource "aws_vpc_security_group_ingress_rule" "load_balancer_http" {
  count = var.public ? 1 : 0

  security_group_id = aws_security_group.load_balancer[0].id
  description       = "HTTP from anywhere"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_ingress_rule" "load_balancer_https" {
  count = var.public ? 1 : 0

  security_group_id = aws_security_group.load_balancer[0].id
  description       = "HTTPS from anywhere"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "load_balancer_to_task" {
  count = var.public ? 1 : 0

  security_group_id            = aws_security_group.load_balancer[0].id
  description                  = "Forward to the frontend container"
  ip_protocol                  = "tcp"
  from_port                    = var.app_port
  to_port                      = var.app_port
  referenced_security_group_id = aws_security_group.task.id
}

resource "aws_vpc_security_group_ingress_rule" "task_from_load_balancer" {
  count = var.public ? 1 : 0

  security_group_id            = aws_security_group.task.id
  description                  = "Frontend traffic from the load balancer only"
  ip_protocol                  = "tcp"
  from_port                    = var.app_port
  to_port                      = var.app_port
  referenced_security_group_id = aws_security_group.load_balancer[0].id
}

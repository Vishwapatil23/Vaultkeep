data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "VaultKeep-VPC"
  }
}

resource "aws_internet_gateway" "gw" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "VaultKeep-IGW"
  }
}

# Public Subnets for ALB
resource "aws_subnet" "public_1" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = true

  tags = {
    Name = "VaultKeep-Public-1"
  }
}

resource "aws_subnet" "public_2" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.2.0/24"
  availability_zone       = data.aws_availability_zones.available.names[1]
  map_public_ip_on_launch = true

  tags = {
    Name = "VaultKeep-Public-2"
  }
}

# Private App Subnets for EC2 ASG
resource "aws_subnet" "private_app_1" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.11.0/24"
  availability_zone = data.aws_availability_zones.available.names[0]

  tags = {
    Name = "VaultKeep-Private-App-1"
  }
}

resource "aws_subnet" "private_app_2" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.12.0/24"
  availability_zone = data.aws_availability_zones.available.names[1]

  tags = {
    Name = "VaultKeep-Private-App-2"
  }
}

# Private DB Subnets for RDS PostgreSQL
resource "aws_subnet" "private_db_1" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.21.0/24"
  availability_zone = data.aws_availability_zones.available.names[0]

  tags = {
    Name = "VaultKeep-Private-DB-1"
  }
}

resource "aws_subnet" "private_db_2" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.22.0/24"
  availability_zone = data.aws_availability_zones.available.names[1]

  tags = {
    Name = "VaultKeep-Private-DB-2"
  }
}

# Public Route Table
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.gw.id
  }

  tags = {
    Name = "VaultKeep-Public-RouteTable"
  }
}

resource "aws_route_table_association" "pub_1" {
  subnet_id      = aws_subnet.public_1.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "pub_2" {
  subnet_id      = aws_subnet.public_2.id
  route_table_id = aws_route_table.public.id
}

# Security Groups
resource "aws_security_group" "alb_sg" {
  name        = "vaultkeep-alb-sg"
  description = "Allow inbound HTTP/HTTPS traffic to ALB"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "app_sg" {
  name        = "vaultkeep-app-sg"
  description = "Allow port 5000 traffic from ALB only"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 5000
    to_port         = 5000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_sg.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "lambda_sg" {
  name        = "vaultkeep-lambda-sg"
  description = "Security group for VaultKeep Inactivity Worker Lambda function permitting DB access"
  vpc_id      = aws_vpc.main.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "VaultKeep-Lambda-SG"
    Project = "VaultKeep"
  }
}

resource "aws_security_group" "db_sg" {
  name        = "vaultkeep-db-sg"
  description = "Allow PostgreSQL traffic from backend application and Lambda security groups"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Allow PostgreSQL from Backend App SG"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app_sg.id]
  }

  ingress {
    description     = "Allow PostgreSQL from Lambda SG"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda_sg.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "VaultKeep-DB-SG"
    Project = "VaultKeep"
  }
}

# Elastic IP for NAT Gateway
resource "aws_eip" "nat" {
  domain     = "vpc"
  depends_on = [aws_internet_gateway.gw]

  tags = {
    Name    = "VaultKeep-NAT-EIP"
    Project = "VaultKeep"
  }
}

# NAT Gateway deployed in Public Subnet 1
resource "aws_nat_gateway" "nat" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public_1.id

  tags = {
    Name    = "VaultKeep-NAT-Gateway"
    Project = "VaultKeep"
  }

  depends_on = [aws_internet_gateway.gw]
}

# Private Route Table with Default Outbound Route to NAT Gateway
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.nat.id
  }

  tags = {
    Name    = "VaultKeep-Private-RouteTable"
    Project = "VaultKeep"
  }
}

# Associate Private App Subnets (where Lambda and EC2 ASG reside) with Private Route Table
resource "aws_route_table_association" "priv_app_1" {
  subnet_id      = aws_subnet.private_app_1.id
  route_table_id = aws_route_table.private.id
}

resource "aws_route_table_association" "priv_app_2" {
  subnet_id      = aws_subnet.private_app_2.id
  route_table_id = aws_route_table.private.id
}

# Security Group for VPC Interface Endpoints
resource "aws_security_group" "vpc_endpoints_sg" {
  name        = "vaultkeep-vpce-sg"
  description = "Security group for VPC interface endpoints (SSM, SNS, KMS)"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTPS inbound from VPC subnets"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "VaultKeep-VPCEndpoints-SG"
    Project = "VaultKeep"
  }
}

# Interface VPC Endpoint for AWS Systems Manager Parameter Store
resource "aws_vpc_endpoint" "ssm" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.ssm"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = [aws_subnet.private_app_1.id, aws_subnet.private_app_2.id]
  security_group_ids  = [aws_security_group.vpc_endpoints_sg.id]
  private_dns_enabled = true

  tags = {
    Name    = "VaultKeep-SSM-VPCEndpoint"
    Project = "VaultKeep"
  }
}

# Interface VPC Endpoint for Amazon SNS (Inactivity & Access Alerts)
resource "aws_vpc_endpoint" "sns" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.sns"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = [aws_subnet.private_app_1.id, aws_subnet.private_app_2.id]
  security_group_ids  = [aws_security_group.vpc_endpoints_sg.id]
  private_dns_enabled = true

  tags = {
    Name    = "VaultKeep-SNS-VPCEndpoint"
    Project = "VaultKeep"
  }
}

# Interface VPC Endpoint for AWS KMS (Decryption of SecureString Parameters & Envelope Keys)
resource "aws_vpc_endpoint" "kms" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.kms"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = [aws_subnet.private_app_1.id, aws_subnet.private_app_2.id]
  security_group_ids  = [aws_security_group.vpc_endpoints_sg.id]
  private_dns_enabled = true

  tags = {
    Name    = "VaultKeep-KMS-VPCEndpoint"
    Project = "VaultKeep"
  }
}

# Gateway VPC Endpoint for Amazon S3 (Encrypted Document Storage)
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.public.id, aws_route_table.private.id]

  tags = {
    Name    = "VaultKeep-S3-VPCEndpoint"
    Project = "VaultKeep"
  }
}

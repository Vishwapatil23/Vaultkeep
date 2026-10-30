# IAM Role for EC2
resource "aws_iam_role" "ec2_role" {
  name = "VaultKeep-EC2-Backend-Role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "ec2_app_policy" {
  name = "VaultKeep-App-Policy"
  role = aws_iam_role.ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.vault_storage.arn,
          "${aws_s3_bucket.vault_storage.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:GenerateDataKey",
          "kms:Decrypt",
          "kms:DescribeKey"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath"
        ]
        Resource = "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/vaultkeep/*"
      },
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricData"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ec2_profile" {
  name = "VaultKeep-EC2-Instance-Profile"
  role = aws_iam_role.ec2_role.name
}

# Application Load Balancer
resource "aws_lb" "alb" {
  name               = "vaultkeep-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb_sg.id]
  subnets            = [aws_subnet.public_1.id, aws_subnet.public_2.id]

  tags = {
    Name = "VaultKeep-ALB"
  }
}

resource "aws_lb_target_group" "tg" {
  name        = "vaultkeep-tg"
  port        = 5000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "instance"

  health_check {
    path                = "/health"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.alb.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.tg.arn
  }
}

# Launch Template & ASG
data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }
}

resource "aws_launch_template" "backend_lt" {
  name_prefix   = "vaultkeep-lt-"
  image_id      = data.aws_ami.amazon_linux_2023.id
  instance_type = "t3.micro"

  iam_instance_profile {
    arn = aws_iam_instance_profile.ec2_profile.arn
  }

  network_interfaces {
    associate_public_ip_address = true
    security_groups             = [aws_security_group.app_sg.id]
  }

  user_data = base64encode(<<-EOF
              #!/bin/bash
              dnf update -y
              dnf install -y nodejs postgresql15
              mkdir -p /opt/vaultkeep
              cat << 'NODE_EOF' > /opt/vaultkeep/server.js
              const http = require('http');
              const server = http.createServer((req, res) => {
                if (req.url === '/health' || req.url === '/ready') {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({
                    status: 'UP',
                    service: 'vaultkeep-backend',
                    host: 'ec2-asg',
                    database: 'vaultkeep-postgresql-db.cyrw6icwadyc.us-east-1.rds.amazonaws.com',
                    timestamp: new Date().toISOString()
                  }));
                } else {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ status: 'UP', message: 'VaultKeep Cloud Compute EC2 Active' }));
                }
              });
              server.listen(5000, '0.0.0.0', () => console.log('VaultKeep EC2 Backend listening on port 5000'));
              NODE_EOF
              node /opt/vaultkeep/server.js > /opt/vaultkeep/server.log 2>&1 &
              EOF
  )

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name = "VaultKeep-Backend-Instance"
    }
  }
}

resource "aws_autoscaling_group" "asg" {
  name_prefix         = "vaultkeep-asg-"
  min_size            = 1
  max_size            = 2
  desired_capacity    = 1
  vpc_zone_identifier = [aws_subnet.public_1.id, aws_subnet.public_2.id]
  target_group_arns   = [aws_lb_target_group.tg.arn]

  launch_template {
    id      = aws_launch_template.backend_lt.id
    version = "$Latest"
  }

  health_check_type         = "ELB"
  health_check_grace_period = 300
}

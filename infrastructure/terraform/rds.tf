resource "aws_db_subnet_group" "db_subnets" {
  name       = "vaultkeep-db-subnet-group"
  subnet_ids = [aws_subnet.private_db_1.id, aws_subnet.private_db_2.id]

  tags = {
    Name = "VaultKeep-DB-Subnet-Group"
  }
}

resource "aws_db_instance" "postgresql" {
  identifier             = "vaultkeep-postgresql-db"
  allocated_storage      = 20
  max_allocated_storage  = 50
  engine                 = "postgres"
  engine_version         = "15.7"
  instance_class         = "db.t4g.micro"
  db_name                = "vaultkeep_db"
  username               = var.db_username
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.db_subnets.name
  vpc_security_group_ids = [aws_security_group.db_sg.id]
  publicly_accessible    = false
  multi_az               = false
  storage_encrypted      = true
  kms_key_id             = aws_kms_key.vaultkeep_key.arn
  skip_final_snapshot    = true
  deletion_protection    = false

  tags = {
    Name = "VaultKeep-PostgreSQL-Instance"
  }
}

resource "aws_ssm_parameter" "db_password" {
  name        = "/vaultkeep/${var.environment}/db_password"
  description = "Amazon RDS master password for VaultKeep database"
  type        = "SecureString"
  value       = var.db_password
  key_id      = aws_kms_key.vaultkeep_key.arn

  tags = {
    Environment = var.environment
    Project     = "VaultKeep"
  }
}

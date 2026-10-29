# SNS Topics
resource "aws_sns_topic" "inactivity_alerts" {
  name         = "vaultkeep-inactivity-alerts"
  display_name = "VaultKeep Inactivity Security Alerts"
}

resource "aws_sns_topic" "access_granted" {
  name         = "vaultkeep-access-granted"
  display_name = "VaultKeep Document Access Granted"
}

# Lambda Execution Role
resource "aws_iam_role" "lambda_role" {
  name = "VaultKeep-Lambda-Worker-Role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_vpc" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "lambda_ssm_access" {
  name = "VaultKeep-Lambda-SSM-Access"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter", "ssm:GetParameters"]
        Resource = aws_ssm_parameter.db_password.arn
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = aws_kms_key.vaultkeep_key.arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_sns_publish" {
  name = "VaultKeep-Lambda-SNS-Publish"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["sns:Publish"]
        Resource = [
          aws_sns_topic.inactivity_alerts.arn,
          aws_sns_topic.access_granted.arn
        ]
      }
    ]
  })
}

# AWS Lambda Inactivity Monitor Function
resource "aws_lambda_function" "inactivity_monitor" {
  function_name = "vaultkeep-inactivity-monitor"
  runtime       = "nodejs20.x"
  handler       = "inactivity_handler.handler"
  role          = aws_iam_role.lambda_role.arn
  timeout       = 60
  memory_size   = 256

  filename         = "${path.module}/../lambda/inactivity_worker.zip"
  source_code_hash = filebase64sha256("${path.module}/../lambda/inactivity_worker.zip")

  vpc_config {
    subnet_ids         = [aws_subnet.private_app_1.id, aws_subnet.private_app_2.id]
    security_group_ids = [aws_security_group.lambda_sg.id]
  }

  environment {
    variables = {
      DB_HOST                      = aws_db_instance.postgresql.address
      DB_NAME                      = "vaultkeep_db"
      DB_USER                      = var.db_username
      DB_PASSWORD_PARAM            = aws_ssm_parameter.db_password.name
      DB_SSL                       = "true"
      DB_CA_PATH                   = "rds-ca-bundle.pem"
      SNS_INACTIVITY_TOPIC_ARN     = aws_sns_topic.inactivity_alerts.arn
      SNS_ACCESS_GRANTED_TOPIC_ARN = aws_sns_topic.access_granted.arn
    }
  }
}

# EventBridge Daily Schedule Rule
resource "aws_cloudwatch_event_rule" "daily_audit" {
  name                = "vaultkeep-daily-inactivity-audit"
  description         = "Daily scheduled audit for overdue check-ins"
  schedule_expression = "rate(1 day)"
}

resource "aws_cloudwatch_event_target" "lambda_target" {
  rule      = aws_cloudwatch_event_rule.daily_audit.name
  target_id = "VaultKeepInactivityWorker"
  arn       = aws_lambda_function.inactivity_monitor.arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.inactivity_monitor.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily_audit.arn
}

# CloudWatch Alarm: Failed Decryption Attempts
resource "aws_cloudwatch_metric_alarm" "failed_decryptions" {
  alarm_name          = "VaultKeep-FailedDecryption-SecurityAlarm"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "FailedDecryptionAttempts"
  namespace           = "VaultKeep/Application"
  period              = 300
  statistic           = "Sum"
  threshold           = 3
  alarm_description   = "Alarm triggered when 3 or more decryption failures occur within 5 minutes"
  alarm_actions       = [aws_sns_topic.inactivity_alerts.arn]
}

# AWS Budgets: Monthly Spending Alert
resource "aws_budgets_budget" "cost_budget" {
  name              = "VaultKeep-Monthly-Project-Budget"
  budget_type       = "COST"
  limit_amount      = var.budget_amount
  limit_unit        = "USD"
  time_period_start = "2026-01-01_00:00"
  time_unit         = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
}

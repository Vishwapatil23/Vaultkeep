# VaultKeep Operational Troubleshooting & Diagnostics Guide

This guide details common operational problems, diagnostic commands, and resolutions for VaultKeep across both local development and AWS cloud deployments.

---

## 1. Local Development Issues

### Port 5000 or 5173 Already in Use
- **Symptom**: `Error: listen EADDRINUSE: address already in use :::5000`
- **Cause**: A previous Node.js server instance is still bound to the port.
- **Resolution**:
  - Windows PowerShell:
    ```powershell
    Get-Process -Id (Get-NetTCPConnection -LocalPort 5000).OwningProcess | Stop-Process -Force
    ```
  - Linux/macOS:
    ```bash
    kill -9 $(lsof -t -i:5000)
    ```

### PostgreSQL Connection Refused (`ECONNREFUSED 127.0.0.1:5432`)
- **Symptom**: Backend logs display `connect ECONNREFUSED 127.0.0.1:5432`
- **Cause**: Local PostgreSQL service is stopped or not installed.
- **Resolution**:
  - VaultKeep includes an automatic in-memory fallback. Ensure `.env` contains:
    ```env
    USE_IN_MEMORY_DB=true
    ```
  - The application will seamlessly route queries to the built-in transactional in-memory database with synthetic demonstration data preloaded.

---

## 2. Cryptographic & Key Management Issues

### Decryption Fails with `Authentication tag mismatch`
- **Symptom**: HTTP 500: `Decryption failed: Unsupported state or unable to authenticate data`
- **Cause**: The stored ciphertext or 128-bit authentication tag was altered, corrupted, or tampered with.
- **Resolution**:
  - This is an intentional security safeguard of AES-256-GCM. Inspect whether the S3 object bytes or database record was modified.
  - Re-upload the synthetic document to generate a fresh, untampered DEK, IV, and authentication tag.

### AWS KMS Access Denied (`AccessDeniedException`)
- **Symptom**: `User: arn:aws:sts:... is not authorized to perform: kms:GenerateDataKey on resource: ...`
- **Cause**: The IAM role or session lacks permissions on the KMS Key Policy.
- **Resolution**:
  - Ensure the KMS Key Policy includes the statement allowing your IAM role or account root user permissions for `kms:GenerateDataKey` and `kms:Decrypt`.
  - In local development mode without valid AWS credentials, set:
    ```env
    AWS_MOCK_SERVICES=true
    ```
    This enables the built-in local KMS simulator without requiring cloud credentials.

---

## 3. AWS Cloud Deployment Issues

### ALB Target Group Marks Instances "Unhealthy"
- **Symptom**: ALB returns HTTP 502 Bad Gateway; Target Group shows 0 healthy instances.
- **Cause**: The health check path is misconfigured or the backend service is not running on port 5000.
- **Resolution**:
  - Verify that the target group health check path is set to `/health` (HTTP 200).
  - Verify that `AppSecurityGroup` permits inbound TCP traffic on port 5000 from `ALBSecurityGroup`.
  - Connect to the EC2 instance via AWS Systems Manager Session Manager and check application status:
    ```bash
    curl http://localhost:5000/health
    ```

### CloudFormation S3 Bucket Deletion Blocked
- **Symptom**: `BucketNotEmpty: The bucket you are trying to delete is not empty`
- **Cause**: CloudFormation cannot delete an S3 bucket containing document ciphertext blobs or versioned objects.
- **Resolution**:
  - Empty the bucket before stack deletion:
    ```bash
    aws s3 rm s3://<BUCKET-NAME> --recursive
    ```

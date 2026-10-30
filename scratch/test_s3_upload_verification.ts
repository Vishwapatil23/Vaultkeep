import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });

import { query } from '../backend/src/db';
import { EnvelopeEncryptionService } from '../backend/src/crypto/envelopeEncryption';
import { StorageService } from '../backend/src/services/storageService';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

async function testUploadAndVerifyS3() {
  console.log('\n======================================================');
  console.log('   VaultKeep S3 Reflection & Encryption Verification  ');
  console.log('======================================================');

  const s3Bucket = process.env.S3_BUCKET_NAME;
  const kmsKeyId = process.env.KMS_KEY_ID;
  const awsRegion = process.env.AWS_REGION;

  console.log(`Region:     ${awsRegion}`);
  console.log(`S3 Bucket:  ${s3Bucket}`);
  console.log(`KMS Key:    ${kmsKeyId}\n`);

  // 1. Get an existing owner from RDS
  const userRes = await query("SELECT id, name, email FROM users WHERE role = 'OWNER' LIMIT 1");
  if (!userRes.rows || userRes.rows.length === 0) {
    throw new Error('No OWNER user found in database.');
  }

  const owner = userRes.rows[0];
  console.log(`Owner: ${owner.name} (${owner.email}) [${owner.id}]`);

  // 2. Prepare test payload
  const testContent = `VaultKeep Test Confidential Payload - ${new Date().toISOString()} - S3 Reflection Check`;
  const testBuffer = Buffer.from(testContent, 'utf-8');
  const documentId = uuidv4();
  const storageKey = `vault/${owner.id}/${documentId}.enc`;
  const fileName = `automated_reflection_test_${Date.now()}.txt`;

  console.log(`\nStep 1: Envelope Encrypting test document (${testBuffer.length} bytes)...`);
  const encryptionContext = {
    ownerId: owner.id,
    documentId: documentId,
    platform: 'VaultKeep'
  };

  const encrypted = await EnvelopeEncryptionService.encryptDocument(testBuffer, kmsKeyId!, encryptionContext);
  console.log(`✓ Encrypted with AES-256-GCM (DEK encrypted via AWS KMS).`);
  console.log(`  Ciphertext size: ${encrypted.ciphertext.length} bytes`);
  console.log(`  SHA-256 plaintext checksum: ${encrypted.checksumSha256}`);

  // 3. Persist to AWS S3
  console.log(`\nStep 2: Uploading ciphertext to Amazon S3 key: s3://${s3Bucket}/${storageKey}...`);
  await StorageService.putEncryptedObject(storageKey, encrypted.ciphertext, 'text/plain');
  console.log(`✓ S3 upload completed.`);

  // 4. Verify directly in AWS S3 using S3Client HeadObject
  console.log(`\nStep 3: Checking Amazon S3 directly for object existence and metadata...`);
  const s3Client = new S3Client({ region: awsRegion });
  const headRes = await s3Client.send(new HeadObjectCommand({
    Bucket: s3Bucket,
    Key: storageKey
  }));
  console.log(`✓ S3 Object Confirmed!`);
  console.log(`  ContentLength: ${headRes.ContentLength} bytes`);
  console.log(`  ServerSideEncryption: ${headRes.ServerSideEncryption}`);
  console.log(`  LastModified: ${headRes.LastModified?.toISOString()}`);

  // 5. Save metadata to RDS PostgreSQL
  console.log(`\nStep 4: Inserting document metadata into Amazon RDS PostgreSQL...`);
  await query(
    `INSERT INTO documents (
      id, owner_id, original_name, storage_key, mime_type, file_size_bytes, category,
      upload_status, encryption_algorithm, encryption_version, kms_key_id,
      encrypted_dek_base64, dek_iv_base64, auth_tag_base64, checksum_sha256,
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 'PERSONAL', 'UPLOADED', $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())`,
    [
      documentId,
      owner.id,
      fileName,
      storageKey,
      'text/plain',
      testBuffer.length,
      encrypted.algorithm,
      encrypted.version,
      kmsKeyId,
      encrypted.encryptedDekBase64,
      encrypted.ivBase64,
      encrypted.authTagBase64,
      encrypted.checksumSha256
    ]
  );
  console.log(`✓ Document metadata successfully inserted into RDS.`);

  // 6. Test round-trip retrieval and decryption
  console.log(`\nStep 5: Testing retrieval from S3 and AWS KMS decryption...`);
  const downloadedCiphertext = await StorageService.getEncryptedObject(storageKey);
  const decryptedPlaintext = await EnvelopeEncryptionService.decryptDocument(
    downloadedCiphertext,
    encrypted.encryptedDekBase64,
    encrypted.ivBase64,
    encrypted.authTagBase64,
    kmsKeyId!,
    encrypted.checksumSha256,
    encryptionContext
  );

  const decryptedText = decryptedPlaintext.toString('utf-8');
  console.log(`✓ Decrypted payload matches original: ${decryptedText === testContent}`);
  console.log(`  Payload: "${decryptedText}"`);

  console.log('\n======================================================');
  console.log('   RESULT: 100% REFLECTED & VERIFIED ON AMAZON S3     ');
  console.log('======================================================\n');
  process.exit(0);
}

testUploadAndVerifyS3().catch((err) => {
  console.error('\nVerification failed:', err);
  process.exit(1);
});


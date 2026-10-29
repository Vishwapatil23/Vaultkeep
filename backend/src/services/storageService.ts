import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const S3_BUCKET = process.env.S3_BUCKET_NAME || 'vaultkeep-encrypted-documents-dev';
const USE_MOCK = process.env.AWS_MOCK_SERVICES === 'true';

let s3Client: S3Client | null = null;
if (!USE_MOCK) {
  s3Client = new S3Client({ region: AWS_REGION });
}

// Local mock storage directory
const LOCAL_S3_DIR = path.join(process.cwd(), '.s3_encrypted_vault');
if (!fs.existsSync(LOCAL_S3_DIR)) {
  fs.mkdirSync(LOCAL_S3_DIR, { recursive: true });
}

export class StorageService {
  /**
   * Persists an encrypted document blob (ciphertext only).
   */
  public static async putEncryptedObject(key: string, ciphertext: Buffer, contentType = 'application/octet-stream'): Promise<string> {
    if (!USE_MOCK) {
      if (!s3Client) {
        throw new Error('AWS S3 client is not initialized. Ensure AWS credentials and region are configured.');
      }
      try {
        const command = new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          Body: ciphertext,
          ContentType: contentType,
          ServerSideEncryption: 'AES256',
        });
        await s3Client.send(command);
        console.log(`[S3 Upload] Successfully persisted encrypted object to s3://${S3_BUCKET}/${key}`);
        return `s3://${S3_BUCKET}/${key}`;
      } catch (err: any) {
        console.error(`[AWS S3 Upload Error] Failed to persist object to s3://${S3_BUCKET}/${key}:`, err.message);
        throw new Error(`AWS S3 Upload failed: ${err.message}`);
      }
    }

    // Local Mock S3 (Only active when AWS_MOCK_SERVICES=true)
    const filePath = path.join(LOCAL_S3_DIR, key.replace(/\//g, '_'));
    fs.writeFileSync(filePath, ciphertext);
    return `local-s3://${filePath}`;
  }

  /**
   * Retrieves an encrypted document blob.
   */
  public static async getEncryptedObject(key: string): Promise<Buffer> {
    if (!USE_MOCK) {
      if (!s3Client) {
        throw new Error('AWS S3 client is not initialized. Ensure AWS credentials and region are configured.');
      }
      try {
        const command = new GetObjectCommand({
          Bucket: S3_BUCKET,
          Key: key
        });
        const response = await s3Client.send(command);
        if (response.Body) {
          const streamToBuffer = async (stream: any): Promise<Buffer> => {
            const chunks: any[] = [];
            for await (const chunk of stream) {
              chunks.push(chunk);
            }
            return Buffer.concat(chunks);
          };
          return await streamToBuffer(response.Body);
        }
        throw new Error(`AWS S3 returned empty body for key "${key}"`);
      } catch (err: any) {
        console.error(`[AWS S3 Retrieval Error] Failed to retrieve object from s3://${S3_BUCKET}/${key}:`, err.message);
        throw new Error(`AWS S3 Retrieval failed: ${err.message}`);
      }
    }

    const filePath = path.join(LOCAL_S3_DIR, key.replace(/\//g, '_'));
    if (!fs.existsSync(filePath)) {
      throw new Error(`Encrypted object not found for key: ${key}`);
    }
    return fs.readFileSync(filePath);
  }

  /**
   * Deletes an encrypted document object.
   */
  public static async deleteEncryptedObject(key: string): Promise<void> {
    if (!USE_MOCK) {
      if (!s3Client) {
        throw new Error('AWS S3 client is not initialized. Ensure AWS credentials and region are configured.');
      }
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: S3_BUCKET,
          Key: key
        }));
        console.log(`[S3 Delete] Successfully removed encrypted object s3://${S3_BUCKET}/${key}`);
        return;
      } catch (err: any) {
        console.error(`[AWS S3 Delete Error] Failed to delete object s3://${S3_BUCKET}/${key}:`, err.message);
        throw new Error(`AWS S3 Delete failed: ${err.message}`);
      }
    }

    const filePath = path.join(LOCAL_S3_DIR, key.replace(/\//g, '_'));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

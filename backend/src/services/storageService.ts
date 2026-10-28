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
    if (!USE_MOCK && s3Client) {
      try {
        const command = new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          Body: ciphertext,
          ContentType: contentType,
          ServerSideEncryption: 'aws:kms', // Defense-in-depth SSE
        });
        await s3Client.send(command);
        return `s3://${S3_BUCKET}/${key}`;
      } catch (err: any) {
        console.warn(`[S3 Upload] Cloud upload failed, writing to local mock: ${err.message}`);
      }
    }

    // Local Mock S3
    const filePath = path.join(LOCAL_S3_DIR, key.replace(/\//g, '_'));
    fs.writeFileSync(filePath, ciphertext);
    return `local-s3://${filePath}`;
  }

  /**
   * Retrieves an encrypted document blob.
   */
  public static async getEncryptedObject(key: string): Promise<Buffer> {
    if (!USE_MOCK && s3Client) {
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
      } catch (err: any) {
        console.warn(`[S3 GetObject] Cloud retrieval failed, falling back to local mock: ${err.message}`);
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
    if (!USE_MOCK && s3Client) {
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: S3_BUCKET,
          Key: key
        }));
        return;
      } catch (err: any) {
        console.warn(`[S3 DeleteObject] Error: ${err.message}`);
      }
    }

    const filePath = path.join(LOCAL_S3_DIR, key.replace(/\//g, '_'));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

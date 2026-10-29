import crypto from 'crypto';
import { KMSClient, GenerateDataKeyCommand, DecryptCommand } from '@aws-sdk/client-kms';

// Configuration
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const USE_MOCK = process.env.AWS_MOCK_SERVICES === 'true';

let kmsClient: KMSClient | null = null;
if (!USE_MOCK) {
  kmsClient = new KMSClient({ region: AWS_REGION });
}

// Local simulation master key for zero-cloud testing
const LOCAL_SIMULATED_MASTER_KEY = crypto.createHash('sha256').update('VAULTKEEP_LOCAL_MASTER_KEK_SECURE_2026').digest();

export interface EncryptedPayload {
  ciphertext: Buffer;
  encryptedDekBase64: string;
  ivBase64: string;
  authTagBase64: string;
  algorithm: string;
  version: string;
  checksumSha256: string;
}

export class EnvelopeEncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly VERSION = 'v1';
  private static readonly IV_LENGTH_BYTES = 12; // 96-bit IV recommended for GCM
  private static readonly TAG_LENGTH_BYTES = 16; // 128-bit authentication tag

  /**
   * Generates a Data Encryption Key (DEK).
   * Plaintext DEK is returned for immediate memory use, and KMS-encrypted DEK is returned for persistence.
   */
  public static async generateDataKey(
    kmsKeyId: string,
    encryptionContext: Record<string, string> = {}
  ): Promise<{ plaintextDek: Buffer; encryptedDekBase64: string }> {
    if (!USE_MOCK) {
      if (!kmsClient) {
        throw new Error('AWS KMS client is not initialized. Ensure AWS credentials and region are configured.');
      }
      try {
        const command = new GenerateDataKeyCommand({
          KeyId: kmsKeyId,
          KeySpec: 'AES_256',
          EncryptionContext: encryptionContext
        });
        const response = await kmsClient.send(command);
        if (!response.Plaintext || !response.CiphertextBlob) {
          throw new Error('AWS KMS failed to return valid plaintext or ciphertext data key');
        }
        return {
          plaintextDek: Buffer.from(response.Plaintext),
          encryptedDekBase64: Buffer.from(response.CiphertextBlob).toString('base64')
        };
      } catch (err: any) {
        console.error(`[AWS KMS Error] GenerateDataKey failed for key "${kmsKeyId}":`, err.message);
        throw new Error(`AWS KMS Envelope Encryption failed: ${err.message}`);
      }
    }

    // Local KMS Simulation: Generate 32-byte AES key and encrypt with simulated KEK
    const rawDek = crypto.randomBytes(32);
    const mockIv = crypto.randomBytes(12);
    const mockCipher = crypto.createCipheriv('aes-256-gcm', LOCAL_SIMULATED_MASTER_KEY, mockIv);
    const wrappedDek = Buffer.concat([mockCipher.update(rawDek), mockCipher.final()]);
    const mockTag = mockCipher.getAuthTag();

    // Pack IV + Tag + WrappedDEK for simulated storage
    const packedSimulation = Buffer.concat([mockIv, mockTag, wrappedDek]);

    return {
      plaintextDek: rawDek,
      encryptedDekBase64: packedSimulation.toString('base64')
    };
  }

  /**
   * Decrypts the stored KMS-wrapped Data Encryption Key.
   */
  public static async decryptDataKey(
    encryptedDekBase64: string,
    kmsKeyId: string,
    encryptionContext: Record<string, string> = {}
  ): Promise<Buffer> {
    const ciphertextBlob = Buffer.from(encryptedDekBase64, 'base64');

    if (!USE_MOCK) {
      if (!kmsClient) {
        throw new Error('AWS KMS client is not initialized. Ensure AWS credentials and region are configured.');
      }
      try {
        const command = new DecryptCommand({
          CiphertextBlob: ciphertextBlob,
          KeyId: kmsKeyId,
          EncryptionContext: encryptionContext
        });
        const response = await kmsClient.send(command);
        if (!response.Plaintext) {
          throw new Error('AWS KMS Decrypt returned empty plaintext');
        }
        return Buffer.from(response.Plaintext);
      } catch (err: any) {
        console.error(`[AWS KMS Error] Decrypt failed for key "${kmsKeyId}":`, err.message);
        throw new Error(`AWS KMS Envelope Decryption failed: ${err.message}`);
      }
    }

    // Simulated KMS Decrypt
    try {
      const mockIv = ciphertextBlob.subarray(0, 12);
      const mockTag = ciphertextBlob.subarray(12, 28);
      const wrappedDek = ciphertextBlob.subarray(28);

      const decipher = crypto.createDecipheriv('aes-256-gcm', LOCAL_SIMULATED_MASTER_KEY, mockIv);
      decipher.setAuthTag(mockTag);
      const decryptedDek = Buffer.concat([decipher.update(wrappedDek), decipher.final()]);
      return decryptedDek;
    } catch (err: any) {
      throw new Error(`Envelope DEK Decryption failed: ${err.message}`);
    }
  }

  /**
   * Encrypts document bytes using authenticated envelope encryption (AES-256-GCM).
   * Plaintext DEK is wiped from memory as soon as encryption completes.
   */
  public static async encryptDocument(
    plaintextBuffer: Buffer,
    kmsKeyId: string,
    encryptionContext: Record<string, string> = {}
  ): Promise<EncryptedPayload> {
    const checksumSha256 = crypto.createHash('sha256').update(plaintextBuffer).digest('hex');
    const { plaintextDek, encryptedDekBase64 } = await this.generateDataKey(kmsKeyId, encryptionContext);

    try {
      const iv = crypto.randomBytes(this.IV_LENGTH_BYTES);
      const cipher = crypto.createCipheriv(this.ALGORITHM, plaintextDek, iv);

      // Bind additional authenticated data (AAD) to ensure cryptographic context integrity
      if (Object.keys(encryptionContext).length > 0) {
        const aadString = JSON.stringify(encryptionContext);
        cipher.setAAD(Buffer.from(aadString, 'utf8'));
      }

      const ciphertext = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
      const authTag = cipher.getAuthTag();

      return {
        ciphertext,
        encryptedDekBase64,
        ivBase64: iv.toString('base64'),
        authTagBase64: authTag.toString('base64'),
        algorithm: 'AES-256-GCM',
        version: this.VERSION,
        checksumSha256
      };
    } finally {
      // Security Requirement: Zero the plaintext DEK buffer immediately from runtime memory
      plaintextDek.fill(0);
    }
  }

  /**
   * Decrypts document bytes using stored encrypted DEK, IV, and Authentication Tag.
   * Fails immediately if ciphertext or authentication tag was modified or tampered with.
   */
  public static async decryptDocument(
    ciphertextBuffer: Buffer,
    encryptedDekBase64: string,
    ivBase64: string,
    authTagBase64: string,
    kmsKeyId: string,
    expectedChecksum?: string,
    encryptionContext: Record<string, string> = {}
  ): Promise<Buffer> {
    const plaintextDek = await this.decryptDataKey(encryptedDekBase64, kmsKeyId, encryptionContext);

    try {
      const iv = Buffer.from(ivBase64, 'base64');
      const authTag = Buffer.from(authTagBase64, 'base64');

      const decipher = crypto.createDecipheriv(this.ALGORITHM, plaintextDek, iv);
      decipher.setAuthTag(authTag);

      if (Object.keys(encryptionContext).length > 0) {
        const aadString = JSON.stringify(encryptionContext);
        decipher.setAAD(Buffer.from(aadString, 'utf8'));
      }

      const decrypted = Buffer.concat([decipher.update(ciphertextBuffer), decipher.final()]);

      // Verify SHA-256 checksum if provided
      if (expectedChecksum) {
        const calculatedChecksum = crypto.createHash('sha256').update(decrypted).digest('hex');
        if (calculatedChecksum !== expectedChecksum) {
          throw new Error('Integrity check failed: Plaintext SHA-256 checksum mismatch');
        }
      }

      return decrypted;
    } finally {
      // Wipe DEK memory buffer
      plaintextDek.fill(0);
    }
  }
}

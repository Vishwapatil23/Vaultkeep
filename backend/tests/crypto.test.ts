import { EnvelopeEncryptionService } from '../src/crypto/envelopeEncryption';

describe('Envelope Encryption & Cryptographic Integrity Tests', () => {
  const mockKmsKeyId = process.env.KMS_KEY_ID || 'alias/vaultkeep-master-key';
  const testPlaintext = Buffer.from('CONFIDENTIAL_SYNTHETIC_TEST_DOCUMENT_DATA_VAULTKEEP_2026', 'utf-8');
  const encryptionContext = { ownerId: 'test-owner-123', documentId: 'test-doc-456' };

  it('should successfully encrypt and decrypt a synthetic test document', async () => {
    const encrypted = await EnvelopeEncryptionService.encryptDocument(testPlaintext, mockKmsKeyId, encryptionContext);

    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.ciphertext).not.toEqual(testPlaintext);
    expect(encrypted.encryptedDekBase64).toBeDefined();
    expect(encrypted.ivBase64).toBeDefined();
    expect(encrypted.authTagBase64).toBeDefined();
    expect(encrypted.algorithm).toBe('AES-256-GCM');
    expect(encrypted.checksumSha256).toBeDefined();

    const decrypted = await EnvelopeEncryptionService.decryptDocument(
      encrypted.ciphertext,
      encrypted.encryptedDekBase64,
      encrypted.ivBase64,
      encrypted.authTagBase64,
      mockKmsKeyId,
      encrypted.checksumSha256,
      encryptionContext
    );

    expect(decrypted.toString('utf-8')).toEqual(testPlaintext.toString('utf-8'));
  });

  it('should immediately fail and throw error if ciphertext is tampered with', async () => {
    const encrypted = await EnvelopeEncryptionService.encryptDocument(testPlaintext, mockKmsKeyId, encryptionContext);

    // Tamper with the first byte of ciphertext
    const tamperedCiphertext = Buffer.from(encrypted.ciphertext);
    tamperedCiphertext[0] ^= 0xff;

    await expect(
      EnvelopeEncryptionService.decryptDocument(
        tamperedCiphertext,
        encrypted.encryptedDekBase64,
        encrypted.ivBase64,
        encrypted.authTagBase64,
        mockKmsKeyId,
        encrypted.checksumSha256,
        encryptionContext
      )
    ).rejects.toThrow();
  });

  it('should fail if authentication tag is invalid or tampered with', async () => {
    const encrypted = await EnvelopeEncryptionService.encryptDocument(testPlaintext, mockKmsKeyId, encryptionContext);

    // Tampered auth tag
    const fakeTag = Buffer.alloc(16, 0xaa).toString('base64');

    await expect(
      EnvelopeEncryptionService.decryptDocument(
        encrypted.ciphertext,
        encrypted.encryptedDekBase64,
        encrypted.ivBase64,
        fakeTag,
        mockKmsKeyId,
        encrypted.checksumSha256,
        encryptionContext
      )
    ).rejects.toThrow();
  });

  it('should fail if checksum validation detects mismatch', async () => {
    const encrypted = await EnvelopeEncryptionService.encryptDocument(testPlaintext, mockKmsKeyId, encryptionContext);

    const wrongChecksum = '0000000000000000000000000000000000000000000000000000000000000000';

    await expect(
      EnvelopeEncryptionService.decryptDocument(
        encrypted.ciphertext,
        encrypted.encryptedDekBase64,
        encrypted.ivBase64,
        encrypted.authTagBase64,
        mockKmsKeyId,
        wrongChecksum,
        encryptionContext
      )
    ).rejects.toThrow(/Integrity check failed/);
  });
});

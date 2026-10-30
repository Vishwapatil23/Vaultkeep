import dotenv from 'dotenv';
import path from 'path';

// Ensure .env is loaded from backend directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { query } from '../db';
import { S3Client, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';

async function checkS3Reflection() {
  console.log('\n================================================================');
  console.log('       VaultKeep Amazon S3 Document Bucket Reflection Audit     ');
  console.log('================================================================');

  const s3Bucket = process.env.S3_BUCKET_NAME || 'vaultkeep-documents-327973843616-us-east-1';
  const region = process.env.AWS_REGION || 'us-east-1';

  console.log(`Bucket Name: ${s3Bucket}`);
  console.log(`Region:      ${region}`);
  console.log(`Encryption:  AWS KMS Envelope + S3 AES256`);
  console.log('================================================================\n');

  try {
    const s3Client = new S3Client({ region });
    
    // 1. Fetch objects from AWS S3
    const listRes = await s3Client.send(new ListObjectsV2Command({
      Bucket: s3Bucket,
      Prefix: 'vault/'
    }));

    const s3Objects = listRes.Contents || [];
    console.log(`Found ${s3Objects.length} encrypted document object(s) in S3 under prefix 'vault/':\n`);

    const s3Map = new Map<string, { size: number; lastModified?: Date }>();
    for (const obj of s3Objects) {
      if (obj.Key) {
        s3Map.set(obj.Key, { size: obj.Size || 0, lastModified: obj.LastModified });
      }
    }

    // 2. Fetch documents from PostgreSQL database
    const dbDocsRes = await query(`
      SELECT 
        d.id,
        d.owner_id,
        u.name AS owner_name,
        u.email AS owner_email,
        d.original_name,
        d.storage_key,
        d.file_size_bytes,
        d.mime_type,
        d.upload_status,
        d.created_at
      FROM documents d
      LEFT JOIN users u ON u.id = d.owner_id
      WHERE d.upload_status != 'DELETED'
      ORDER BY d.created_at DESC
    `);

    const comparisonList: Array<{
      'Original File': string;
      'Owner': string;
      'S3 Storage Key': string;
      'Plaintext Size': string;
      'S3 Blob Size': string;
      'Status in S3': string;
      'Uploaded At': string;
    }> = [];

    for (const doc of dbDocsRes.rows) {
      const s3Entry = s3Map.get(doc.storage_key);
      const isReflected = !!s3Entry;

      comparisonList.push({
        'Original File': doc.original_name,
        'Owner': doc.owner_name ? `${doc.owner_name} (${doc.owner_email})` : doc.owner_id,
        'S3 Storage Key': doc.storage_key,
        'Plaintext Size': `${doc.file_size_bytes} B`,
        'S3 Blob Size': isReflected ? `${s3Entry.size} B` : 'NOT FOUND',
        'Status in S3': isReflected ? 'CONFIRMED IN S3' : 'MISSING',
        'Uploaded At': new Date(doc.created_at).toISOString().replace('T', ' ').substring(0, 19),
      });
    }

    console.table(comparisonList);

    const confirmedCount = comparisonList.filter(c => c['Status in S3'] === 'CONFIRMED IN S3').length;
    console.log(`\nReflection Summary: ${confirmedCount} of ${comparisonList.length} database document(s) verified in Amazon S3.`);
    if (confirmedCount === comparisonList.length) {
      console.log('ALL DOCUMENTS IN THE APPLICATION ARE 100% REFLECTED IN AMAZON S3 BUCKET!\n');
    }

  } catch (err: any) {
    console.error('[S3 Audit Error]', err.message);
  } finally {
    process.exit(0);
  }
}

checkS3Reflection();


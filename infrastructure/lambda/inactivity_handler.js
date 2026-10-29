/**
 * AWS Lambda Function: VaultKeep Inactivity Monitoring & Release Engine
 * Triggered by: Amazon EventBridge Scheduled Rule (e.g. cron(0 0 * * ? *) or rate(1 day))
 * Architecture role: Scheduled Cloud Automation (Specification Section 13 & 15)
 */

const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const { Pool } = require('pg');

const region = process.env.AWS_REGION || 'us-east-1';
const snsClient = new SNSClient({ region });
const ssmClient = new SSMClient({ region });
const INACTIVITY_TOPIC_ARN = process.env.SNS_INACTIVITY_TOPIC_ARN;
const ACCESS_GRANTED_TOPIC_ARN = process.env.SNS_ACCESS_GRANTED_TOPIC_ARN;

let pool = null;
let cachedPassword = null;

async function getDbPassword() {
  if (process.env.DB_PASSWORD) {
    return process.env.DB_PASSWORD;
  }
  if (cachedPassword) {
    return cachedPassword;
  }
  const paramName = process.env.DB_PASSWORD_PARAM || process.env.SSM_DB_PASSWORD_PARAM || '/vaultkeep/prod/db_password';
  if (paramName) {
    console.log(`[VaultKeep Lambda] Fetching database password securely from SSM: ${paramName}`);
    const res = await ssmClient.send(new GetParameterCommand({
      Name: paramName,
      WithDecryption: true
    }));
    cachedPassword = res.Parameter.Value;
    return cachedPassword;
  }
  throw new Error('[VaultKeep Lambda Error] Neither DB_PASSWORD nor DB_PASSWORD_PARAM is configured.');
}

async function getPool() {
  if (!pool) {
    const password = await getDbPassword();
    pool = new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: password,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: 2,
      connectionTimeoutMillis: 5000
    });
  }
  return pool;
}

exports.handler = async (event, context) => {
  console.log('[VaultKeep Automation] EventBridge execution started at:', new Date().toISOString());
  console.log('[Event Details]', JSON.stringify(event));

  const db = await getPool();
  const client = await db.connect();
  const now = new Date();

  let gracePeriodsStarted = 0;
  let accessGrantsCreated = 0;

  try {
    await client.query('BEGIN');

    // 1. Identify active accounts whose check-in deadline has expired
    const overdueQuery = `
      SELECT al.id, al.owner_id, al.next_check_in_deadline, u.name as owner_name, u.email as owner_email,
             os.grace_period_days
      FROM account_lifecycle al
      JOIN users u ON u.id = al.owner_id
      JOIN owner_settings os ON os.owner_id = al.owner_id
      WHERE al.current_state = 'ACTIVE'
        AND al.next_check_in_deadline <= $1
      FOR UPDATE;
    `;
    const overdueResult = await client.query(overdueQuery, [now]);

    for (const row of overdueResult.rows) {
      const graceEnd = new Date(now.getTime() + (row.grace_period_days || 7) * 24 * 60 * 60 * 1000);

      // Transition to GRACE_PERIOD
      await client.query(
        `UPDATE account_lifecycle
         SET current_state = 'GRACE_PERIOD',
             flagged_inactive_at = $1,
             grace_period_ends_at = $2,
             state_transition_reason = 'Check-in deadline expired; grace period initiated by EventBridge',
             updated_at = $1
         WHERE id = $3`,
        [now, graceEnd, row.id]
      );

      // Notify nominees via SNS
      const nomineesRes = await client.query(
        `SELECT full_name, email FROM nominees WHERE owner_id = $1 AND invitation_status = 'ACCEPTED'`,
        [row.owner_id]
      );

      if (INACTIVITY_TOPIC_ARN) {
        for (const nominee of nomineesRes.rows) {
          await snsClient.send(new PublishCommand({
            TopicArn: INACTIVITY_TOPIC_ARN,
            Subject: `[VaultKeep Security] Inactivity Notice for ${row.owner_name}`,
            Message: `Automated notice: Account owner ${row.owner_name} has missed their scheduled check-in. A ${row.grace_period_days}-day grace period has begun.`
          }));
        }
      }

      gracePeriodsStarted++;
    }

    // 2. Identify accounts in GRACE_PERIOD whose grace period has expired
    const expiredGraceQuery = `
      SELECT al.id, al.owner_id, u.name as owner_name
      FROM account_lifecycle al
      JOIN users u ON u.id = al.owner_id
      WHERE al.current_state = 'GRACE_PERIOD'
        AND al.grace_period_ends_at <= $1
        AND al.release_execution_state != 'EXECUTED'
      FOR UPDATE;
    `;
    const expiredResult = await client.query(expiredGraceQuery, [now]);

    for (const row of expiredResult.rows) {
      // Transition to ACCESS_GRANTED
      await client.query(
        `UPDATE account_lifecycle
         SET current_state = 'ACCESS_GRANTED',
             release_execution_state = 'EXECUTED',
             state_transition_reason = 'Grace period completed. Document access granted under explicit release policy.',
             updated_at = $1
         WHERE id = $2`,
        [now, row.id]
      );

      // Fetch confirmed release rules
      const rulesRes = await client.query(
        `SELECT drr.id as rule_id, drr.document_id, drr.nominee_id, drr.access_duration_days,
                n.email as nominee_email, n.nominee_user_id
         FROM document_release_rules drr
         JOIN nominees n ON n.id = drr.nominee_id
         WHERE drr.owner_id = $1 AND drr.rule_status = 'ACTIVE'`,
        [row.owner_id]
      );

      for (const rule of rulesRes.rows) {
        const expiresAt = rule.access_duration_days
          ? new Date(now.getTime() + rule.access_duration_days * 24 * 60 * 60 * 1000)
          : null;

        await client.query(
          `INSERT INTO release_grants (owner_id, nominee_id, nominee_user_id, document_id, rule_id, grant_status, granted_at, expires_at)
           VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, $7)
           ON CONFLICT (nominee_id, document_id) DO NOTHING`,
          [row.owner_id, rule.nominee_id, rule.nominee_user_id, rule.document_id, rule.rule_id, now, expiresAt]
        );

        if (ACCESS_GRANTED_TOPIC_ARN) {
          await snsClient.send(new PublishCommand({
            TopicArn: ACCESS_GRANTED_TOPIC_ARN,
            Subject: `[VaultKeep] Document Access Granted by ${row.owner_name}`,
            Message: `The grace period has concluded. You have been granted access to designated digital legacy documents from ${row.owner_name}. Please log in to your authenticated nominee portal.`
          }));
        }

        accessGrantsCreated++;
      }
    }

    await client.query('COMMIT');
    console.log(`[VaultKeep Automation Complete] Grace periods started: ${gracePeriodsStarted}, Grants created: ${accessGrantsCreated}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Inactivity evaluation completed successfully.',
        gracePeriodsStarted,
        accessGrantsCreated,
        timestamp: now.toISOString()
      })
    };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[VaultKeep Automation Error]', err);
    throw err;
  } finally {
    client.release();
  }
};

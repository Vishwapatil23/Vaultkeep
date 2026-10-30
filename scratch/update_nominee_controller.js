const fs = require('fs');
const path = require('path');

const filePath = path.resolve('backend/src/controllers/nomineeController.ts');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update addNominee INSERT
const oldInsert = `        \`INSERT INTO nominees (
          id, owner_id, nominee_user_id, full_name, email, phone,
          relationship_type, invitation_token_hash, invitation_status,
          invitation_expires_at, verified_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)\`,
        [
          nomineeId,
          req.user.id,
          linkedUserId,
          fullName.trim(),
          normalizedEmail,
          phone ? phone.trim() : null,
          relationshipType,
          tokenHash,
          invitationStatus,
          expiresAt,
          verifiedAt,
          now,
          now
        ]`;

const newInsert = `        \`INSERT INTO nominees (
          id, owner_id, nominee_user_id, full_name, email, phone,
          relationship_type, invitation_token, invitation_token_hash, invitation_status,
          invitation_expires_at, verified_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)\`,
        [
          nomineeId,
          req.user.id,
          linkedUserId,
          fullName.trim(),
          normalizedEmail,
          phone ? phone.trim() : null,
          relationshipType,
          rawInvitationToken,
          tokenHash,
          invitationStatus,
          expiresAt,
          verifiedAt,
          now,
          now
        ]`;

// Normalize line endings for replacement
content = content.replace(oldInsert.replace(/\r\n/g, '\n'), newInsert.replace(/\r\n/g, '\n'));
content = content.replace(oldInsert, newInsert);

// 2. Update addNominee messageBody and subject
const oldEmailBody = `    const subject = 'VaultKeep nominee invitation';
    const messageBody = \`Hi \${fullName.trim()},\\n\` +
      \`\${req.user.name} invited you to be a nominee in their VaultKeep digital legacy vault.\\n\\n\` +
      \`Accept invitation:\\n\${invitationLink}\\n\\n\` +
      \`This invitation expires in 7 days. If you weren’t expecting it, you can ignore this email.\\n\` +
      \`— The VaultKeep Team\`;`;

const newEmailBody = `    const subject = \`VaultKeep Digital Legacy Nominee Invitation from \${req.user.name}\`;
    const messageBody = 
\`Hello \${fullName.trim()},

\${req.user.name} (\${req.user.email}) has designated you as a Trusted Nominee in their VaultKeep Encrypted Digital Legacy Vault.

--- What does this mean? ---
As a designated nominee, you have been entrusted to receive access to specific critical documents (such as financial records, legal instructions, and emergency information) only in the event that \${req.user.name} experiences an emergency or prolonged inactivity.

Key Protection Rules:
1. All documents remain securely encrypted using AWS KMS (AES-256-GCM) envelope encryption.
2. No access is granted while \${req.user.name} remains active and checks in with the vault.
3. Access is only released if inactivity is confirmed and after a mandatory safety grace period.

--- How to Accept ---
Please accept this invitation to confirm your role and activate your secure Nominee Portal:

👉 ACCEPT INVITATION LINK:
\${invitationLink}

Important Details:
• Expiration: This invitation link is valid for 7 days.
• Relationship: \${relationshipType}
• Security Notice: You will never be asked for personal passwords or payment details.

If you were not expecting this invitation or believe it was sent in error, you can safely ignore this email.

Warm regards,
The VaultKeep Security Team
https://vaultkeep.internal\`;`;

content = content.replace(oldEmailBody.replace(/\r\n/g, '\n'), newEmailBody.replace(/\r\n/g, '\n'));
content = content.replace(oldEmailBody, newEmailBody);

// 3. Update checkSnsConfirmation
const oldCheckSns = `      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const invitationLink = \`\${frontendUrl}/?tab=accept-invitation&email=\${encodeURIComponent(nominee.email)}\`;
      const subject = 'VaultKeep nominee invitation';
      const messageBody = \`Hi \${nominee.full_name},\\n\` +
        \`\${req.user.name} invited you to be a nominee in their VaultKeep digital legacy vault.\\n\\n\` +
        \`Accept invitation:\\n\${invitationLink}\\n\\n\` +
        \`This invitation expires in 7 days. If you weren’t expecting it, you can ignore this email.\\n\` +
        \`— The VaultKeep Team\`;`;

const newCheckSns = `      let rawToken = nominee.invitation_token;
      if (!rawToken && nominee.invitation_status === 'PENDING') {
        rawToken = uuidv4() + '-' + crypto.randomBytes(16).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const newExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await query(
          \`UPDATE nominees SET invitation_token = $1, invitation_token_hash = $2, invitation_expires_at = $3, updated_at = NOW() WHERE id = $4\`,
          [rawToken, tokenHash, newExpires, nominee.id]
        );
      }

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const tokenParam = rawToken ? \`&token=\${rawToken}\` : '';
      const invitationLink = \`\${frontendUrl}/?tab=accept-invitation\${tokenParam}&email=\${encodeURIComponent(nominee.email)}\`;
      const subject = \`VaultKeep Digital Legacy Nominee Invitation from \${req.user.name}\`;
      const messageBody = 
\`Hello \${nominee.full_name},

\${req.user.name} (\${req.user.email}) has designated you as a Trusted Nominee in their VaultKeep Encrypted Digital Legacy Vault.

--- What does this mean? ---
As a designated nominee, you have been entrusted to receive access to specific critical documents (such as financial records, legal instructions, and emergency information) only in the event that \${req.user.name} experiences an emergency or prolonged inactivity.

Key Protection Rules:
1. All documents remain securely encrypted using AWS KMS (AES-256-GCM) envelope encryption.
2. No access is granted while \${req.user.name} remains active and checks in with the vault.
3. Access is only released if inactivity is confirmed and after a mandatory safety grace period.

--- How to Accept ---
Please accept this invitation to confirm your role and activate your secure Nominee Portal:

👉 ACCEPT INVITATION LINK:
\${invitationLink}

Important Details:
• Expiration: This invitation link is valid for 7 days.
• Relationship: \${nominee.relationship_type}
• Security Notice: You will never be asked for personal passwords or payment details.

If you were not expecting this invitation or believe it was sent in error, you can safely ignore this email.

Warm regards,
The VaultKeep Security Team
https://vaultkeep.internal\`;`;

content = content.replace(oldCheckSns.replace(/\r\n/g, '\n'), newCheckSns.replace(/\r\n/g, '\n'));
content = content.replace(oldCheckSns, newCheckSns);

// 4. Update acceptInvitation to clear invitation_token as well
const oldAcceptUpdate = `      // Update nominee in PostgreSQL
      await query(
        \`UPDATE nominees
         SET invitation_status = 'ACCEPTED',
             invitation_token_hash = NULL,
             verified_at = $1,
             nominee_user_id = COALESCE($2, nominee_user_id),
             updated_at = $3
         WHERE id = $4\`,
        [now, authUser?.id || null, now, nominee.id]
      );`;

const newAcceptUpdate = `      // Update nominee in PostgreSQL
      await query(
        \`UPDATE nominees
         SET invitation_status = 'ACCEPTED',
             invitation_token = NULL,
             invitation_token_hash = NULL,
             verified_at = $1,
             nominee_user_id = COALESCE($2, nominee_user_id),
             updated_at = $3
         WHERE id = $4\`,
        [now, authUser?.id || null, now, nominee.id]
      );`;

content = content.replace(oldAcceptUpdate.replace(/\r\n/g, '\n'), newAcceptUpdate.replace(/\r\n/g, '\n'));
content = content.replace(oldAcceptUpdate, newAcceptUpdate);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched nomineeController.ts');


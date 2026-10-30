const fs = require('fs');
const path = require('path');

const filePath = path.resolve('backend/src/controllers/authController.ts');
let content = fs.readFileSync(filePath, 'utf8');

const oldCode = `    // 4. Link any pending nominee records to this new user in RDS
    try {
      await query(
        \`UPDATE nominees
         SET nominee_user_id = $1, invitation_status = 'ACCEPTED', verified_at = $2, updated_at = $3
         WHERE LOWER(email) = LOWER($4)\`,
        [userId, now, now, normalizedEmail]
      );
    } catch (err: any) {`;

const newCode = `    // 4. Link any nominee records to this new user in RDS (without marking as ACCEPTED prematurely)
    try {
      await query(
        \`UPDATE nominees
         SET nominee_user_id = $1, updated_at = $2
         WHERE LOWER(email) = LOWER($3)
           AND nominee_user_id IS NULL\`,
        [userId, now, normalizedEmail]
      );
    } catch (err: any) {`;

content = content.replace(oldCode.replace(/\r\n/g, '\n'), newCode.replace(/\r\n/g, '\n'));
content = content.replace(oldCode, newCode);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched authController.ts');


/**
 * Packaging utility for VaultKeep Inactivity Worker Lambda Function.
 * Bundles inactivity_handler.js and production node_modules into inactivity_worker.zip.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const lambdaDir = __dirname;
const zipPath = path.join(lambdaDir, 'inactivity_worker.zip');

console.log('[Lambda Packager] Ensuring dependencies are installed...');
execSync('npm install --omit=dev', { cwd: lambdaDir, stdio: 'inherit' });

console.log(`[Lambda Packager] Building ${zipPath}...`);
// Use PowerShell Compress-Archive on Windows or zip on Linux/macOS
if (process.platform === 'win32') {
  execSync(
    `powershell -Command "Compress-Archive -Path '${path.join(lambdaDir, 'inactivity_handler.js')}', '${path.join(lambdaDir, 'node_modules')}' -DestinationPath '${zipPath}' -Force"`,
    { stdio: 'inherit' }
  );
} else {
  execSync(`zip -r inactivity_worker.zip inactivity_handler.js node_modules`, { cwd: lambdaDir, stdio: 'inherit' });
}

console.log(`[Lambda Packager] Successfully packaged ${zipPath} (${fs.statSync(zipPath).size} bytes).`);


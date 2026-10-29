/**
 * Packaging utility for VaultKeep Inactivity Worker Lambda Function.
 * Bundles inactivity_handler.js, rds-ca-bundle.pem, and production node_modules into inactivity_worker.zip.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const lambdaDir = __dirname;
const zipPath = path.join(lambdaDir, 'inactivity_worker.zip');
const caPath = path.join(lambdaDir, 'rds-ca-bundle.pem');

// Ensure rds-ca-bundle.pem is present in lambdaDir
if (!fs.existsSync(caPath)) {
  const backendCaPath = path.resolve(lambdaDir, '../../backend/certs/rds-ca-bundle.pem');
  if (fs.existsSync(backendCaPath)) {
    console.log(`[Lambda Packager] Copying RDS CA bundle from ${backendCaPath}...`);
    fs.copyFileSync(backendCaPath, caPath);
  }
}

console.log('[Lambda Packager] Ensuring dependencies are installed...');
execSync('npm install --omit=dev', { cwd: lambdaDir, stdio: 'inherit' });

console.log(`[Lambda Packager] Building ${zipPath}...`);
// Use PowerShell Compress-Archive on Windows or zip on Linux/macOS
if (process.platform === 'win32') {
  const filesToCompress = [
    `'${path.join(lambdaDir, 'inactivity_handler.js')}'`,
    `'${path.join(lambdaDir, 'node_modules')}'`
  ];
  if (fs.existsSync(caPath)) {
    filesToCompress.push(`'${caPath}'`);
  }
  execSync(
    `powershell -Command "Compress-Archive -Path ${filesToCompress.join(', ')} -DestinationPath '${zipPath}' -Force"`,
    { stdio: 'inherit' }
  );
} else {
  const files = ['inactivity_handler.js', 'node_modules'];
  if (fs.existsSync(caPath)) {
    files.push('rds-ca-bundle.pem');
  }
  execSync(`zip -r inactivity_worker.zip ${files.join(' ')}`, { cwd: lambdaDir, stdio: 'inherit' });
}

console.log(`[Lambda Packager] Successfully packaged ${zipPath} (${fs.statSync(zipPath).size} bytes).`);

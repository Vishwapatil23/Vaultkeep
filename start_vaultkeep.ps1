Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "  Starting VaultKeep Digital Legacy & Nominee Access System" -ForegroundColor Cyan
Write-Host "  Accessible at: http://localhost:5000 and http://localhost:5173" -ForegroundColor Green
Write-Host "===================================================================" -ForegroundColor Cyan
Set-Location -Path $PSScriptRoot
node standalone_server.js

$ErrorActionPreference = 'Stop'
$runtime = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $runtime) { throw 'Node.js 20+ is required. Install Node.js and run this script again.' }
Push-Location $PSScriptRoot
try { & $runtime server.mjs } finally { Pop-Location }

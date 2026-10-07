[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 55432,
    [ValidatePattern('^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$')]
    [string]$Database = 'postgres',
    [ValidatePattern('^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$')]
    [string]$Username = 'postgres',
    [switch]$SeedOnly,
    [switch]$AuthOnly
)

$ErrorActionPreference = 'Stop'
if ($SeedOnly -and $AuthOnly) { throw 'Choose either -SeedOnly or -AuthOnly.' }
$psql = Get-Command psql -ErrorAction Stop
$migrationNames = @('20261007073947_seed_calendar_links.sql')
if ($AuthOnly) {
    $migrationNames = @('20261007081608_secure_calendar_auth_code.sql')
} elseif (-not $SeedOnly) {
    $migrationNames = @('20261007073401_create_system_calendar_links.sql') + $migrationNames + @('20261007081608_secure_calendar_auth_code.sql')
}
$fileArguments = @()
foreach ($name in $migrationNames) {
    $migration = Join-Path $PSScriptRoot "../supabase/migrations/$name"
    if (-not (Test-Path -LiteralPath $migration -PathType Leaf)) {
        throw "Migration file not found: $migration"
    }
    $fileArguments += "--file=$migration"
}

# Use a loopback address only: SSH owns the remote connection.
# --password prompts without storing the password in this file or command history.
Write-Host "Applying calendar migration to 127.0.0.1:$Port / $Database as $Username"
$previousTimeout = $env:PGCONNECT_TIMEOUT
try {
    $env:PGCONNECT_TIMEOUT = '10'
    & $psql.Source --host=127.0.0.1 --port=$Port --dbname=$Database --username=$Username `
        --password --no-psqlrc --set=ON_ERROR_STOP=1 --single-transaction @fileArguments
    if ($LASTEXITCODE -ne 0) {
        throw 'Calendar migration failed. The transaction was rolled back.'
    }
    Write-Host 'Selected calendar migration completed successfully.'
} finally {
    $env:PGCONNECT_TIMEOUT = $previousTimeout
}

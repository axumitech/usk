param(
    [Parameter(Mandatory)][string]$Profil,
    [Parameter(Mandatory)][ValidateRange(1024,65535)][int]$Port,
    [ValidateSet('web','worker')][string]$Processus = 'web'
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$env:USK_RECETTE_V2_ROOT = (Resolve-Path -LiteralPath $Profil).Path
$env:USK_RECETTE_V2_PORT = [string]$Port
$env:USK_RECETTE_V2_BUILD_ONLY = 'true'
$public = Join-Path $env:USK_RECETTE_V2_ROOT 'public/build'
$stamp = Get-Content -Raw -LiteralPath (Join-Path $public 'usk-recipe-build.json') | ConvertFrom-Json
$manifest = Join-Path $public 'manifest.json'
$key = (Get-Content -Raw -LiteralPath $manifest | ConvertFrom-Json).'resources/js/app.tsx'.file
Push-Location -LiteralPath $repo
try {
    $revision = git rev-parse --verify HEAD
    if ($LASTEXITCODE -ne 0 -or $revision -ne $stamp.revision -or
        (Get-FileHash -LiteralPath $manifest).Hash -ne $stamp.manifest_sha256 -or
        (Get-FileHash -LiteralPath (Join-Path $public $key)).Hash -ne $stamp.entry_sha256) {
        throw 'Le code, le manifeste et le bundle doivent correspondre à la révision compilée.'
    }
    $dirty = git status --porcelain --untracked-files=no
    if ($LASTEXITCODE -ne 0 -or $dirty) { throw 'Les sources suivies ont changé depuis la compilation.' }
    if ($Processus -eq 'web') {
        & php -d opcache.enable_cli=0 -d max_execution_time=120 -S "127.0.0.1:$Port" -t public docs/recette-manuelle-v2/scripts/router.php
    } else {
        & php docs/recette-manuelle-v2/scripts/recette.php queue:work --sleep=1 --tries=1
    }
    if ($LASTEXITCODE) { throw "Le processus $Processus a quitté avec le code $LASTEXITCODE." }
} finally { Pop-Location }

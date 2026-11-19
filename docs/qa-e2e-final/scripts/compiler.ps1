param(
    [Parameter(Mandatory)][string]$Projet,
    [Parameter(Mandatory)][string]$Profil
)
$ErrorActionPreference = 'Stop'
$projectPath = (Resolve-Path -LiteralPath $Projet).Path
$profilePath = (Resolve-Path -LiteralPath $Profil).Path
$build = Join-Path $profilePath 'public/build'
if (!(Test-Path -LiteralPath (Join-Path $profilePath 'profile.json')) -or
    !(Test-Path -LiteralPath (Join-Path $profilePath 'usk-recette-v2.sqlite'))) { throw 'Profil QA absent.' }
if (Test-Path -LiteralPath $build) { throw 'La destination du bundle doit être neuve.' }
Push-Location -LiteralPath $projectPath
$previousProfile = $env:USK_RECETTE_V2_ROOT
$previousMode = $env:USK_RECETTE_V2_BUILD_ONLY
try {
    function Get-CleanRevision {
        $status = git status --porcelain --untracked-files=all
        if ($LASTEXITCODE -or $status) { throw 'Utiliser une copie de travail propre.' }
        $revision = git rev-parse --verify HEAD
        if ($LASTEXITCODE) { throw 'Révision introuvable.' }
        return $revision
    }
    $before = Get-CleanRevision
    & npm.cmd run build -- --outDir $build
    if ($LASTEXITCODE) { throw 'La compilation Vite a échoué.' }
    if ((Get-CleanRevision) -ne $before) { throw 'La révision a changé pendant la compilation.' }
    Copy-Item -LiteralPath 'public/pwa' -Destination (Split-Path -Parent $build) -Recurse
    $manifest = Join-Path $build 'manifest.json'
    $entry = (Get-Content -Raw -LiteralPath $manifest | ConvertFrom-Json).'resources/js/app.tsx'.file
    $stamp = @{
        revision = $before
        manifest_sha256 = (Get-FileHash -LiteralPath $manifest).Hash.ToLowerInvariant()
        entry_sha256 = (Get-FileHash -LiteralPath (Join-Path $build $entry)).Hash.ToLowerInvariant()
    }
    $env:USK_RECETTE_V2_ROOT = $profilePath
    $env:USK_RECETTE_V2_BUILD_ONLY = 'true'
    [IO.Directory]::CreateDirectory((Join-Path $profilePath 'storage/app/public')) | Out-Null
    & php docs/recette-manuelle-v2/scripts/recette.php storage:link
    if ($LASTEXITCODE) { throw 'Échec du lien entre les médias publics et le profil QA.' }
    if (!(Test-Path -LiteralPath (Join-Path $profilePath 'public/storage') -PathType Container)) { throw 'Médias publics inaccessibles.' }
    [IO.File]::WriteAllText((Join-Path $build 'usk-recipe-build.json'), ($stamp | ConvertTo-Json))
    $stamp | ConvertTo-Json
} finally {
    $env:USK_RECETTE_V2_ROOT = $previousProfile
    $env:USK_RECETTE_V2_BUILD_ONLY = $previousMode
    Pop-Location
}

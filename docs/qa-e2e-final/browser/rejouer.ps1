param(
    [Parameter(Mandatory)][string]$Profil,
    [Parameter(Mandatory)][ValidateRange(1024,65535)][int]$Port,
    [ValidateRange(1024,65535)][int]$MailHogPort=8025,
    [ValidateSet('pwa','portails','finances','enseignement','documents','etudiant','roles','cartes','resultats')][string]$Suite='portails',
    [string[]]$Parcours=@(),
    [string]$CodeServeur,
    [string]$Playwright,
    [string]$Navigateur,
    [string]$Preuves
)
$ErrorActionPreference='Stop'
$env:USK_RECETTE_V2_ROOT=(Resolve-Path -LiteralPath $Profil).Path
$env:USK_RECETTE_V2_PORT=[string]$Port
$env:USK_RECETTE_V2_BUILD_ONLY='true'
$env:USK_QA_MAIL_PORT=[string]$MailHogPort
if ($CodeServeur) { $env:USK_QA_SERVER_REPO=(Resolve-Path -LiteralPath $CodeServeur).Path }
if ($Playwright) { $env:USK_QA_PLAYWRIGHT=(Resolve-Path -LiteralPath $Playwright).Path }
if ($Navigateur) { $env:USK_QA_CHROME=(Resolve-Path -LiteralPath $Navigateur).Path }
if ($Preuves) { $env:USK_QA_EVIDENCE=[System.IO.Path]::GetFullPath($Preuves) }
if ($Parcours -and $Suite -ne 'portails') { throw 'Le choix de parcours concerne la suite portails.' }
& node (Join-Path $PSScriptRoot ($Suite + '.cjs')) @Parcours
exit $LASTEXITCODE

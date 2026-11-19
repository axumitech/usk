param(
    [Parameter(Mandatory)][string]$Profil,
    [Parameter(Mandatory)][ValidateRange(1024,65535)][int]$Port,
    [ValidateRange(1024,65535)][int]$MailHogPort=8025,
    [ValidateSet('pwa','annuaire-enseignants','maquettes-facultaires','progression','jury','nfc','session','portails','finances','admission-finance','enseignement','evaluation','absence','plan-cours','rattachement','medias-publics','documents','etudiant','roles','cartes','resultats','modules','ux','solde')][string]$Suite='portails',
    [string[]]$Parcours=@(),
    [ValidateRange(1,2147483647)][int]$ReprendreSupport,
    [switch]$ConsultationResultat,
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
if ($ReprendreSupport -and $Suite -ne 'enseignement') { throw 'La reprise d’un support concerne la suite enseignement.' }
if ($ReprendreSupport) { $env:USK_QA_RESUME_SUPPORT=[string]$ReprendreSupport } else { Remove-Item Env:\USK_QA_RESUME_SUPPORT -ErrorAction SilentlyContinue }
if ($ConsultationResultat -and $Suite -ne 'resultats') { throw 'La reprise de lecture concerne la suite resultats.' }
$env:USK_QA_RESULT_READ_ONLY=if ($ConsultationResultat) { 'true' } else { 'false' }
& node (Join-Path $PSScriptRoot ($Suite + '.cjs')) @Parcours
exit $LASTEXITCODE

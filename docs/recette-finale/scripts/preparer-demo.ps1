param(
    [string]$DemoRoot,
    [string]$Php = 'C:/php-8.4.5/php.exe',
    [string]$Node = 'C:/Program Files/nodejs/node.exe',
    [string]$Repo = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
)
$ErrorActionPreference = 'Stop'
if (-not $DemoRoot) { $DemoRoot = Join-Path $env:LOCALAPPDATA ('USK-Demonstration-' + [guid]::NewGuid().ToString('N')) }
$taskDemo = [IO.Path]::GetFullPath($DemoRoot).TrimEnd('\','/')
$taskRepo = (Resolve-Path -LiteralPath $Repo).Path.TrimEnd('\','/')
if ($taskDemo.Equals($taskRepo, [StringComparison]::OrdinalIgnoreCase) -or $taskDemo.StartsWith($taskRepo + '\', [StringComparison]::OrdinalIgnoreCase) -or $taskRepo.StartsWith($taskDemo + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Choisir un répertoire de démonstration extérieur au dépôt et à ses parents.'
}
if (Test-Path -LiteralPath $taskDemo) { throw 'Le répertoire existe déjà. Aucune réinitialisation autorisée par ce script.' }
New-Item -ItemType Directory -Path $taskDemo | Out-Null
$taskDirs = @('public','results','evidence','storage/framework/views','storage/framework/cache','storage/framework/sessions','storage/logs','storage/app/private')
foreach ($taskDir in $taskDirs) { New-Item -ItemType Directory -Path (Join-Path $taskDemo $taskDir) -Force | Out-Null }
Get-ChildItem -LiteralPath $PSScriptRoot -File | Where-Object { $_.Extension -in @('.php','.cjs') } | Copy-Item -Destination $taskDemo
[IO.File]::WriteAllText((Join-Path $taskDemo '.env'), '# Environnement privé de recette ; configuration injectée par le lanceur.')
$taskEnv = @{
 APP_ENV='testing'; APP_DEBUG='false'; DB_CONNECTION='sqlite'; DB_DATABASE=(Join-Path $taskDemo 'demo.sqlite'); DB_URL='';
 APP_CONFIG_CACHE=(Join-Path $taskDemo 'isolated-config.php'); APP_KEY=('base64:' + [Convert]::ToBase64String([guid]::NewGuid().ToByteArray() + [guid]::NewGuid().ToByteArray()));
 BCRYPT_ROUNDS='4'; MAIL_MAILER='array'; SESSION_DRIVER='database'; SESSION_SECURE_COOKIE='false'; CACHE_STORE='array'; QUEUE_CONNECTION='sync';
 STUDENT_ENROLLMENT_AUTO_CONFIRMATION='false'; STUDENT_ENROLLMENT_REQUIRES_FIRST_INSTALLMENT='true';
 USK_RECIPE_REPO=$taskRepo; USK_RECIPE_ARTIFACTS=(Join-Path $taskDemo 'evidence'); USK_RECIPE_PASSWORD=('Recette-' + [guid]::NewGuid().ToString('N'));
 USK_RECIPE_PHP=$Php; USK_RECIPE_NODE=$Node
}
$taskListener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
$taskListener.Start()
try { $taskPort=$taskListener.LocalEndpoint.Port } finally { $taskListener.Stop() }
$taskOrigin="http://127.0.0.1:$taskPort"
$taskEnv.APP_URL=$taskOrigin
$taskEnv.USK_RECIPE_ORIGIN=$taskOrigin
foreach ($taskKey in $taskEnv.Keys) { [Environment]::SetEnvironmentVariable($taskKey,[string]$taskEnv[$taskKey],'Process') }
New-Item -ItemType File -Path $taskEnv.DB_DATABASE | Out-Null
Push-Location -LiteralPath $taskRepo
try {
    & $Php (Join-Path $taskDemo 'seed.php')
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $taskDemo 'fixture.json'))) { throw 'Échec de la préparation isolée.' }
    Copy-Item -LiteralPath (Join-Path $taskRepo 'public/pwa') -Destination (Join-Path $taskDemo 'public/pwa') -Recurse
    & $Node node_modules/vite/bin/vite.js build --mode testing --outDir "$taskDemo/public/build" *> (Join-Path $taskDemo 'build.log')
    if ($LASTEXITCODE -ne 0) { throw 'Échec du build isolé ; consulter build.log.' }
    $taskServer = Start-Process -FilePath $Php -ArgumentList @('-S',"127.0.0.1:$taskPort",'-t',"$taskDemo/public","$taskDemo/router.php") -WindowStyle Hidden -PassThru -RedirectStandardError "$taskDemo/server-errors.log" -RedirectStandardOutput "$taskDemo/server-output.log"
    $taskRuntime=@{origin=$taskOrigin;env=$taskEnv;pid=$taskServer.Id}
    [IO.File]::WriteAllText((Join-Path $taskDemo '.runtime.json'),($taskRuntime | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
    $taskReady=$false
    for ($taskAttempt=0; $taskAttempt -lt 30; $taskAttempt++) {
        try { $taskReady=(Invoke-WebRequest -UseBasicParsing -Uri "$taskOrigin/up" -TimeoutSec 2).StatusCode -eq 200 } catch { }
        if ($taskReady) { break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $taskReady) { throw 'Serveur isolé indisponible ; consulter les journaux privés.' }
    Write-Output "Démonstration fictive prête : $taskOrigin"
    Write-Output "Données et secrets privés : $taskDemo. Ne pas versionner ni partager .runtime.json."
} finally { Pop-Location }

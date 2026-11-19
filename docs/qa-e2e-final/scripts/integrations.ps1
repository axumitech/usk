param(
    [Parameter(Mandatory)][ValidateSet('pgsql','mysql')][string]$Moteur,
    [Parameter(Mandatory)][string]$RepertoireNeuf,
    [string]$Bin,
    [string]$Projet = (Join-Path $PSScriptRoot '../../..'),
    [ValidateSet('integration','habilitations')][string]$Suite = 'integration',
    [int]$Port
)
$ErrorActionPreference = 'Stop'
$projectPath = (Resolve-Path -LiteralPath $Projet).Path
if (Test-Path -LiteralPath $RepertoireNeuf) { throw 'Choisir un nouveau répertoire local.' }
if (!$Bin) {
    $Bin = if ($Moteur -eq 'pgsql') { 'C:/Program Files/PostgreSQL/18/bin' } else { 'C:/Program Files/MySQL/MySQL Server 9.2/bin' }
}
if (!$Port) { $Port = if ($Moteur -eq 'pgsql') { 55464 } else { 33464 } }
if ($Port -lt 1024 -or $Port -gt 65535 -or $Port -in 5432,3306) { throw 'Choisir un port de test dédié.' }
$loopback = '127.0.0.1'
$probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
$probe.ExclusiveAddressUse = $true
try { $probe.Start() } finally { $probe.Stop() }
$root = [IO.Directory]::CreateDirectory($RepertoireNeuf).FullName
$data = Join-Path $root 'data'
function Invoke-Checked([string]$Exe, [string[]]$Arguments) {
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Échec de $([IO.Path]::GetFileName($Exe)) avec le code $LASTEXITCODE." }
}
$created = $false
$postgresProcess = $null
$mysqlProcess = $null
Push-Location -LiteralPath $projectPath
try {
    $env:APP_ENV = 'testing'
    $env:APP_KEY = 'base64:' + [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    $env:DB_CONNECTION = $Moteur
    $env:DB_HOST = $loopback
    $env:DB_PORT = [string]$Port
    $env:DB_URL = 'null'
    $env:DB_PASSWORD = ''
    $env:CACHE_STORE = 'array'
    $env:QUEUE_CONNECTION = 'sync'
    $env:SESSION_DRIVER = 'array'
    $env:MAIL_MAILER = 'array'
    $env:LARAVEL_STORAGE_PATH = Join-Path $root 'storage'
    foreach ($sub in 'framework/cache/data','framework/views','framework/sessions','app/private','app/public','logs') {
        [IO.Directory]::CreateDirectory((Join-Path $env:LARAVEL_STORAGE_PATH $sub)) | Out-Null
    }
    $env:USK_QA_MYSQL_DATADIR = $data
    foreach ($kind in 'CONFIG','SERVICES','PACKAGES','ROUTES','EVENTS') {
        # Laravel resolves relative paths against the project, including Windows drive paths.
        $relativeCache = [IO.Path]::GetRelativePath($projectPath,(Join-Path $root "$kind.php"))
        [Environment]::SetEnvironmentVariable("APP_${kind}_CACHE",$relativeCache,'Process')
    }
    if ($Moteur -eq 'pgsql') {
        $env:DB_DATABASE = $env:DB_USERNAME = 'umk_test'
        if (!(php -m | Select-String '^pdo_pgsql$')) {
            $phpBin = Split-Path (Get-Command php).Source
            $ext = (Resolve-Path (Join-Path $phpBin 'ext/php_pdo_pgsql.dll')).Path.Replace('\','/')
            $env:PHP_INI_SCAN_DIR = [IO.Directory]::CreateDirectory((Join-Path $root 'ini')).FullName
            [IO.File]::WriteAllText((Join-Path $env:PHP_INI_SCAN_DIR 'pgsql.ini'),"extension=""$ext""")
        }
        Invoke-Checked "$Bin/initdb.exe" @('-D',$data,'-U','umk_test','-A','trust','--no-locale','--encoding=UTF8')
        $postgresProcess = Start-Process -FilePath "$Bin/postgres.exe" -ArgumentList @('-D',"""$data""",'-h',$loopback,'-p',"$Port") -WindowStyle Hidden -RedirectStandardError (Join-Path $root 'serveur.log') -PassThru
        for ($n=0; $n -lt 60; $n++) {
            & "$Bin/pg_isready.exe" -h $loopback -p $Port -U umk_test -d postgres *> $null
            if ($LASTEXITCODE -eq 0) { break }
            if ($postgresProcess.HasExited) { throw 'Arrêt prématuré de PostgreSQL.' }
            Start-Sleep -Milliseconds 500
        }
        $connection = @('-h',$loopback,'-p',[string]$Port,'-U','umk_test','-w')
        $actual = Invoke-Checked "$Bin/psql.exe" ($connection + @('-d','postgres','-AtX','-c','SHOW data_directory'))
        if ([IO.Path]::GetFullPath($actual) -ne [IO.Path]::GetFullPath($data)) { throw 'Identité PostgreSQL inattendue.' }
        $created = $true
        Invoke-Checked "$Bin/createdb.exe" ($connection + @('umk_test'))
        $identity = Invoke-Checked "$Bin/psql.exe" ($connection + @('-d','umk_test','-AtX','-c','SELECT current_database(),inet_server_addr(),inet_server_port()'))
        if ($identity -ne "umk_test|127.0.0.1|$Port") { throw 'Cible PostgreSQL inattendue.' }
    } else {
        $env:DB_DATABASE = 'usk_qa_e2e'
        $env:DB_USERNAME = 'root'
        Invoke-Checked "$Bin/mysqld.exe" @('--no-defaults','--initialize-insecure',"--datadir=$data","--basedir=$(Split-Path $Bin)")
        $mysqlProcess = Start-Process -FilePath "$Bin/mysqld.exe" -ArgumentList @('--no-defaults',"""--datadir=$data""","""--basedir=$(Split-Path $Bin)""","--bind-address=$loopback","--port=$Port",'--mysqlx=OFF','--skip-log-bin') -WindowStyle Hidden -PassThru
        $adminConnection = @('--no-defaults','--protocol=TCP',"-h$loopback","-P$Port",'-uroot')
        $connection = $adminConnection + @('--batch','--skip-column-names')
        for ($n=0; $n -lt 40; $n++) {
            & "$Bin/mysqladmin.exe" @adminConnection ping *> $null
            if ($LASTEXITCODE -eq 0) { break }
            if ($mysqlProcess.HasExited) { throw 'Arrêt prématuré de MySQL.' }
            Start-Sleep -Milliseconds 500
        }
        $actual = Invoke-Checked "$Bin/mysql.exe" ($connection + @('-e','SELECT @@datadir'))
        if ([IO.Path]::GetFullPath($actual).TrimEnd('\','/') -ne [IO.Path]::GetFullPath($data)) { throw 'Identité MySQL inattendue.' }
        $created = $true
        Invoke-Checked "$Bin/mysql.exe" ($connection + @('-e','CREATE DATABASE usk_qa_e2e CHARACTER SET utf8mb4'))
        $identity = Invoke-Checked "$Bin/mysql.exe" ($connection + @('usk_qa_e2e','-e','SELECT CONCAT_WS("|",DATABASE(),@@bind_address,@@port)'))
        if ($identity -ne "usk_qa_e2e|127.0.0.1|$Port") { throw 'Cible MySQL inattendue.' }
    }
    "Cible vérifiée $identity"
    $filter = if ($Suite -eq 'habilitations') {
        'InstitutionalRoleCatalogMigrationTest|AnnualFacultyPackScopeTest|GroupPromotionCurriculumTest'
    } elseif ($Moteur -eq 'pgsql') {
        [regex]::Match((Get-Content -Raw .github/workflows/tests.yml),"--filter='([^']+)'").Groups[1].Value
    } else { 'AcademicStructureTest|UniversityFinanceTest|EnrollmentFinancialConfirmationTest|PaymentRecordingNavigationTest' }
    if (!$filter) { throw 'Filtre de tests vide.' }
    Invoke-Checked 'php' @('-d','memory_limit=1G','vendor/bin/phpunit',"--filter=$filter",'--do-not-cache-result')
    if ($Moteur -eq 'pgsql' -and $Suite -eq 'integration') {
        Invoke-Checked 'php' @('-d','memory_limit=1G','vendor/bin/phpunit','tests/Integration/PostgresConcurrencyTest.php','--do-not-cache-result')
    }
} finally {
    if ($Moteur -eq 'pgsql' -and $created) { Invoke-Checked "$Bin/pg_ctl.exe" @('-D',$data,'-m','fast','-w','stop') }
    if ($postgresProcess -and !$created -and !$postgresProcess.HasExited) { $postgresProcess.Kill() }
    if ($Moteur -eq 'mysql' -and $mysqlProcess -and !$mysqlProcess.HasExited) {
        if ($created) { & "$Bin/mysqladmin.exe" @adminConnection shutdown }
        if (!$mysqlProcess.WaitForExit(5000)) { $mysqlProcess.Kill() }
    }
    Pop-Location
}

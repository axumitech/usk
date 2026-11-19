<?php

require __DIR__.'/bootstrap.php';

use Database\Seeders\LocalUniversityRecetteSeeder;
use Illuminate\Contracts\Console\Kernel;
use Symfony\Component\Console\Input\ArgvInput;
use Symfony\Component\Console\Input\ArrayInput;
use Symfony\Component\Console\Output\ConsoleOutput;

$command = $argv[1] ?? '';
if (! in_array($command, ['install', 'db:seed', 'queue:work', 'migrate:status', 'storage:link'], true)) {
    fwrite(STDERR, "Commandes de recette : install, db:seed, queue:work, migrate:status, storage:link.\n");
    exit(1);
}

try {
    if ($command === 'storage:link' && (count($argv) !== 2 || ! recetteBuiltPublicPath())) {
        throw new RuntimeException('Le lien de stockage exige le répertoire public compilé du profil QA.');
    }
    $app = recetteApplication($command === 'install');
} catch (RuntimeException $exception) {
    fwrite(STDERR, $exception->getMessage().PHP_EOL);
    exit(1);
}

if ($command === 'install') {
    $status = $app->make(Kernel::class)->handle(new ArrayInput(['command' => 'migrate', '--force' => true]), new ConsoleOutput);
    if ($status !== 0) {
        exit($status);
    }
    $command = 'db:seed';
}

if ($command === 'db:seed') {
    $argv = [$argv[0], $command, '--class='.LocalUniversityRecetteSeeder::class];
}
if ($command === 'queue:work') {
    $argv = [$argv[0], $command, 'database', '--queue=default', ...array_slice($argv, 2)];
}

exit($app->handleCommand(new ArgvInput($argv)));

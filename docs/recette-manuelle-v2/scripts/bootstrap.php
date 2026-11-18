<?php

use Database\Seeders\RecetteV2\RecipeDatabase;
use Illuminate\Foundation\Application;
use Illuminate\Mail\Events\MessageSending;
use Symfony\Component\Mime\Address;

function recettePort(): int
{
    $port = filter_var(getenv('USK_RECETTE_V2_PORT') ?: '8016', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1024, 'max_range' => 65535]]);
    if ($port === false) {
        throw new RuntimeException('Le port de recette est invalide.');
    }

    return $port;
}

function recetteBuiltPublicPath(): ?string
{
    if (getenv('USK_RECETTE_V2_BUILD_ONLY') !== 'true') {
        return null;
    }

    $project = dirname(__DIR__, 3);
    $root = realpath(getenv('USK_RECETTE_V2_ROOT') ?: $project.'/storage/app/recette-manuelle-v2');
    $public = $root ? realpath($root.'/public') : false;
    if (! $public || $public !== $root.DIRECTORY_SEPARATOR.'public' || ! is_file($public.'/build/manifest.json')) {
        throw new RuntimeException('Compilez le bundle dans public/build du profil de recette.');
    }

    return $public;
}


function recetteApplication(bool $initialize = false): Application
{
    $project = dirname(__DIR__, 3);
    require_once $project.'/vendor/autoload.php';

    $directory = RecipeDatabase::directory($project);
    if ($initialize) {
        RecipeDatabase::initialize($directory);
    }
    $profile = RecipeDatabase::profile($directory);
    $root = dirname($profile['database']);
    $storage = $root.'/storage';

    foreach (['app/private', 'app/public', 'framework/cache/data', 'framework/sessions', 'framework/views', 'logs'] as $path) {
        if (! is_dir($storage.'/'.$path) && ! mkdir($storage.'/'.$path, 0700, true) && ! is_dir($storage.'/'.$path)) {
            throw new RuntimeException('Impossible de préparer le stockage de recette.');
        }
    }

    $environment = [
        'APP_ENV' => 'local',
        'APP_DEBUG' => 'false',
        'APP_KEY' => $profile['app_key'],
        'APP_URL' => 'http://127.0.0.1:'.recettePort(),
        'APP_MAINTENANCE_DRIVER' => 'file',
        'DB_CONNECTION' => 'sqlite',
        'DB_DATABASE' => $profile['database'],
        'DB_URL' => '',
        'DB_FOREIGN_KEYS' => 'true',
        'FILESYSTEM_DISK' => 'local',
        'CACHE_DRIVER' => 'file',
        'CACHE_STORE' => 'file',
        'SESSION_DRIVER' => 'database',
        'SESSION_CONNECTION' => 'sqlite',
        'SESSION_DOMAIN' => 'null',
        'SESSION_COOKIE' => 'usk_recette_v2_'.recettePort(),
        'SESSION_SECURE_COOKIE' => 'false',
        'QUEUE_CONNECTION' => 'database',
        'DB_QUEUE_CONNECTION' => 'sqlite',
        'DB_QUEUE' => 'default',
        'MAIL_MAILER' => 'smtp',
        'MAIL_HOST' => '127.0.0.1',
        'MAIL_PORT' => '1025',
        'MAIL_URL' => 'null',
        'MAIL_SCHEME' => 'smtp',
        'MAIL_USERNAME' => 'null',
        'MAIL_PASSWORD' => 'null',
        'MAIL_FROM_ADDRESS' => 'noreply@usk.test',
        'MAIL_FROM_NAME' => 'USK Recette',
        'ADMISSIONS_NOTIFICATION_EMAIL' => 'admissions@usk.test',
        'LOG_CHANNEL' => 'single',
        'INERTIA_SSR_ENABLED' => 'false',
        'SEO_INDEXABLE' => 'false',
        'SEO_ENFORCE_ORIGIN' => 'false',
        'SEO_BUILT_ASSETS' => recetteBuiltPublicPath() ? 'true' : 'false',
        'STUDENT_ENROLLMENT_AUTO_CONFIRMATION' => 'true',
        'STUDENT_ENROLLMENT_REQUIRES_FIRST_INSTALLMENT' => 'true',
        'STUDENT_ENROLLMENT_ACTIVATION_PERCENTAGE' => '30',
    ];
    foreach (['CONFIG', 'SERVICES', 'PACKAGES', 'ROUTES', 'EVENTS'] as $cache) {
        $environment['APP_'.$cache.'_CACHE'] = $storage.'/framework/'.strtolower($cache).'.php';
    }
    foreach ($environment as $key => $value) {
        putenv($key.'='.$value);
        $_SERVER[$key] = $_ENV[$key] = $value;
    }

    $app = require $project.'/bootstrap/app.php';
    $app->useEnvironmentPath($root)->loadEnvironmentFrom('recette.env');
    $app->useStoragePath($storage);
    if ($public = recetteBuiltPublicPath()) {
        $app->usePublicPath($public);
    }
    $app->addAbsoluteCachePathPrefix($storage.'/');
    $app->booted(function (Application $app) {
        $app['events']->listen(MessageSending::class, function (MessageSending $event): ?bool {
            $recipients = [...$event->message->getTo(), ...$event->message->getCc(), ...$event->message->getBcc()];
            foreach ($recipients as $recipient) {
                /** @var Address $recipient */
                if (! str_ends_with(strtolower($recipient->getAddress()), '@usk.test')) {
                    return false;
                }
            }

            return $recipients === [] ? false : null;
        });
    });

    return $app;
}

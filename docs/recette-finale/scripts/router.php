<?php
$public = __DIR__.'/public';
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if ($uri && is_file($public.$uri)) {
    return false;
}
if ($uri && str_starts_with($uri, '/assets/')) {
    $assets = realpath(getenv('USK_RECIPE_REPO').'/public/assets');
    $file = realpath($assets.substr($uri, strlen('/assets')));
    if ($file && str_starts_with($file, $assets.DIRECTORY_SEPARATOR) && is_file($file)) {
        $types = ['css' => 'text/css', 'js' => 'application/javascript', 'svg' => 'image/svg+xml'];
        header('Content-Type: '.($types[pathinfo($file, PATHINFO_EXTENSION)] ?? mime_content_type($file)));
        readfile($file);
        return true;
    }
}
require getenv('USK_RECIPE_REPO').'/vendor/autoload.php';
$app = require getenv('USK_RECIPE_REPO').'/bootstrap/app.php';
$app->useEnvironmentPath(__DIR__);
$app->usePublicPath($public);
$app->useStoragePath(__DIR__.'/storage');
if (is_file(__DIR__.'/clock.json')) {
    if (getenv('APP_ENV') !== 'testing' || realpath(getenv('DB_DATABASE')) !== realpath(__DIR__.'/demo.sqlite')) {
        throw new RuntimeException('Simulated clock requires the isolated demo database.');
    }
    $recipeClock = json_decode(file_get_contents(__DIR__.'/clock.json'), true, 512, JSON_THROW_ON_ERROR);
    \Carbon\Carbon::setTestNow($recipeClock['now']);
    \Carbon\CarbonImmutable::setTestNow($recipeClock['now']);
}
$app->handleRequest(Illuminate\Http\Request::capture());

<?php

declare(strict_types=1);

$root = (string) getenv('USK_RECETTE_V2_ROOT');
$server = realpath((string) getenv('USK_QA_SERVER_REPO'));
if (PHP_SAPI !== 'cli-server' || ($_SERVER['REMOTE_ADDR'] ?? '') !== '127.0.0.1' || (int) ($_SERVER['SERVER_PORT'] ?? 0) !== 8072
    || getenv('USK_RECETTE_V2_PORT') !== '8072' || getenv('USK_RECETTE_V2_BUILD_ONLY') !== 'true' || ! $server
    || ! preg_match('/^usk_qa_e2e-jury(?:-[a-z0-9_-]+)?$/i', basename(str_replace('\\', '/', $root))) || ! is_file($root.'/jury-temoin.json')) {
    http_response_code(400);

    return;
}
$router = $server.'/docs/recette-manuelle-v2/scripts/router.php';
$uri = (string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (str_starts_with($uri, '/build/') || str_starts_with($uri, '/pwa/') || $uri === '/__usk_recipe/version') {
    return require $router;
}
require_once $server.'/vendor/autoload.php';
$profile = \Database\Seeders\RecetteV2\RecipeDatabase::profile($root);
$final = json_decode(file_get_contents($root.'/final-qa.json'), true, 512, JSON_THROW_ON_ERROR);
if ($profile['token'] !== ($final['token'] ?? null)) {
    http_response_code(400);

    return;
}
$time = is_file($root.'/jury-epreuve-terminee') ? '2026-06-23 09:10:00 Africa/Kinshasa' : '2026-06-23 09:00:00 Africa/Kinshasa';
// The browser uses real time. Keep CSRF cookies valid until the actual test ends.
$lifetime = (string) max(120, (int) ceil((time() - strtotime($time)) / 60) + 120);
putenv('SESSION_LIFETIME='.$lifetime);
$_SERVER['SESSION_LIFETIME'] = $_ENV['SESSION_LIFETIME'] = $lifetime;
putenv('SESSION_EXPIRE_ON_CLOSE=true');
$_SERVER['SESSION_EXPIRE_ON_CLOSE'] = $_ENV['SESSION_EXPIRE_ON_CLOSE'] = 'true';
\Carbon\Carbon::setTestNow($time);
\Carbon\CarbonImmutable::setTestNow($time);

return require $router;

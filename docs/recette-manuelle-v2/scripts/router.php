<?php

use Illuminate\Http\Request;

require __DIR__.'/bootstrap.php';

$port = recettePort();
if (($_SERVER['REMOTE_ADDR'] ?? '') !== '127.0.0.1' || (int) ($_SERVER['SERVER_PORT'] ?? 0) !== $port) {
    http_response_code(400);

    return;
}

$project = dirname(__DIR__, 3);
$public = realpath($project.'/public');
$built = recetteBuiltPublicPath();
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);

if ($uri === '/__usk_recipe/version' && ($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    require_once $project.'/vendor/autoload.php';
    require __DIR__.'/version.php';

    return;
}

if ($uri && $built && str_starts_with($uri, '/build/')) {
    $buildRoot = realpath($built.'/build');
    $asset = realpath($built.'/'.rawurldecode($uri));
    $types = ['css' => 'text/css', 'js' => 'text/javascript', 'json' => 'application/json', 'svg' => 'image/svg+xml', 'woff' => 'font/woff', 'woff2' => 'font/woff2'];
    $type = $types[strtolower(pathinfo($uri, PATHINFO_EXTENSION))] ?? null;
    if ($asset && $type && str_starts_with($asset, $buildRoot.DIRECTORY_SEPARATOR) && is_file($asset)) {
        header('Content-Type: '.$type);
        readfile($asset);
    } else {
        http_response_code(404);
    }

    return;
}

$asset = $uri ? realpath($public.'/'.rawurldecode($uri)) : false;
if ($asset && str_starts_with($asset, $public.DIRECTORY_SEPARATOR) && is_file($asset)
    && ($uri === '/pwa/offline.html'
        || in_array(strtolower(pathinfo($asset, PATHINFO_EXTENSION)), ['css', 'js', 'json', 'svg', 'png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'ico', 'woff', 'woff2', 'webmanifest', 'pdf'], true))) {
    return false;
}

recetteApplication()->handleRequest(Request::capture());

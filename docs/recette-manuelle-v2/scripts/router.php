<?php

use Illuminate\Http\Request;

require __DIR__.'/bootstrap.php';

$public = realpath(dirname(__DIR__, 3).'/public');
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$asset = $uri ? realpath($public.'/'.rawurldecode($uri)) : false;
if ($asset && str_starts_with($asset, $public.DIRECTORY_SEPARATOR) && is_file($asset)
    && in_array(strtolower(pathinfo($asset, PATHINFO_EXTENSION)), ['css', 'js', 'json', 'svg', 'png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'ico', 'woff', 'woff2', 'webmanifest', 'pdf'], true)) {
    return false;
}

recetteApplication()->handleRequest(Request::capture());

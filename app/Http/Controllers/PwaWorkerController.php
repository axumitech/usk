<?php

namespace App\Http\Controllers;

use Illuminate\Http\Response;

final class PwaWorkerController
{
    public function __invoke(): Response
    {
        $worker = resource_path('pwa/sw.js');
        $offline = public_path('pwa/offline.html');
        $manifest = public_path('build/manifest.json');
        $version = hash('sha256', hash_file('sha256', $worker).hash_file('sha256', $offline).(is_file($manifest) ? hash_file('sha256', $manifest) : ''));

        return response('const VERSION = '.json_encode($version).";\n".file_get_contents($worker), 200, [
            'Content-Type' => 'application/javascript; charset=UTF-8',
            'Cache-Control' => 'no-cache, max-age=0, must-revalidate',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}

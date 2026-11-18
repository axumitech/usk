<?php

use Symfony\Component\Process\Process;

$git = static function (string ...$arguments) use ($project): ?string {
    try {
        $process = new Process(['git', '-C', $project, ...$arguments], timeout: 3);
        $process->run();

        return $process->isSuccessful() ? trim($process->getOutput()) : null;
    } catch (RuntimeException) {
        return null;
    }
};

$build = ($built ?: $public).'/build';
$manifest = $build.'/manifest.json';
$manifestHash = is_file($manifest) ? hash_file('sha256', $manifest) : null;
$manifestData = $manifestHash ? json_decode(file_get_contents($manifest), true) : null;
$entry = $manifestData['resources/js/app.tsx']['file'] ?? null;
$entryHash = is_string($entry) && preg_match('#^assets/[A-Za-z0-9_-]+\.js$#D', $entry) && is_file($build.'/'.$entry)
    ? hash_file('sha256', $build.'/'.$entry)
    : null;
$marker = $build.'/usk-recipe-build.json';
$stamp = is_file($marker) ? json_decode(file_get_contents($marker), true) : null;
$assetRevision = $manifestHash && $entryHash
    && $manifestHash === ($stamp['manifest_sha256'] ?? null)
    && $entryHash === ($stamp['entry_sha256'] ?? null)
    && preg_match('/^[a-f0-9]{40}$/D', $stamp['revision'] ?? '')
    ? $stamp['revision']
    : null;
$status = $git('status', '--porcelain', '--untracked-files=no');
$hot = ! $built && is_file($public.'/hot');

header('Content-Type: application/json');
header('Cache-Control: private, no-store');
echo json_encode([
    'port' => $port,
    'revision' => $git('rev-parse', '--verify', 'HEAD'),
    'branch' => $git('branch', '--show-current'),
    'tracked_changes' => $status === null ? null : $status !== '',
    'opcache_cli' => in_array(ini_get('opcache.enable_cli'), ['1', 'On'], true),
    'assets' => [
        'mode' => $hot ? 'vite' : 'build',
        'entry' => $hot ? null : $entry,
        'manifest_sha256' => $hot ? null : $manifestHash,
        'entry_sha256' => $hot ? null : $entryHash,
        'revision' => $hot ? null : $assetRevision,
    ],
], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);

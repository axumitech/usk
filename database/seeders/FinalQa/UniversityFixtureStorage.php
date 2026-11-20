<?php

namespace Database\Seeders\FinalQa;

use Closure;
use FilesystemIterator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Throwable;

/** Publish the generated files together with the database transaction. */
final class UniversityFixtureStorage
{
    public static function transaction(Closure $populate): void
    {
        $roots = ['local' => 'private', 'private' => 'private', 'public' => 'public'];
        File::ensureDirectoryExists(storage_path('app'));
        $appStorage = realpath(storage_path('app'));
        if ($appStorage === false) {
            throw new RuntimeException('Le dossier de stockage de la démonstration est inaccessible.');
        }
        foreach ($roots as $disk => $directory) {
            $expected = $appStorage.DIRECTORY_SEPARATOR.$directory;
            if (! is_dir($expected) && ! is_link($expected)) {
                File::ensureDirectoryExists($expected, $directory === 'private' ? 0700 : 0755);
            }
            if (is_link($expected) || config("filesystems.disks.$disk.driver") !== 'local' || realpath(config("filesystems.disks.$disk.root")) !== $expected) {
                throw new RuntimeException('Le stockage des fixtures doit être local au profil QA final.');
            }
        }
        File::ensureDirectoryExists(storage_path('framework'));
        $stage = storage_path('framework/fixtures-'.bin2hex(random_bytes(12)));
        if (! mkdir($stage, 0700)) {
            throw new RuntimeException('Impossible de créer le stockage temporaire de simulation.');
        }
        $previous = [];
        $published = [];
        $lock = null;
        try {
            $lockPath = $appStorage.'/.university-fixtures.lock';
            if (is_link($lockPath) || ! ($lock = fopen($lockPath, 'c+b')) || ! flock($lock, LOCK_EX)) {
                throw new RuntimeException('Impossible de verrouiller le stockage des pièces universitaires.');
            }
            foreach (array_unique($roots) as $directory) {
                if (! mkdir($stage.'/'.$directory, 0700)) {
                    throw new RuntimeException('Impossible de créer le disque temporaire de simulation.');
                }
            }
            foreach ($roots as $disk => $directory) {
                $key = "filesystems.disks.$disk.root";
                $previous[$key] = config($key);
                config([$key => $stage.'/'.$directory]);
                Storage::forgetDisk($disk);
            }
            DB::transaction(function () use ($populate, $stage, $appStorage, $roots, &$published) {
                $populate();
                foreach (array_unique($roots) as $directory) {
                    self::publishDirectory($stage.'/'.$directory, $appStorage.'/'.$directory, $published);
                }
            });
        } catch (Throwable $exception) {
            foreach (array_reverse($published, true) as $path => $isDirectory) {
                if ($isDirectory) {
                    if (! is_link($path) && is_dir($path) && ! (new FilesystemIterator($path))->valid()) {
                        rmdir($path);
                    }
                } else {
                    unlink($path);
                }
            }
            throw $exception;
        } finally {
            config($previous);
            Storage::forgetDisk(array_keys($roots));
            File::deleteDirectory($stage);
            if (is_resource($lock)) {
                fclose($lock);
            }
        }
    }

    /** @param array<string, bool> $published Paths newly created by this transaction. */
    private static function publishDirectory(string $source, string $destination, array &$published): void
    {
        foreach (new FilesystemIterator($source) as $entry) {
            $path = $destination.'/'.$entry->getFilename();
            if ($entry->isLink() || is_link($path)) {
                throw new RuntimeException("Lien symbolique refusé lors de la publication de la pièce : $path");
            }
            if ($entry->isDir()) {
                if (! is_dir($path)) {
                    if (! mkdir($path, $entry->getPerms() & 0777)) {
                        throw new RuntimeException("Impossible de créer le dossier des pièces : $path");
                    }
                    $published[$path] = true;
                }
                self::publishDirectory($entry->getPathname(), $path, $published);
                continue;
            }

            if (! $entry->isFile()) {
                throw new RuntimeException("Pièce source illisible : $path");
            }
            if (file_exists($path)) {
                $digest = is_file($path) ? hash_file('sha256', $path) : false;
                if ($digest !== false && $digest === hash_file('sha256', $entry->getPathname())) {
                    continue;
                }
                throw new RuntimeException("Le stockage contient déjà des pièces différentes à cet emplacement : $path");
            }

            // Exclusive creation protects uploads written concurrently by the application.
            $output = fopen($path, 'xb');
            if ($output === false) {
                throw new RuntimeException("Impossible de créer la pièce : $path");
            }
            $published[$path] = false;
            $input = null;
            try {
                $input = fopen($entry->getPathname(), 'rb');
                if ($input === false || ! chmod($path, $entry->getPerms() & 0777)
                    || stream_copy_to_stream($input, $output) !== $entry->getSize() || ! fflush($output)) {
                    throw new RuntimeException("Impossible de publier la pièce : $path");
                }
            } finally {
                if (is_resource($input)) {
                    fclose($input);
                }
                fclose($output);
            }
        }
    }
}

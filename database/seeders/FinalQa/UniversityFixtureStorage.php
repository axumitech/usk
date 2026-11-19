<?php

namespace Database\Seeders\FinalQa;

use Closure;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Throwable;

/** Stage reversible QA files on the same local volume as the dedicated database. */
final class UniversityFixtureStorage
{
    public static function transaction(Closure $populate): void
    {
        $roots = ['local' => 'private', 'private' => 'private', 'public' => 'public'];
        $appStorage = realpath(storage_path('app'));
        foreach ($roots as $disk => $directory) {
            if (! $appStorage || realpath(config("filesystems.disks.$disk.root")) !== $appStorage.DIRECTORY_SEPARATOR.$directory) {
                throw new RuntimeException('Le stockage des fixtures doit être local au profil QA final.');
            }
        }
        $stage = storage_path('framework/fixtures-'.bin2hex(random_bytes(12)));
        if (! mkdir($stage, 0700)) {
            throw new RuntimeException('Impossible de créer le stockage temporaire de simulation.');
        }
        $previous = [];
        $published = [];
        try {
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
                    $source = $stage.'/'.$directory;
                    foreach (iterator_to_array(new \FilesystemIterator($source)) as $child) {
                        $target = $appStorage.'/'.$directory.'/'.$child->getFilename();
                        if (file_exists($target) || is_link($target) || ! rename($child->getPathname(), $target)) {
                            throw new RuntimeException('Le profil contient déjà des pièces à cet emplacement. Conservez-le et choisissez un nouveau profil.');
                        }
                        $published[$target] = $child->getPathname();
                    }
                }
            });
        } catch (Throwable $exception) {
            foreach (array_reverse($published, true) as $target => $origin) {
                if (! rename($target, $origin)) {
                    throw new RuntimeException('Restauration incomplète des pièces du profil QA final.', previous: $exception);
                }
            }
            throw $exception;
        } finally {
            config($previous);
            Storage::forgetDisk(array_keys($roots));
            File::deleteDirectory($stage);
        }
    }
}


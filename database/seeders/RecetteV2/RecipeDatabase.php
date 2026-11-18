<?php

namespace Database\Seeders\RecetteV2;

use Illuminate\Support\Facades\DB;
use PDO;
use RuntimeException;

final class RecipeDatabase
{
    private const APPLICATION_ID = 1431522098;

    public static function directory(string $project): string
    {
        return getenv('USK_RECETTE_V2_ROOT') ?: $project.'/storage/app/recette-manuelle-v2';
    }

    public static function initialize(string $directory): void
    {
        if (file_exists($directory) || is_link($directory)) {
            self::profile($directory);

            return;
        }

        if (! mkdir($directory, 0700, true)) {
            throw new RuntimeException('Impossible de créer le répertoire SQLite de recette.');
        }

        $token = random_int(1, 2147483647);
        $sqlite = new PDO('sqlite:'.$directory.'/usk-recette-v2.sqlite');
        $sqlite->exec('PRAGMA application_id = '.self::APPLICATION_ID);
        $sqlite->exec('PRAGMA user_version = '.$token);
        $sqlite = null;

        $profileFile = fopen($directory.'/profile.json', 'x');
        if ($profileFile === false) {
            throw new RuntimeException('Impossible de créer le profil privé de recette.');
        }
        fwrite($profileFile, json_encode([
            'token' => $token,
            'app_key' => 'base64:'.base64_encode(random_bytes(32)),
        ], JSON_THROW_ON_ERROR));
        fclose($profileFile);
        chmod($directory.'/profile.json', 0600);
    }

    /** @return array{database: string, app_key: string, token: int} */
    public static function profile(string $directory): array
    {
        $root = realpath($directory);
        $path = $root ? $root.'/usk-recette-v2.sqlite' : '';
        $metadata = $root ? $root.'/profile.json' : '';
        if (! is_file($path) || is_link($path) || ! is_file($metadata) || is_link($metadata)) {
            throw new RuntimeException('Cible de recette inconnue. Choisissez un nouveau répertoire pour l’installation.');
        }

        $profile = json_decode(file_get_contents($metadata), true, 512, JSON_THROW_ON_ERROR);
        if (! is_int($profile['token'] ?? null) || ! is_string($profile['app_key'] ?? null)) {
            throw new RuntimeException('Profil de recette invalide.');
        }

        self::assertIdentity(new PDO('sqlite:'.$path), $profile['token']);

        return ['database' => realpath($path), 'app_key' => $profile['app_key'], 'token' => $profile['token']];
    }

    public static function assertConnection(): int
    {
        if (! app()->environment('local', 'testing') || config('database.default') !== 'sqlite') {
            throw new RuntimeException('Ce seeder exige une base SQLite de recette en local ou testing.');
        }

        $profile = self::profile(self::directory(base_path()));
        $connection = DB::connection();
        if (realpath($connection->getDatabaseName()) !== $profile['database']) {
            throw new RuntimeException('La connexion Laravel ne cible pas la base SQLite de recette.');
        }

        $pdo = $connection->getPdo();
        $databases = $pdo->query('PRAGMA database_list')->fetchAll(PDO::FETCH_ASSOC);
        $main = array_column($databases, 'file', 'name')['main'] ?? '';
        if (realpath($main) !== $profile['database']) {
            throw new RuntimeException('La connexion PDO ne cible pas la base SQLite de recette.');
        }

        self::assertIdentity($pdo, $profile['token']);

        return $profile['token'];
    }

    private static function assertIdentity(PDO $pdo, int $token): void
    {
        if ((int) $pdo->query('PRAGMA application_id')->fetchColumn() !== self::APPLICATION_ID
            || (int) $pdo->query('PRAGMA user_version')->fetchColumn() !== $token) {
            throw new RuntimeException('L’identité de cette base SQLite ne correspond pas au profil de recette.');
        }
    }
}

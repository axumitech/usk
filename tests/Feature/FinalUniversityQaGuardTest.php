<?php

namespace Tests\Feature;

use Database\Seeders\FinalQa\UniversitySimulation;
use Database\Seeders\FinalQa\UniversityFixtureStorage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Symfony\Component\Process\Process;
use Tests\TestCase;

final class FinalUniversityQaGuardTest extends TestCase
{
    public function test_ordinary_application_connection_cannot_run_the_simulation(): void
    {
        $this->expectException(RuntimeException::class);
        app(UniversitySimulation::class)->guard();
    }

    public function test_production_and_unmarked_profiles_are_refused_before_opening_a_database(): void
    {
        $directory = sys_get_temp_dir().DIRECTORY_SEPARATOR.'usk_qa_e2e-test-'.bin2hex(random_bytes(8));
        mkdir($directory, 0700);
        $command = [PHP_BINARY, base_path('docs/qa-e2e-final/scripts/university.php'), 'simulate'];
        try {
            foreach (['production' => 'environnement local', 'local' => 'marqueur QA final'] as $environment => $message) {
                $process = new Process($command, base_path(), ['APP_ENV' => $environment, 'USK_QA_FINAL_ROOT' => $directory]);
                $process->run();
                $this->assertSame(1, $process->getExitCode());
                $this->assertStringContainsString($message, $process->getErrorOutput());
                $this->assertSame(['.', '..'], scandir($directory));
            }
        } finally {
            rmdir($directory);
        }
    }

    public function test_rollback_discards_generated_files_and_preserves_preexisting_storage(): void
    {
        $directory = sys_get_temp_dir().DIRECTORY_SEPARATOR.'usk_qa_e2e-stage-'.bin2hex(random_bytes(8));
        $oldStorage = storage_path();
        mkdir($directory, 0700);
        try {
            foreach (['app/private', 'app/public', 'framework'] as $path) {
                mkdir($directory.'/'.$path, 0700, true);
            }
            $this->app->useStoragePath($directory);
            config(['database.default' => 'qa_stage_test', 'database.connections.qa_stage_test' => ['driver' => 'sqlite', 'database' => ':memory:']]);
            foreach (['local' => 'private', 'private' => 'private', 'public' => 'public'] as $disk => $path) {
                config(["filesystems.disks.$disk.root" => $directory.'/app/'.$path]);
                Storage::forgetDisk($disk);
            }
            DB::statement('CREATE TABLE qa_fixture_writes (id INTEGER)');
            Storage::disk('public')->put('preserve/a.txt', 'previous');
            try {
                UniversityFixtureStorage::transaction(function () {
                    DB::table('qa_fixture_writes')->insert(['id' => 1]);
                    Storage::disk('local')->put('published/a.txt', 'generated');
                    Storage::disk('public')->put('preserve/a.txt', 'collision');
                });
                $this->fail('Un profil contenant une destination préexistante devait être conservé.');
            } catch (RuntimeException $exception) {
                $this->assertStringContainsString('déjà des pièces', $exception->getMessage());
            }
            $this->assertSame(0, DB::table('qa_fixture_writes')->count());
            $this->assertSame('previous', Storage::disk('public')->get('preserve/a.txt'));
            $this->assertFalse(Storage::disk('local')->exists('published/a.txt'));
            $this->assertSame(['.', '..'], scandir($directory.'/framework'));
            UniversityFixtureStorage::transaction(fn () => Storage::disk('local')->put('new/receipt.txt', 'issued'));
            $this->assertSame('issued', Storage::disk('local')->get('new/receipt.txt'));
        } finally {
            $this->app->useStoragePath($oldStorage);
            File::deleteDirectory($directory);
        }
    }
}


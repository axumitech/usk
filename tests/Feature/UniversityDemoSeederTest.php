<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use RuntimeException;
use Tests\TestCase;

class UniversityDemoSeederTest extends TestCase
{
    public function test_default_seed_preserves_existing_data_and_recognizes_the_installed_cohort_in_production(): void
    {
        $directory = sys_get_temp_dir().DIRECTORY_SEPARATOR.'usk-demo-test-'.bin2hex(random_bytes(8));
        mkdir($directory, 0700);
        $path = $directory.'/university.sqlite';
        touch($path);
        try {
            config(['database.default' => 'demo_guard', 'database.connections.demo_guard' => [
                'driver' => 'sqlite', 'database' => $path, 'foreign_key_constraints' => true,
            ]]);
            $this->app->useStoragePath($directory.'/storage');
            foreach (['local' => 'private', 'private' => 'private', 'public' => 'public'] as $disk => $name) {
                config(["filesystems.disks.$disk.root" => storage_path('app/'.$name)]);
            }
            DB::statement('CREATE TABLE academic_audits (action TEXT)');
            DB::statement('CREATE TABLE demo_existing (id INTEGER)');
            DB::table('demo_existing')->insert(['id' => 42]);
            try {
                $this->seed();
                $this->fail('Une base déjà utilisée devait être refusée.');
            } catch (RuntimeException $exception) {
                $this->assertStringContainsString('demo_existing', $exception->getMessage());
            }
            $this->assertFalse(DB::table('academic_audits')->exists());
            DB::table('academic_audits')->insert(['action' => 'university_demo_installed']);
            $this->app->instance('env', 'production');
            $this->artisan('db:seed', ['--force' => true])->assertSuccessful();
            $this->assertSame(1, DB::table('academic_audits')->count());
            $this->assertSame(42, DB::table('demo_existing')->sole()->id);

        } finally {
            DB::purge('demo_guard');
            File::deleteDirectory($directory);
        }
    }
}

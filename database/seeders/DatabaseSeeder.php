<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $connection = DB::connection();
        if ($connection->getDriverName() === 'sqlite' && basename($connection->getDatabaseName()) === 'usk-demo.sqlite') {
            $this->call(UniversityDemoSeeder::class);

            return;
        }

        $this->call([
            RolePermissionSeeder::class,
            LevelCodeSeeder::class,
        ]);
        if (app()->environment(['local', 'testing'])) {
            $this->call(CompleteAcademicYearSeeder::class);
        }
    }
}

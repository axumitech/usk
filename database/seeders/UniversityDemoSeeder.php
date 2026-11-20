<?php

namespace Database\Seeders;

use Database\Seeders\FinalQa\UniversitySimulation;
use Illuminate\Database\Seeder;

final class UniversityDemoSeeder extends Seeder
{
    public function run(UniversitySimulation $university): void
    {
        $university->installDemo();
    }
}

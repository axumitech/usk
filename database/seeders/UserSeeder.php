<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Role;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        // Créer les rôles s'ils n'existent pas
        $roles = ['admin', 'instructor', 'student'];
        foreach ($roles as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        // Admin
        $admin = User::firstOrCreate(
            ['email' => 'admin@usk.test'],
            [
                'first_name' => 'Super',
                'last_name' => 'Admin',
                'password' => Hash::make('password'),
            ]
        );
        $admin->assignRole('admin');

        // Instructor
        $instructor = User::firstOrCreate(
            ['email' => 'instructor@usk.test'],
            [
                'first_name' => 'Prof',
                'last_name' => 'Smith',
                'password' => Hash::make('password'),
            ]
        );
        $instructor->assignRole('instructor');
    }
}

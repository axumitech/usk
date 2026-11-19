<?php

namespace Database\Seeders\RecetteV2;

use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

final class RecipeAccounts
{
    private const DELEGATIONS = [
        'doyen' => ['manage academic access', 'approve academic progression', 'publish official results'],
        'vicedoyen' => ['publish academic content', 'manage academic progression', 'manage academic results', 'deliberate academic results'],
        'appariteur' => ['manage academic access'],
        'finance' => ['manage academic finance'],
    ];

    /** @return array<string, User> */
    public function create(): array
    {
        app(RolePermissionSeeder::class)->run();
        $adminRole = Role::findByName('admin');
        $institutionalPermissions = $adminRole->permissions->pluck('name')
            ->merge(Permission::where('name', 'like', '% academic %')->pluck('name'))
            ->merge(['manage official documents', 'approve official documents', 'issue official documents', 'publish official results'])
            ->unique()->all();

        // The same admin role admits institutional and faculty staff to the back office.
        // Only the institution account receives the full set of administrative permissions.
        $adminRole->syncPermissions(['view dashboard']);
        $users = [
            'admin' => $this->account('admin', 'Administration', 'Institution', 'admin'),
            'superadmin' => $this->account('superadmin', 'Super-administration', 'Institution', 'super-admin'),
        ];
        $users['admin']->givePermissionTo($institutionalPermissions);

        foreach (['med' => 'Médecine', 'droit' => 'Droit'] as $code => $name) {
            foreach (self::DELEGATIONS as $key => $permissions) {
                $user = $this->account("$key.$code", ucfirst($key), $name, 'admin');
                $user->givePermissionTo($permissions);
                $users["$key.$code"] = $user;
            }

            $users["professeur.$code"] = $this->account("professeur.$code", 'Professeur', $name, 'professor');
            $users["candidat.$code"] = $this->account("candidat.$code", 'Candidat', $name, 'user');
            $users["candidat.$code"]->assignRole('candidate');

            foreach (range(1, $code === 'med' ? 3 : 4) as $number) {
                $key = 'etudiant.'.$code.($number === 1 ? '' : $number);
                // Admission and financial confirmation grant the student role when eligible.
                $users[$key] = $this->account($key, 'Étudiant '.$number, $name, 'user');
            }
        }

        return $users;
    }

    public function delegate(array $users, array $faculties): void
    {
        foreach ($faculties as $code => $faculty) {
            foreach (array_keys(self::DELEGATIONS) as $role) {
                $users["$role.$code"]->academicFaculties()->attach($faculty->getKey());
            }
        }
    }

    private function account(string $key, string $firstName, string $lastName, string $role): User
    {
        $user = User::factory()->create([
            'first_name' => $firstName,
            'last_name' => $lastName.' Recette',
            'email' => "$key@usk.test",
            'nationality_code' => 'CD',
        ]);
        $user->assignRole($role);

        return $user;
    }
}

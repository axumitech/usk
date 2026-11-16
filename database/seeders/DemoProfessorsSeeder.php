<?php

namespace Database\Seeders;

use App\Models\Professor;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Role;

class DemoProfessorsSeeder extends Seeder
{
    public function run(): void
    {
        // Fictional demonstration profiles. No affiliation with real professors is claimed.
        // Reserved .test addresses prevent the use of real contact information.
        $profiles = [
            ['Jean-Pierre', 'Kabeya Mukendi', 'jean-pierre.kabeya', 'Anatomie humaine et histologie', 'Médecine'],
            ['Marie-Claire', 'Ilunga Kasongo', 'marie-claire.ilunga', 'Physiologie et biochimie médicales', 'Médecine'],
            ['Patrick', 'Mbuyi Tshibangu', 'patrick.mbuyi', 'Microbiologie et immunologie', 'Médecine'],
            ['Grâce', 'Lukusa Mpoyi', 'grace.lukusa', 'Sémiologie et pharmacologie', 'Médecine'],
            ['André', 'Kanku Mutombo', 'andre.kanku', 'Épidémiologie et biostatistique', 'Santé publique'],
            ['Chantal', 'Mbala Nsimba', 'chantal.mbala', 'Santé communautaire et promotion de la santé', 'Santé publique'],
            ['Olivier', 'Kikunda Mulumba', 'olivier.kikunda', 'Santé environnementale et assainissement', 'Santé publique'],
            ['Esther', 'Nzuzi Makiese', 'esther.nzuzi', 'Politiques et management des systèmes de santé', 'Santé publique'],
            ['Joseph', 'Lutete Mavungu', 'joseph.lutete', 'Sociologie et méthodes de recherche', 'Sciences sociales, politiques et administratives'],
            ['Béatrice', 'Kabasele Tshimanga', 'beatrice.kabasele', 'Science politique et gouvernance', 'Sciences sociales, politiques et administratives'],
            ['Emmanuel', 'Bolamba Lokondo', 'emmanuel.bolamba', 'Administration publique et décentralisation', 'Sciences sociales, politiques et administratives'],
            ['Nadine', 'Moke Bokolo', 'nadine.moke', 'Relations internationales et développement', 'Sciences sociales, politiques et administratives'],
            ['François', 'Mukeba Kalala', 'francois.mukeba', 'Droit civil et droit des obligations', 'Droit'],
            ['Anne', 'Mbemba Kintoko', 'anne.mbemba', 'Droit constitutionnel et droit administratif', 'Droit'],
            ['David', 'Tshilombo Banza', 'david.tshilombo', 'Droit pénal et procédure pénale', 'Droit'],
            ['Rose', 'Kambale Muhindo', 'rose.kambale', 'Droit des affaires et droit OHADA', 'Droit'],
            ['Samuel', 'Nsakala Lufungula', 'samuel.nsakala', 'Études bibliques et exégèse', 'Théologie'],
            ['Élisabeth', 'Nkulu Kitambala', 'elisabeth.nkulu', 'Théologie systématique et éthique chrétienne', 'Théologie'],
            ['Paul', 'Mavinga Kiala', 'paul.mavinga', 'Histoire du christianisme et théologie africaine', 'Théologie'],
            ['Judith', 'Bisimwa Ngalula', 'judith.bisimwa', 'Théologie pratique et accompagnement pastoral', 'Théologie'],
        ];

        DB::transaction(function () use ($profiles) {
            $accountRole = null;
            if (app()->environment(['local', 'testing'])) {
                $accountRole = Role::where(['name' => 'professor', 'guard_name' => 'web'])->first();
                if (! $accountRole) {
                    $this->call(RolePermissionSeeder::class);
                    $accountRole = Role::findByName('professor', 'web');
                }
            }

            foreach ($profiles as [$firstName, $lastName, $slug, $speciality, $faculty]) {
                $email = $slug.'@enseignants.example.test';
                $professor = Professor::whereRaw('LOWER(email) = ?', [$email])->lockForUpdate()->first();
                if (! $professor) {
                    if (Professor::where(['first_name' => $firstName, 'last_name' => $lastName])->exists()) {
                        continue;
                    }

                    $professor = Professor::create([
                        'first_name' => $firstName, 'last_name' => $lastName, 'email' => $email,
                        'speciality' => $speciality, 'is_active' => true,
                        'biography' => "Profil fictif de démonstration — {$faculty}. Spécialité proposée : {$speciality}. Identité et coordonnées à remplacer par celles d’un enseignant réel.",
                    ]);
                }

                if (! $accountRole || ! $professor->is_active || $professor->user_id || User::whereRaw('LOWER(email) = ?', [$email])->exists()) {
                    continue;
                }

                $user = User::create([
                    'first_name' => $professor->first_name,
                    'last_name' => $professor->last_name,
                    'email' => $email,
                    'password' => 'password',
                ]);
                $user->markEmailAsVerified();
                $user->assignRole($accountRole);
                $professor->forceFill(['user_id' => $user->id, 'invitation_hash' => null, 'invitation_expires_at' => null])->save();
            }
        }, 3);
    }
}

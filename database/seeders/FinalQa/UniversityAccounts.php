<?php

namespace Database\Seeders\FinalQa;

use App\Models\AcademicStructure\AcademicDepartment;
use App\Models\Faculty;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

final class UniversityAccounts
{
    private string $passwordHash;

    public function __construct(string $password)
    {
        $this->passwordHash = Hash::make($password);
    }

    public function create(string $key, string $firstName, string $lastName, string $role, string $gender = 'male'): User
    {
        $user = User::forceCreate(['first_name' => $firstName, 'last_name' => $lastName, 'gender' => $gender,
            'nationality_code' => 'CD', 'email' => $key.'@usk.test', 'email_verified_at' => now(), 'password' => $this->passwordHash]);
        $user->assignRole($role);

        return $user;
    }

    public function facultyStaff(string $key, Faculty $faculty): void
    {
        $staffRoles = [
            'dean' => ['Augustin', 'male'], 'vice-dean' => ['Béatrice', 'female'],
            'registrar' => ['Clément', 'male'], 'admissions-officer' => ['Francine', 'female'],
            'finance-officer' => ['Pascal', 'male'],
        ];
        $surnames = [
            'dr' => ['Lukusa', 'Kabongo', 'Mulumba', 'Makiese', 'Mabiala'],
            'med' => ['Kanku', 'Musau', 'Mbuyamba', 'Luzolo', 'Nkulu'],
            'sp' => ['Katende', 'Ngoy', 'Lutumba', 'Banza', 'Nsenga'],
            'sspa' => ['Kabeya', 'Kambale', 'Malemba', 'Tshilombo', 'Mayamba'],
            'theo' => ['Mbala', 'Kasongo', 'Nlandu', 'Mwanza', 'Tshibanda'],
        ];
        foreach (array_keys($staffRoles) as $index => $role) {
            [$name, $gender] = $staffRoles[$role];
            $staff = $this->create($role.'.'.$key, $name, $surnames[$key][$index], $role, $gender);
            $staff->academicFaculties()->attach($faculty->id);
        }
    }

    public function departmentStaff(string $key, AcademicDepartment $department): User
    {
        $identities = [
            'dpu' => ['Félix', 'Kisimba', 'Cécile', 'Kalonji'], 'dpr' => ['Mathieu', 'Bofala', 'Thérèse', 'Mubenga'],
            'scl' => ['Jacques', 'Yamba', 'Patricia', 'Mukendi'], 'sbm' => ['Éric', 'Lusamba', 'Mireille', 'Lubaki'],
            'epi' => ['Jean', 'Katumba', 'Esther', 'Kasongo'], 'sco' => ['Amos', 'Ilunga', 'Grâce', 'Mpoyi'],
            'soc' => ['André', 'Kabasele', 'Ruth', 'Mbayo'], 'adm' => ['Aimé', 'Lukau', 'Sylvie', 'Kitenge'],
            'the' => ['Benoît', 'Ngandu', 'Carine', 'Kambale'], 'rel' => ['Simon', 'Mbuyi', 'Solange', 'Muteba'],
        ];
        [$headName, $headSurname, $teacherName, $teacherSurname] = $identities[$key];
        $head = $this->create('department-head.'.$key, $headName, $headSurname, 'department-head');
        DB::table('department_staff')->insert(['user_id' => $head->id, 'department_id' => $department->id]);

        return $this->create('professeur.'.$key, $teacherName, $teacherSurname, 'professor', 'female');
    }

    public function student(string $key, int $departmentIndex, int $position): User
    {
        $names = ['Espoir', 'Grâce', 'Patrick', 'Esther', 'David', 'Sarah', 'Jonathan', 'Déborah', 'Christian', 'Ruth',
            'Nathan', 'Chantal', 'Moïse', 'Rachel', 'Junior', 'Noëlla', 'Michel', 'Marie', 'Josué', 'Hélène'];
        $surnames = ['Mulela', 'Kabeya', 'Tshibangu', 'Ilunga', 'Mbala', 'Mukendi', 'Kanku', 'Mbuyi', 'Kalonji', 'Tshimanga',
            'Lisanga', 'Lukusa', 'Malamba', 'Katende', 'Lubaki', 'Kasongo', 'Masengo', 'Lukoki', 'Banza', 'Ngoy'];
        $lastName = $surnames[($position + $departmentIndex) % count($surnames)];

        return $this->create(sprintf('etudiant.%s.%02d', $key, $position + 1), $names[$position], $lastName, 'user', $position % 2 === 0 ? 'male' : 'female');
    }
}

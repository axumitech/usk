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
        foreach (['dean', 'vice-dean', 'registrar', 'admissions-officer', 'finance-officer'] as $role) {
            $staff = $this->create($role.'.'.$key, 'Agent fictif', $faculty->name, $role);
            $staff->academicFaculties()->attach($faculty->id);
        }
    }

    public function departmentStaff(string $key, AcademicDepartment $department): void
    {
        $head = $this->create('department-head.'.$key, 'Responsable fictif', $department->name, 'department-head');
        DB::table('department_staff')->insert(['user_id' => $head->id, 'department_id' => $department->id]);
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


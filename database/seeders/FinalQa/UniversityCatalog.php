<?php

namespace Database\Seeders\FinalQa;

use App\Models\AdmissionCondition;
use App\Models\Courses;
use App\Models\Faculty;
use App\Models\Level;
use App\Models\Professor;
use App\Models\Student\AcademicRoom;
use App\Models\User;
use App\Modules\AcademicStructure\Application\Services\StructureService;
use Database\Seeders\RecetteV2\AcademicCatalogFixtures;

final class UniversityCatalog
{
    public const REASON = 'Simulation universitaire locale USK. Identités, parcours, barèmes et décisions fictifs sans valeur officielle.';

    public const FACULTIES = [
        'dr' => ['Droit', ['dpu' => ['Droit public', 'LIC'], 'dpr' => ['Droit privé', 'LIC']]],
        'med' => ['Médecine humaine', ['scl' => ['Sciences cliniques', 'MED'], 'sbm' => ['Sciences biomédicales', 'MED']]],
        'sp' => ['Santé publique', ['epi' => ['Épidémiologie', 'LIC'], 'sco' => ['Santé communautaire', 'MAS']]],
        'sspa' => ['Sciences sociales, politiques et administratives', ['soc' => ['Sociologie', 'LIC'], 'adm' => ['Administration publique', 'MAS']]],
        'theo' => ['Théologie', ['the' => ['Études théologiques', 'LIC'], 'rel' => ['Sciences des religions', 'DOC']]],
    ];

    public const CYCLES = [
        'LIC' => ['Licence', ['L1', 'L2', 'L3']],
        'MAS' => ['Master', ['M1', 'M2']],
        'DOC' => ['Doctorat', ['D1', 'D2', 'D3']],
        'MED' => ['Formation médicale témoin', ['MED1', 'MED2', 'MED3']],
    ];

    public function create(User $admin, UniversityAccounts $accounts): array
    {
        $service = app(StructureService::class);
        $base = ['is_active' => true, 'revision' => 0, 'reason' => self::REASON];
        $institution = $service->save('university', $base + ['code' => 'USK-QA', 'name' => 'Université fictive de recette USK', 'acronym' => 'USK QA'], $admin);
        $cycles = [];
        foreach (self::CYCLES as $code => [$name, $levels]) {
            $cycles[$code] = $service->save('cycle', $base + ['code' => $code, 'name' => $name.' — simulation',
                'normal_duration' => count($levels), 'progression_mode' => 'annual', 'weighting_mode' => 'credits',
                'periods' => [['code' => 'AN', 'name' => 'Année universitaire fictive']]], $admin);
        }
        $catalog = ['university' => $institution, 'programs' => [], 'teaching_semester' => ['past' => 2, 'current' => 1]];
        foreach (self::FACULTIES as $facultyCode => [$facultyName, $departments]) {
            $faculty = Faculty::create(['code' => strtoupper($facultyCode), 'name' => $facultyName, 'is_active' => true]);
            $service->save('faculty-context', $base, $admin, $faculty->id);
            $accounts->facultyStaff($facultyCode, $faculty);
            foreach ($departments as $key => [$name, $cycleCode]) {
                $department = $service->save('department', $base + ['faculty_id' => $faculty->id, 'code' => strtoupper($key), 'name' => $name], $admin);
                $accounts->departmentStaff($key, $department);
                [$cycleName, $labels] = self::CYCLES[$cycleCode];
                foreach ($labels as $position => $label) {
                    $level = Level::create(['faculty_id' => $faculty->id, 'code' => strtoupper($key).'-'.$label, 'title' => $label.' — '.$name, 'is_active' => true]);
                    $level->departmentOptions()->attach($department->id);
                    AdmissionCondition::create(['faculty_id' => $faculty->id, 'level_id' => $level->id, 'title' => 'Diplôme ou titre équivalent fictif',
                        'section' => 'academic_info', 'is_required' => true, 'description' => self::REASON]);
                    $catalog['levels'][$key][$label] = $level;
                    foreach (['Fondements', 'Pratique'] as $index => $theme) {
                        $catalog['courses'][$key][$label][] = Courses::forceCreate(['level_id' => $level->id, 'code' => strtoupper($key).'-'.$label.'-'.($index + 1),
                            'title' => $theme.' de '.$name.' — '.$label, 'semester' => 1, 'credits' => 5, 'cmi_hours' => 20, 'td_hours' => 10,
                            'tp_hours' => 0, 'catalog_status' => 'active']);
                    }
                }
                $program = $service->save('program', $base + ['faculty_id' => $faculty->id, 'academic_department_id' => $department->id, 'academic_cycle_id' => $cycles[$cycleCode]->id,
                    'code' => 'QA-'.strtoupper($key), 'name' => $cycleName.' — '.$name, 'degree' => $cycleName.' de simulation',
                    'normal_duration' => count($labels), 'level_ids' => array_map(fn ($level) => $level->id, array_values($catalog['levels'][$key]))], $admin);
                $teacher = $accounts->create('professeur.'.$key, 'Professeur', $name, 'professor');
                $catalog['professors'][$key] = Professor::forceCreate(['user_id' => $teacher->id, 'email' => $teacher->email, 'first_name' => $teacher->first_name,
                    'last_name' => $teacher->last_name, 'is_active' => true, 'speciality' => $name]);
                $catalog['rooms'][$key] = AcademicRoom::create(['university_id' => $institution->id, 'code' => strtoupper($key),
                    'name' => 'Auditoire '.$name, 'campus' => 'Campus fictif', 'building' => 'Bâtiment '.$facultyName,
                    'capacity' => 30, 'type' => 'classroom', 'is_active' => true]);
                $catalog['faculties'][$key] = $faculty;
                $catalog['departments'][$key] = $department;
                $catalog['programs'][$key] = $program;
                $catalog['faculty_codes'][$key] = $facultyCode;
            }
        }

        return $catalog;
    }

    public function startYear(array $catalog, User $admin, string $phase): array
    {
        $fixtures = app(AcademicCatalogFixtures::class);
        $start = $phase === 'past' ? 2025 : 2026;
        $end = $start + 1;
        $year = $fixtures->year($catalog['university'], "$start-$end", "$start-10-01", "$end-09-30", $admin);
        $catalog[$phase.'_year'] = $year;
        foreach ([1 => ["$start-10-01", "$end-03-31"], 2 => ["$end-04-01", "$end-09-30"]] as $number => [$from, $to]) {
            \App\Models\Student\AcademicSemester::firstOrCreate(['academic_year_id' => $year->id, 'number' => $number], ['start_date' => $from, 'end_date' => $to]);
        }

        return $fixtures->annual($catalog, $phase, $admin);
    }
}


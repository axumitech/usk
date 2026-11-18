<?php

namespace Database\Seeders\RecetteV2;

use App\Models\AcademicCalendarEvent;
use App\Models\AcademicStructure\AcademicCycle;
use App\Models\AcademicStructure\AcademicDepartment;
use App\Models\AcademicStructure\AcademicProgram;
use App\Models\AcademicStructure\AcademicPromotion;
use App\Models\AcademicStructure\AdmissionCampaign;
use App\Models\AcademicStructure\AdmissionCohort;
use App\Models\AcademicStructure\CurriculumVersion;
use App\Models\AcademicStructure\University;
use App\Models\AcademicYear;
use App\Models\AdmissionCondition;
use App\Models\Classes;
use App\Models\Courses;
use App\Models\Faculty;
use App\Models\Intake;
use App\Models\Level;
use App\Models\Professor;
use App\Models\Student\AcademicOffering;
use App\Models\Student\AcademicRoom;
use App\Models\Student\AcademicSemester;
use App\Models\Student\AccessRule;
use App\Models\User;
use App\Modules\AcademicStructure\Application\Services\AnnualProgramPreparation;
use App\Modules\AcademicStructure\Application\Services\CurriculumService;
use App\Modules\AcademicStructure\Application\Services\StructureService;
use App\Modules\AcademicYear\Application\UseCases\CreateAcademicYear;
use App\Modules\AcademicYear\Application\UseCases\OpenAcademicYear;
use App\Modules\Assessment\Application\AssessmentWorkflow;
use App\Modules\Documents\Application\DocumentPdf;
use App\Modules\Student\Application\Services\Audit;
use App\Modules\Teaching\Application\Services\LearningContent;
use App\Modules\Teaching\Application\Services\ScheduleService;
use App\Modules\Teaching\Application\Services\TeacherAnnouncementPublisher;
use App\Modules\Teaching\Application\Services\TeachingOfferingService;
use App\Modules\Teaching\Application\Services\TeachingTeam;
use Carbon\CarbonImmutable;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/** Academic fixtures only; the enclosing recette seeder checks the isolated database. */
final class AcademicCatalogFixtures
{
    private const REASON = 'Données exclusivement fictives de recette V2 ; aucun règlement officiel.';

    /** All returned entities are models. Offerings/items/courses have two entries per level. */
    public function past(array $users): array
    {
        $admin = $users['admin'];
        $structure = app(StructureService::class);
        $common = ['revision' => 0, 'is_active' => true, 'reason' => self::REASON];
        $institution = University::where('context_key', 'current')->first();
        if ($institution && $institution->code !== 'RECETTE-V2') {
            throw new RuntimeException('Le catalogue de recette ne remplace pas un établissement existant.');
        }
        $institution ??= $structure->save('university', $common + [
            'code' => 'RECETTE-V2', 'name' => 'Université fictive USK — Recette V2', 'acronym' => 'USK TEST',
        ], $admin);
        $cycle = AcademicCycle::where('university_id', $institution->id)->where('code', 'REC-LICENCE')->first()
            ?? $structure->save('cycle', $common + [
                'code' => 'REC-LICENCE', 'name' => 'Licence — Règles fictives', 'normal_duration' => 3,
                'progression_mode' => 'annual', 'weighting_mode' => 'credits',
                'periods' => [['code' => 'AN', 'name' => 'Période annuelle fictive']],
            ], $admin);
        $catalog = ['university' => $institution, 'cycle' => $cycle];

        foreach (['med' => 'Médecine', 'droit' => 'Droit'] as $key => $name) {
            $code = $key === 'med' ? 'MED' : 'DR';
            $faculty = Faculty::firstOrCreate(['code' => 'REC'.$code], ['name' => 'Faculté de '.$name.' — Recette', 'is_active' => true]);
            if ($faculty->university_id === null) {
                $structure->save('faculty-context', $common, $admin, $faculty->id);
                $faculty->refresh();
            }
            $department = AcademicDepartment::where('faculty_id', $faculty->id)->where('code', 'RV2-BASE')->first()
                ?? $structure->save('department', $common + ['faculty_id' => $faculty->id, 'code' => 'RV2-BASE', 'name' => 'Études fondamentales — '.$name], $admin);
            $levelIds = [];
            foreach (['L1' => 1, 'L2' => 2] as $levelKey => $position) {
                $level = Level::firstOrCreate(['faculty_id' => $faculty->id, 'code' => $code.'-'.$levelKey], [
                    'title' => 'Licence '.$position.' — '.$name.' — Recette', 'is_active' => true,
                ]);
                $level->departmentOptions()->syncWithoutDetaching([$department->id]);
                AdmissionCondition::firstOrCreate(['faculty_id' => $faculty->id, 'level_id' => $level->id, 'title' => 'Diplôme ou titre équivalent fictif'], [
                    'section' => 'academic_info', 'is_required' => true, 'description' => 'Exigence documentaire fictive pour la recette.',
                ]);
                $catalog['levels'][$key][$levelKey] = $level;
                $levelIds[] = $level->id;
                foreach ([1, 2] as $number) {
                    $courseCode = $code.'-'.$position.'0'.$number;
                    $course = Courses::where('level_id', $level->id)->where('code', $courseCode)->first();
                    if (! $course) {
                        $course = (new Courses)->forceFill([
                            'level_id' => $level->id, 'code' => $courseCode, 'title' => ($number === 1 ? 'Fondements' : 'Applications').' de '.$name.' '.$levelKey.' — Recette',
                            'semester' => 1, 'credits' => 5, 'cmi_hours' => 20, 'td_hours' => 10, 'tp_hours' => 0, 'catalog_status' => 'active',
                        ]);
                        $course->save();
                    }
                    $catalog['courses'][$key][$levelKey][] = $course;
                }
            }
            $program = AcademicProgram::where('faculty_id', $faculty->id)->where('code', 'RV2-'.$code.'-LIC')->first()
                ?? $structure->save('program', $common + [
                    'faculty_id' => $faculty->id, 'academic_department_id' => $department->id, 'academic_cycle_id' => $cycle->id,
                    'code' => 'RV2-'.$code.'-LIC', 'name' => 'Licence en '.$name.' — Recette', 'degree' => 'Licence fictive',
                    'normal_duration' => 3, 'level_ids' => $levelIds,
                ], $admin);
            $teacherUser = $users['professeur.'.$key];
            $professor = Professor::where('user_id', $teacherUser->id)->first();
            if (! $professor) {
                $portrait = 'professors/recette-v2-'.$key.'.png';
                if (! Storage::disk('public')->exists($portrait)) {
                    Storage::disk('public')->put($portrait, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+pBp0AAAAASUVORK5CYII='));
                }
                $professor = (new Professor)->forceFill([
                    'user_id' => $teacherUser->id, 'email' => $teacherUser->email, 'first_name' => $teacherUser->first_name,
                    'last_name' => $teacherUser->last_name, 'is_active' => true,
                    'photo' => $portrait, 'speciality' => $name.' — Recette',
                ]);
                $professor->save();
            }
            $catalog['faculties'][$key] = $faculty;
            $catalog['departments'][$key] = $department;
            $catalog['programs'][$key] = $program;
            $catalog['professors'][$key] = $professor;
            $catalog['rooms'][$key] = AcademicRoom::firstOrCreate(['university_id' => $institution->id, 'code' => 'RV2-'.$code], [
                'name' => 'Auditoire fictif '.$key, 'campus' => 'Recette', 'building' => 'Bâtiment fictif',
                'capacity' => 30, 'type' => 'classroom', 'is_active' => true,
            ]);
        }
        $catalog['past_year'] = $this->year($institution, '2025-2026', '2025-10-01', '2026-09-30', $admin);

        return $this->annual($catalog, 'past', $admin);
    }

    /** The orchestrator closes the previous year after its official results are published. */
    public function current(array $catalog, array $users): array
    {
        if ($catalog['past_year']->fresh()->status !== 'closed') {
            throw new RuntimeException('Clôturez l’année passée avant de créer et ouvrir l’année actuelle de recette.');
        }
        AdmissionCampaign::where('academic_year_id', $catalog['past_year']->id)
            ->whereIn('academic_program_id', collect($catalog['programs'])->pluck('id'))->where('is_open', true)->get()
            ->each(function (AdmissionCampaign $campaign) use ($users): void {
                $campaign->update(['is_open' => false]);
                Audit::record($users['admin']->id, 'admission_campaign_updated', $campaign, self::REASON);
            });
        $catalog['current_year'] = $this->year($catalog['university'], '2026-2027', '2026-10-01', '2027-09-30', $users['admin']);

        return $this->annual($catalog, 'current', $users['admin']);
    }

    /** Called after current enrollments and explicit course registrations exist. */
    public function content(array $catalog, array $users): array
    {
        foreach (['med', 'droit'] as $key) {
            $teacher = $users['professeur.'.$key];
            $levelKey = $key === 'med' ? 'L2' : 'L1';
            $offer = $catalog['offerings']['current'][$key][$levelKey][0];
            $materialTitle = 'Support fictif de '.$offer->course->title;
            $material = $offer->resources()->where('kind', 'material')->where('title', $materialTitle)->first();
            if (! $material) {
                $pdf = app(DocumentPdf::class)->render('<h1>Support de recette fictif</h1><p>Document de démonstration sans valeur universitaire.</p>');
                $material = app(LearningContent::class)->create($offer, $teacher, [
                    'kind' => 'material', 'title' => $materialTitle, 'body' => 'Lecture et téléchargement privés pour les étudiants inscrits à cette offre.',
                    'publish' => true, 'notify' => false, 'operation_key' => (string) Str::uuid(), 'reason' => self::REASON,
                ], UploadedFile::fake()->createWithContent('support-recette.pdf', $pdf));
            }
            $announcementTitle = 'Bienvenue dans le cours — Recette '.$key;
            $announcement = $offer->resources()->where('kind', 'announcement')->where('title', $announcementTitle)->first();
            if (! $announcement) {
                $announcement = app(TeacherAnnouncementPublisher::class)->publish($teacher, [
                    'offering_id' => $offer->id, 'title' => $announcementTitle,
                    'body' => 'Annonce fictive réservée aux étudiants inscrits dans ce cours et cette faculté.',
                    'operation_key' => (string) Str::uuid(),
                ])['announcement'];
            }
            $assessmentTitle = 'Devoir actuel fictif — '.$key;
            $work = $offer->resources()->where('title', $assessmentTitle)->whereHas('assessment')->first();
            $workflow = app(AssessmentWorkflow::class);
            if (! $work) {
                $opens = CarbonImmutable::now('Africa/Kinshasa')->subDay()->max(CarbonImmutable::parse('2026-10-02', 'Africa/Kinshasa'));
                $closes = $opens->addDays(21)->min(CarbonImmutable::parse('2027-09-29', 'Africa/Kinshasa'));
                $work = $workflow->draft($offer, $teacher, [
                    'title' => $assessmentTitle, 'body' => 'Expliquez les notions du support. Travail entièrement fictif.',
                    'category' => 'practical', 'session_code' => 'ordinaire', 'modality' => 'submission',
                    'opens_at' => $opens->toIso8601String(), 'closes_at' => $closes->toIso8601String(),
                    'maximum_points' => '20', 'attempt_limit' => 2, 'late_minutes' => 30,
                    'group_work' => false, 'feedback_policy' => 'validated',
                ]);
            }
            if ($work->assessment->state === 'draft') {
                $workflow->lifecycle($work, $teacher, [
                    'action' => 'publish', 'revision' => $work->assessment->revision, 'notify' => false, 'reason' => self::REASON,
                ]);
            }
            $catalog['materials'][$key] = $material;
            $catalog['announcements'][$key] = $announcement;
            $catalog['current_assessments'][$key] = $work->fresh();
        }

        return $catalog;
    }

    private function year(University $institution, string $title, string $start, string $end, User $admin): AcademicYear
    {
        $year = AcademicYear::where('title', $title)->first();
        if (! $year) {
            $created = app(CreateAcademicYear::class)->execute($title, $start, $end);
            $year = AcademicYear::findOrFail($created->id());
            app(StructureService::class)->save('year-context', ['reason' => self::REASON], $admin, $year->id);
        }
        if ((int) $year->fresh()->university_id !== (int) $institution->id) {
            throw new RuntimeException('Cette année ne relève pas de l’établissement fictif.');
        }
        if ($year->status === 'draft') {
            app(OpenAcademicYear::class)->execute($year->id, $admin->id);
        }

        return $year->fresh();
    }

    private function annual(array $catalog, string $scope, User $admin): array
    {
        $year = $catalog[$scope.'_year'];
        $semester = AcademicSemester::firstOrCreate(['academic_year_id' => $year->id, 'number' => 1], ['start_date' => $year->start_date, 'end_date' => $year->end_date]);
        $catalog['semesters'][$scope] = $semester;
        foreach (['med', 'droit'] as $facultyKey) {
            $program = $catalog['programs'][$facultyKey];
            app(AnnualProgramPreparation::class)->ensureAdmissionCohort($program, $year, $admin->id);
            $catalog['cohorts'][$scope][$facultyKey] = AdmissionCohort::where('academic_program_id', $program->id)->where('academic_year_id', $year->id)->sole();
            $version = $this->curriculum($catalog, $scope, $facultyKey, $admin);
            $catalog['versions'][$scope][$facultyKey] = $version;
            foreach (['L1', 'L2'] as $levelKey) {
                $level = $catalog['levels'][$facultyKey][$levelKey];
                $promotion = AcademicPromotion::firstOrCreate(['academic_program_id' => $program->id, 'academic_year_id' => $year->id, 'level_id' => $level->id], [
                    'code' => 'RV2-'.$year->id.'-'.$level->id, 'name' => 'Promotion fictive '.$year->title.' '.$level->title, 'is_active' => true,
                ]);
                $group = Classes::where('academic_promotion_id', $promotion->id)->first();
                if (! $group) {
                    $intake = Intake::firstOrCreate(['name' => 'Recette '.$facultyKey.' '.$levelKey.' '.$year->title.' A']);
                    $group = Classes::create(['faculty_id' => $level->faculty_id, 'level_id' => $level->id, 'intake_id' => $intake->id, 'status' => 'OPEN', 'capacity' => 30]);
                    app(StructureService::class)->save('group-promotion', ['academic_promotion_id' => $promotion->id, 'reason' => self::REASON], $admin, $group->id);
                    $group->refresh();
                }
                $catalog['promotions'][$scope][$facultyKey][$levelKey] = $promotion;
                $catalog['groups'][$scope][$facultyKey][$levelKey] = $group;
                AdmissionCampaign::firstOrCreate(['academic_program_id' => $program->id, 'academic_year_id' => $year->id, 'level_id' => $level->id], ['is_open' => true, 'additional_documents' => []]);
                $items = $version->units()->where('level_id', $level->id)->sole()->items()->orderBy('position')->get();
                foreach ($items as $index => $item) {
                    $offer = AcademicOffering::where('academic_year_id', $year->id)->where('curriculum_item_id', $item->id)->where('class_id', $group->id)->first();
                    if (! $offer) {
                        $offer = app(TeachingOfferingService::class)->create($admin, [
                            'academic_year_id' => $year->id, 'curriculum_item_id' => $item->id, 'class_id' => $group->id,
                            'academic_semester_id' => $semester->id, 'reason' => self::REASON,
                        ]);
                        app(TeachingTeam::class)->change($offer, $admin, [
                            'professor_id' => $catalog['professors'][$facultyKey]->id, 'role' => 'lead', 'action' => 'assign', 'reason' => self::REASON,
                        ]);
                        app(TeachingOfferingService::class)->transition($offer->fresh(), $admin, 'publish', self::REASON);
                    }
                    $catalog['items'][$scope][$facultyKey][$levelKey][$index] = $item;
                    $catalog['offerings'][$scope][$facultyKey][$levelKey][$index] = $offer->fresh();
                    if (! $offer->sessions()->exists()) {
                        $day = $scope === 'past' ? ($facultyKey === 'med' ? '2026-05-11' : '2026-05-12') : ($facultyKey === 'med' ? '2026-11-23' : '2026-11-24');
                        $hour = 9 + ($levelKey === 'L2' ? 4 : 0) + $index * 2;
                        app(ScheduleService::class)->save([
                            'academic_offering_id' => $offer->id, 'starts_at' => sprintf('%sT%02d:00', $day, $hour),
                            'ends_at' => sprintf('%sT%02d:00', $day, $hour + 1), 'room' => 'Auditoire fictif '.$facultyKey,
                            'academic_room_id' => $catalog['rooms'][$facultyKey]->id,
                            'repeat_count' => 1, 'is_published' => true,
                        ], $admin->id);
                    }
                }
                foreach (['courses_view', 'materials_download', 'assignments_submit', 'evaluations_participate', 'results_view', 'documents_request'] as $feature) {
                    AccessRule::firstOrCreate(['academic_year_id' => $year->id, 'level_id' => $level->id, 'feature' => $feature], [
                        'mode' => 'open', 'is_active' => true, 'allow_exemption' => true, 'regulation_reference' => self::REASON,
                    ]);
                }
            }
        }
        AcademicCalendarEvent::firstOrCreate(['academic_year_id' => $year->id, 'title' => 'Examens fictifs de recette '.$year->title], [
            'category' => 'exam', 'start_date' => $scope === 'past' ? '2026-05-15' : '2027-05-15',
            'end_date' => $scope === 'past' ? '2026-06-15' : '2027-06-15', 'description' => self::REASON,
        ]);

        return $catalog;
    }

    private function curriculum(array $catalog, string $scope, string $facultyKey, User $admin): CurriculumVersion
    {
        $year = $catalog[$scope.'_year'];
        $program = $catalog['programs'][$facultyKey];
        $service = app(CurriculumService::class);
        $version = CurriculumVersion::where('academic_program_id', $program->id)->where('academic_year_id', $year->id)->first()
            ?? $service->draft(['academic_program_id' => $program->id, 'academic_year_id' => $year->id,
                'code' => 'RV2-'.$year->id, 'name' => 'Maquette fictive '.$program->name.' '.$year->title, 'reason' => self::REASON], $admin);
        if ($version->status === 'published') {
            return $version;
        }
        if ($version->status === 'draft') {
            $units = [];
            foreach (['L1', 'L2'] as $levelKey) {
                $units[] = ['level_id' => $catalog['levels'][$facultyKey][$levelKey]->id, 'period_code' => 'AN',
                    'code' => 'UE-'.$levelKey, 'name' => 'Enseignements annuels fictifs '.$levelKey, 'expected_credits' => '10.00',
                    'items' => array_map(fn (Courses $course) => ['source_course_id' => $course->id, 'credits' => '5.00', 'coefficient' => '1.000',
                        'cmi_hours' => 20, 'td_hours' => 10, 'tp_hours' => 0], $catalog['courses'][$facultyKey][$levelKey])];
            }
            $version = $service->saveDraft($version->id, ['revision' => $version->revision, 'units' => $units, 'reason' => self::REASON], $admin);
            foreach ($service->levelWorkspace($version, $program) as $workspace) {
                $version = $service->approveLevel($version->id, $workspace['id'], $version->revision, $workspace['signature'], $admin);
            }
            $version = $service->transition($version->id, 'validate', $version->revision, self::REASON, $admin);
        }

        return $service->transition($version->id, 'publish', $version->revision, self::REASON, $admin);
    }
}

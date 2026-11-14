<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Classes;
use App\Models\Courses;
use App\Models\Enrollment;
use App\Models\Intake;
use App\Models\Professor;
use App\Models\Student\AcademicAssessment;
use App\Models\Student\AcademicAttendance;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicOffering;
use App\Models\Student\AcademicRoom;
use App\Models\Student\AcademicSemester;
use App\Models\Student\AcademicSession;
use App\Models\Student\AcademicSubmission;
use App\Models\Student\ContentSection;
use App\Models\Student\StudentProfile;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

final class TeacherDashboardTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    private function professor(): array
    {
        $actor = User::factory()->create();
        $actor->assignRole(Role::findOrCreate('professor', 'web'));
        foreach (['manage courses', 'manage students'] as $name) {
            $actor->givePermissionTo(Permission::findOrCreate($name, 'web'));
        }
        $professor = Professor::create(['first_name' => 'Anne', 'last_name' => 'Kasa', 'email' => $actor->email, 'is_active' => true]);
        $professor->forceFill(['user_id' => $actor->id, 'photo' => 'professors/test-portrait.png'])->save();

        return [$actor, $professor];
    }

    private function offering(AcademicEnrollment $entry, Professor $professor, string $name, int $semester = 1): AcademicOffering
    {
        $course = (new Courses)->forceFill(['level_id' => $entry->level_id, 'title' => $name, 'semester' => $semester]);
        $course->save();

        return AcademicOffering::create([
            'course_id' => $course->id, 'level_id' => $entry->level_id, 'academic_year_id' => $entry->academic_year_id,
            'professor_id' => $professor->id, 'is_published' => true,
        ]);
    }

    public function test_home_uses_period_data_and_hides_other_offerings_and_private_material(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-10 10:00', 'Africa/Kinshasa'));
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        [$actor, $professor] = $this->professor();
        [, $other] = $this->professor();
        $methods = $this->offering($entry, $professor, 'Méthodes');
        $this->offering($entry, $professor, 'Recherche');
        $this->offering($entry, $professor, 'Systèmes', 2);
        $outside = $this->offering($entry, $other, 'Offre privée');
        AcademicSemester::create(['academic_year_id' => $entry->academic_year_id, 'number' => 1, 'start_date' => '2026-10-01', 'end_date' => '2027-02-01']);
        $methods->sessions()->create(['starts_at' => '2026-11-10 07:00:00', 'ends_at' => '2026-11-10 09:00:00', 'is_published' => true, 'room' => 'A 12']);
        $outside->sessions()->create(['starts_at' => '2026-11-10 07:00:00', 'ends_at' => '2026-11-10 09:00:00', 'is_published' => true, 'room' => 'B 12']);
        $methods->resources()->create(['kind' => 'material', 'title' => 'Support public', 'is_published' => true]);
        $methods->resources()->create(['kind' => 'material', 'title' => 'Support en brouillon', 'is_published' => false]);
        $notice = $methods->resources()->create(['kind' => 'announcement', 'title' => 'Calendrier de la faculté', 'body' => 'Dates de la faculté', 'is_published' => true]);
        $private = $methods->resources()->create(['kind' => 'announcement', 'title' => 'Annonce privée', 'student_profile_id' => $entry->student_profile_id, 'is_published' => true]);
        $outsideNotice = $outside->resources()->create(['kind' => 'announcement', 'title' => 'Autre faculté', 'is_published' => true]);

        $work = $methods->resources()->create(['kind' => 'assignment', 'title' => 'Rapport', 'is_published' => true, 'closes_at' => now()->addDay()]);
        $assessment = $work->assessment()->create(['category' => 'practical', 'session_code' => 'ordinaire', 'modality' => 'submission', 'attempt_limit' => 1, 'state' => 'published']);
        $assessment->records()->create(['academic_enrollment_id' => $entry->id, 'participation' => 'submitted']);
        AcademicSubmission::create(['academic_enrollment_id' => $entry->id, 'academic_resource_id' => $work->id, 'body' => 'Contenu privé', 'version' => 1]);

        $base = '/app/dashboard/teacher';
        $this->actingAs($actor)->get($base.'?semester=1')->assertInertia(fn (Assert $page) => $page
            ->component('dashboard/teaching/Teacher')->where('view', 'home')->where('overview.year', $entry->academic_year_id)->where('overview.semester', 1)
            ->where('overview.stats.courses', 2)->where('overview.stats.students', 1)->where('overview.stats.assessments', 1)->where('overview.stats.resources', 1)
            ->has('overview.week.days', 7)->where('overview.week.selected_day', '2026-11-10')->where('overview.week.previous', '2026-11-02')
            ->has('overview.week.days.1.sessions', 1)->where('overview.week.days.1.sessions.0.course', 'Méthodes')
            ->has('overview.submissions', 1)->where('overview.submissions.0.name', $student->full_name)->missing('overview.submissions.0.body')
            ->has('overview.announcements', 1)->where('overview.announcements.0.id', $notice->id)->where('overview.announcements.0.body', null)
            ->has('offerings.data', 2));
        $this->get($base.'?view=announcements&announcement='.$notice->id)->assertInertia(fn (Assert $page) => $page
            ->where('overview.selected_announcement.body', 'Dates de la faculté'));
        $this->get($base.'?view=announcements&announcement='.$private->id)->assertNotFound();
        $this->get($base.'?view=announcements&announcement='.$outsideNotice->id)->assertNotFound();
        $this->get($base.'?view=students&offering='.$methods->id)->assertInertia(fn (Assert $page) => $page
            ->where('view', 'students')->has('students.data', 1));
    }

    public function test_my_courses_lists_assigned_offerings_in_period_and_opens_the_selected_course_tabs(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-10 10:00', 'Africa/Kinshasa'));
        $entry = $this->studentContext()->studentProfile->enrollments()->sole();
        [$actor, $professor] = $this->professor();
        [$assistant, $assistantProfile] = $this->professor();
        $course = $this->offering($entry, $professor, 'Structures de données');
        $course->update(['assistant_professor_id' => $assistantProfile->id]);
        $course->course->forceFill(['credits' => 5])->save();
        $teamCourse = $this->offering($entry, $assistantProfile, 'Méthodes numériques');
        $teamCourse->assignments()->create(['professor_id' => $professor->id, 'role' => 'instructor', 'starts_at' => now()->subDay()]);
        $this->offering($entry, $professor, 'Logique', 2);
        $outside = $this->offering($entry, $assistantProfile, 'Cours externe');
        $outside->assignments()->create(['professor_id' => $professor->id, 'role' => 'instructor', 'starts_at' => now()->subMonth(), 'ends_at' => now()->subDay()]);
        $session = $this->createSession($course, 'Salle A12');
        $this->createSession($course, 'Séance non publiée', false);
        $this->createSession($teamCourse, 'Salle B15');

        $work = $course->resources()->create(['kind' => 'assignment', 'title' => 'Rapport', 'closes_at' => now()->addDay(), 'is_published' => true]);
        $work->assessment()->create(['category' => 'practical', 'session_code' => 'ordinaire', 'modality' => 'submission', 'attempt_limit' => 1, 'state' => 'published']);
        $legacyWork = $course->resources()->create(['kind' => 'evaluation', 'title' => 'Contrôle continu', 'is_published' => true]);
        $publicSupport = $course->resources()->create(['kind' => 'material', 'title' => 'Support public', 'path' => 'test/notes.pdf', 'is_published' => true]);
        $draftSupport = $course->resources()->create(['kind' => 'syllabus', 'title' => 'Plan en brouillon', 'is_published' => false]);
        $course->resources()->create(['kind' => 'material', 'title' => 'Document privé', 'student_profile_id' => $entry->student_profile_id, 'is_published' => true]);
        $teamCourse->resources()->create(['kind' => 'material', 'title' => 'Autre cours', 'is_published' => true]);

        $this->actingAs($actor)->get($this->workplace(['view' => 'courses', 'semester' => 1]))->assertInertia(fn (Assert $page) => $page
            ->where('view', 'courses')->has('offerings.data', 2)->where('offerings.data', function ($rows) use ($course, $teamCourse) {
                $cards = collect($rows)->keyBy('id');

                return $cards->keys()->sort()->values()->all() === [$course->id, $teamCourse->id]
                    && (float) $cards[$course->id]['credits'] === 5.0
                    && $cards[$course->id]['resources_count'] === 2
                    && $cards[$course->id]['assessments_count'] === 2
                    && $cards[$teamCourse->id]['resources_count'] === 1
                    && $cards[$teamCourse->id]['assessments_count'] === 0;
            }));
        $this->get($this->workplace(['offering' => $outside->id]))->assertNotFound();

        $url = ['offering' => $course->id];
        $this->get($this->workplace($url + ['tab' => 'sessions']))->assertInertia(fn (Assert $page) => $page
            ->where('view', 'courses')->where('courseTab', 'sessions')->where('selected.id', $course->id)
            ->has('sessions.data', 1)->where('sessions.data.0.room', 'Salle A12')
            ->where('sessions.data.0.attendance_url', fn ($href) => parse_url($href, PHP_URL_PATH) === route('dashboard.teaching.attendance', $session->id, false))
            ->where('students', null)->where('assessments', null)->where('resources', null));
        $this->get($this->workplace($url + ['tab' => 'assessments']))->assertInertia(fn (Assert $page) => $page
            ->where('courseTab', 'assessments')->where('canSeeCourseAssessments', true)->has('assessments.data', 2)
            ->where('assessments.data', function ($rows) use ($work, $legacyWork) {
                $rows = collect($rows)->keyBy('id');

                return $rows[$work->id]['title'] === $work->title
                    && $rows[$work->id]['state'] === 'published'
                    && str_contains($rows[$work->id]['url'], 'resource='.$work->id)
                    && $rows[$legacyWork->id]['title'] === $legacyWork->title
                    && $rows[$legacyWork->id]['url'] === null;
            }));
        $this->get($this->workplace($url + ['tab' => 'resources']))->assertInertia(fn (Assert $page) => $page
            ->where('courseTab', 'resources')->has('resources.data', 2)
            ->where('resources.data', fn ($rows) => collect($rows)->pluck('id')->sort()->values()->all() === [$publicSupport->id, $draftSupport->id])
            ->where('resources.data', fn ($rows) => parse_url(collect($rows)->firstWhere('id', $publicSupport->id)['download_url'], PHP_URL_PATH)
                === route('dashboard.teaching.file', $publicSupport->id, false)));
        $this->get(route('dashboard.teaching.learning.index', ['offering' => $course->id, 'resource' => $draftSupport->id]))
            ->assertInertia(fn (Assert $page) => $page->where('offering', $course->id)->where('selected.id', $draftSupport->id));

        $this->actingAs($assistant)->get($this->workplace($url + ['tab' => 'students']))->assertInertia(fn (Assert $page) => $page
            ->where('courseTab', 'overview')->where('selected.id', $course->id)->where('canSeeCourseStudents', false)->where('students', null)->has('studentGroups', 0));
        $this->get($this->workplace($url + ['tab' => 'sessions']))->assertInertia(fn (Assert $page) => $page
            ->has('sessions.data', 1)->where('sessions.data.0.attendance_url', null));
        $this->get($this->workplace($url + ['tab' => 'assessments']))->assertInertia(fn (Assert $page) => $page
            ->where('canSeeCourseAssessments', false)->where('assessments', null)->where('courseLinks.assessments', null));
        $this->get($this->workplace($url + ['tab' => 'resources']))->assertInertia(fn (Assert $page) => $page
            ->has('resources.data', 1)->where('resources.data.0.id', $publicSupport->id));
        $this->get(route('dashboard.teaching.learning.index', ['offering' => $course->id, 'resource' => $draftSupport->id]))->assertNotFound();

        $this->get($this->workplace(['view' => 'courses', 'semester' => 1]))->assertInertia(fn (Assert $page) => $page
            ->where('offerings.data', function ($rows) use ($course) {
                $shared = collect($rows)->firstWhere('id', $course->id);

                return $shared['resources_count'] === 1 && $shared['assessments_count'] === null && $shared['active_students_count'] === null;
            }));
    }

    public function test_course_overview_shows_its_plan_and_published_schedule_and_allows_only_authorized_changes(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-10 10:00', 'Africa/Kinshasa'));
        $entry = $this->studentContext()->studentProfile->enrollments()->sole();
        [$actor, $teacher] = $this->professor();
        [$assistant, $helper] = $this->professor();
        [$outsider, $outside] = $this->professor();
        $offering = $this->offering($entry, $teacher, 'Recherche opérationnelle');
        $offering->update(['assistant_professor_id' => $helper->id]);
        $offering->course->forceFill(['description' => 'Présentation du catalogue.'])->save();
        $sameCourse = AcademicOffering::create([
            'course_id' => $offering->course_id, 'level_id' => $offering->level_id, 'academic_year_id' => $offering->academic_year_id,
            'class_id' => $this->group($entry, 'Autre promotion')->id, 'professor_id' => $outside->id, 'is_published' => true,
        ]);
        $lateSection = $this->section($offering, 'Résoudre des cas', 2);
        $firstSection = $this->section($offering, 'Notions fondamentales', 1);
        $this->section($sameCourse, 'Section autre promotion', 0);
        $this->createSession($offering, 'Terminée'); // Se termine exactement à 10 h à Kinshasa.
        $offering->sessions()->create(['starts_at' => now()->subMinutes(30), 'ends_at' => now()->addMinutes(30), 'is_published' => true, 'room' => 'En cours']);
        $next = $offering->sessions()->create(['starts_at' => now()->addHour(), 'ends_at' => now()->addHours(2), 'is_published' => true, 'room' => 'Prochaine']);
        $offering->sessions()->create(['starts_at' => now()->subHours(2), 'ends_at' => now()->subHour(), 'is_published' => true, 'cancelled_at' => now()->subDay(), 'room' => 'Annulée']);
        $offering->sessions()->create(['starts_at' => now()->addMinutes(30), 'ends_at' => now()->addMinutes(45), 'is_published' => false, 'room' => 'Brouillon']);
        $this->createSession($sameCourse, 'Autre cours');

        $url = $this->workplace(['offering' => $offering->id]);
        $updateUrl = route('dashboard.teaching.overview.update', $offering);
        $edit = ['presentation' => 'Introduction aux modèles de décision.', 'objectives' => "Modéliser un problème.\nComparer deux méthodes.", 'revision' => 0];
        $this->actingAs($actor)->get($url)->assertInertia(fn (Assert $page) => $page
            ->where('courseTab', 'overview')->where('selected.id', $offering->id)
            ->where('courseOverview.presentation', 'Présentation du catalogue.')->where('courseOverview.objectives', null)
            ->where('courseOverview.revision', 0)->where('courseOverview.update_url', fn ($href) => $this->matchesUrl($href, 'dashboard.teaching.overview.update', ['offering' => $offering->id]))
            ->where('courseOverview.schedule.total', 3)->where('courseOverview.schedule.elapsed', 1)
            ->where('courseOverview.schedule.next_at', fn ($value) => CarbonImmutable::parse($value)->eq($next->starts_at))
            ->has('courseOverview.sections', 2)->where('courseOverview.sections.0.id', $firstSection->id)->where('courseOverview.sections.1.id', $lateSection->id));

        $this->put($updateUrl, $edit)->assertStatus(303);
        $this->get($url)->assertInertia(fn (Assert $page) => $page
            ->where('courseOverview.presentation', $edit['presentation'])->where('courseOverview.objectives', $edit['objectives'])
            ->where('courseOverview.revision', 1));
        $this->from($url)->put($updateUrl, array_replace($edit, ['presentation' => 'Modification obsolète.']))->assertSessionHasErrors('revision');
        $this->get($url)->assertInertia(fn (Assert $page) => $page->where('courseOverview.presentation', $edit['presentation']));

        $this->actingAs($assistant)->get($url)->assertInertia(fn (Assert $page) => $page
            ->where('courseOverview.objectives', $edit['objectives'])->where('courseOverview.update_url', null));
        $this->put($updateUrl, array_replace($edit, ['revision' => 1]))->assertForbidden();
        $this->actingAs($outsider)->get($url)->assertNotFound();
        $this->put($updateUrl, array_replace($edit, ['revision' => 1]))->assertForbidden();
        $this->get($this->workplace(['offering' => $sameCourse->id]))->assertInertia(fn (Assert $page) => $page
            ->where('courseOverview.presentation', 'Présentation du catalogue.')->where('courseOverview.objectives', null)
            ->where('courseOverview.revision', 0));
    }

    public function test_course_resources_are_grouped_in_order_and_filtered_within_the_visible_offering(): void
    {
        $entry = $this->studentContext()->studentProfile->enrollments()->sole();
        [$actor, $teacher] = $this->professor();
        [$assistant, $helper] = $this->professor();
        $offering = $this->offering($entry, $teacher, 'Mécanique');
        $offering->update(['assistant_professor_id' => $helper->id]);
        $other = $this->offering($entry, $teacher, 'Physique');
        $advanced = $this->section($offering, 'Applications', 2);
        $intro = $this->section($offering, 'Introduction', 1);
        $outside = $this->section($other, 'Autre cours', 1);
        $draft = $offering->resources()->create(['title' => 'Travaux préparatoires', 'kind' => 'material', 'academic_content_section_id' => $advanced->id]);
        $published = $offering->resources()->create(['title' => 'Introduction aux lois', 'kind' => 'material', 'is_published' => true, 'academic_content_section_id' => $intro->id]);
        $general = $offering->resources()->create(['title' => 'Syllabus', 'kind' => 'syllabus', 'is_published' => true]);
        $offering->resources()->create(['title' => 'Fichier individuel', 'kind' => 'material', 'is_published' => true, 'academic_content_section_id' => $intro->id, 'student_profile_id' => $entry->student_profile_id]);
        $offering->resources()->create(['title' => 'Évaluation attachée', 'kind' => 'evaluation', 'is_published' => true, 'academic_content_section_id' => $intro->id]);

        $url = ['offering' => $offering->id, 'tab' => 'resources'];
        $this->actingAs($actor)->get($this->workplace($url))->assertInertia(fn (Assert $page) => $page
            ->where('resourcesTotal', 3)->where('resourceUnassignedCount', 1)->where('resourceSection', null)
            ->has('resourcesSections', 2)->where('resourcesSections.0.id', $intro->id)->where('resourcesSections.0.count', 1)
            ->where('resourcesSections.1.id', $advanced->id)->where('resourcesSections.1.count', 1)
            ->has('resources.data', 3)->where('resources.data.0.id', $published->id)
            ->where('resources.data.0.section', 'Introduction')->where('resources.data.0.section_id', $intro->id));
        $this->get($this->workplace($url + ['section' => $advanced->id]))->assertInertia(fn (Assert $page) => $page
            ->where('resourceSection', $advanced->id)->where('resourcesTotal', 3)->where('resources.total', 1)
            ->where('resources.data.0.id', $draft->id));
        $this->get($this->workplace($url + ['section' => 'unassigned']))->assertInertia(fn (Assert $page) => $page
            ->where('resourceSection', 'unassigned')->where('resources.total', 1)->where('resources.data.0.id', $general->id));
        $this->get($this->workplace($url + ['section' => $outside->id]))->assertNotFound();

        $this->actingAs($assistant)->get($this->workplace($url))->assertInertia(fn (Assert $page) => $page
            ->where('resourcesTotal', 2)->where('resources.total', 2)->where('resourceUnassignedCount', 1)
            ->has('resourcesSections', 2)->where('resourcesSections.1.id', $advanced->id)->where('resourcesSections.1.count', 0)
            ->where('resources.data', fn ($items) => collect($items)->pluck('id')->sort()->values()->all() === [$published->id, $general->id]));
    }

    public function test_course_students_filter_uses_only_the_selected_courses_roster(): void
    {
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        [$actor, $professor] = $this->professor();
        $course = $this->offering($entry, $professor, 'Algorithmique');
        $groupA = $this->group($entry, 'Groupe A');
        $groupB = $this->group($entry, 'Groupe B');
        $groupExcluded = $this->group($entry, 'Groupe exclu');
        $entry->update(['class_id' => $groupA->id]);
        $studentB = $this->extraEnrollment($entry, $groupB);
        $unassigned = $this->extraEnrollment($entry);
        $excluded = $this->extraEnrollment($entry, $groupExcluded);
        $course->exceptions()->create(['academic_enrollment_id' => $excluded->id, 'action' => 'exclude', 'reason' => 'Cours non suivi', 'authorized_by' => $actor->id]);

        $url = ['offering' => $course->id, 'tab' => 'students'];
        $this->actingAs($actor)->get($this->workplace($url))->assertInertia(fn (Assert $page) => $page
            ->where('courseTab', 'students')->where('canSeeCourseStudents', true)->where('studentGroup', null)->has('students.data', 3)
            ->has('studentGroups', 3)->where('studentGroups', fn ($groups) => collect($groups)->keyBy('label')->get('Groupe A')['count'] === 1));
        $this->get($this->workplace($url + ['group' => $groupB->id]))->assertInertia(fn (Assert $page) => $page
            ->where('studentGroup', $groupB->id)->has('students.data', 1)->where('students.data.0.id', $studentB->id)->where('students.data.0.group', 'Groupe B'));
        $this->get($this->workplace($url + ['group' => 'unassigned']))->assertInertia(fn (Assert $page) => $page
            ->where('studentGroup', 'unassigned')->has('students.data', 1)->where('students.data.0.id', $unassigned->id));
        $this->get($this->workplace($url + ['group' => $groupExcluded->id]))->assertNotFound();

        for ($index = 0; $index < 20; $index++) {
            $this->extraEnrollment($entry, $groupB);
        }

        $this->get($this->workplace($url + ['group' => $groupB->id, 'students_page' => 2]))->assertInertia(fn (Assert $page) => $page
            ->where('studentGroup', $groupB->id)->where('students.total', 21)->where('students.current_page', 2)
            ->has('students.data', 1)->where('students.data.0.group', 'Groupe B'));
    }

    public function test_student_search_combines_names_and_matricules_with_the_authorized_group_and_pagination(): void
    {
        $student = $this->studentContext();
        $student->update(['first_name' => 'Nadia', 'last_name' => 'Kabeya']);
        $entry = $student->studentProfile->enrollments()->sole();
        [$actor, $teacher] = $this->professor();
        [$assistant, $helper] = $this->professor();
        $course = $this->offering($entry, $teacher, 'Algorithmique');
        $course->update(['assistant_professor_id' => $helper->id]);
        $groupA = $this->group($entry, 'Groupe A');
        $groupB = $this->group($entry, 'Groupe B');
        $entry->update(['class_id' => $groupA->id, 'matricule' => 'USK-NAD-100']);
        $entry->profile->update(['matricule' => 'USK-ANCIEN-100']);
        $fallback = $this->extraEnrollment($entry, $groupA, ['first_name' => 'Nadia', 'last_name' => 'Masika']);
        $fallback->profile->update(['matricule' => 'USK-MAS-200']);
        $sameName = $this->extraEnrollment($entry, $groupB, ['first_name' => 'Nadia', 'last_name' => 'Kabeya']);
        $excluded = $this->extraEnrollment($entry, $groupA, ['first_name' => 'Nadia', 'last_name' => 'Kabeya']);
        $course->exceptions()->create(['academic_enrollment_id' => $excluded->id, 'action' => 'exclude', 'reason' => 'Cours non suivi', 'authorized_by' => $actor->id]);

        $url = ['offering' => $course->id, 'tab' => 'students'];
        $groupQuery = $url + ['group' => $groupA->id];
        $this->actingAs($actor)->get($this->workplace($groupQuery + ['q' => 'kabeya nadia']))->assertInertia(fn (Assert $page) => $page
            ->where('studentSearch', 'kabeya nadia')->where('studentGroup', $groupA->id)
            ->has('students.data', 1)->where('students.data.0.id', $entry->id)
            ->has('studentGroups', 2)->where('studentGroups.0.count', 2));
        $this->get($this->workplace($url + ['q' => 'NADIA KABEYA']))->assertInertia(fn (Assert $page) => $page
            ->has('students.data', 2)->where('students.data', fn ($rows) => collect($rows)->pluck('id')->sort()->values()->all() === [$entry->id, $sameName->id]));
        $this->get($this->workplace($groupQuery + ['q' => 'nad-100']))->assertInertia(fn (Assert $page) => $page
            ->has('students.data', 1)->where('students.data.0.matricule', 'USK-NAD-100'));
        $this->get($this->workplace($groupQuery + ['q' => 'mas-200']))->assertInertia(fn (Assert $page) => $page
            ->has('students.data', 1)->where('students.data.0.id', $fallback->id)->where('students.data.0.matricule', 'USK-MAS-200'));
        foreach (['ancien-100', '%', '_'] as $notFound) {
            $this->get($this->workplace($groupQuery + ['q' => $notFound]))->assertInertia(fn (Assert $page) => $page->has('students.data', 0));
        }

        for ($index = 1; $index <= 19; $index++) {
            $this->extraEnrollment($entry, $groupA, ['first_name' => 'Nadia', 'last_name' => 'Paginée']);
        }
        $this->get($this->workplace($groupQuery + ['q' => 'nadia', 'students_page' => 2]))->assertInertia(fn (Assert $page) => $page
            ->where('studentSearch', 'nadia')->where('students.current_page', 2)->where('students.total', 21)->has('students.data', 1)
            ->where('students.prev_page_url', fn ($href) => $this->matchesUrl($href, 'dashboard.teaching.index', $groupQuery + ['q' => 'nadia'])));

        $this->actingAs($assistant)->get($this->workplace($groupQuery + ['q' => 'nadia']))->assertInertia(fn (Assert $page) => $page
            ->where('courseTab', 'overview')->where('students', null)->has('studentGroups', 0));
    }

    public function test_course_gradebook_maps_scores_and_workflow_states_to_authorized_student_and_assessment_pairs(): void
    {
        $entry = $this->studentContext()->studentProfile->enrollments()->sole();
        [$actor, $teacher] = $this->professor();
        [$assistant, $helper] = $this->professor();
        [$outsider, $outsideTeacher] = $this->professor();
        $course = $this->offering($entry, $teacher, 'Analyse des données');
        $other = $this->offering($entry, $outsideTeacher, 'Cours privé');
        $group = $this->group($entry, 'Groupe A');
        $otherGroup = $this->group($entry, 'Groupe B');
        $course->update(['assistant_professor_id' => $helper->id, 'class_id' => $group->id]);
        $entry->update(['class_id' => $group->id, 'matricule' => 'USK-001']);
        $absent = $this->extraEnrollment($entry, $group);
        $empty = $this->extraEnrollment($entry, $group);
        $history = $this->extraEnrollment($entry, $group);
        $history->update(['enrollment_status' => 'withdrawn']);
        $excluded = $this->extraEnrollment($entry, $otherGroup);
        $foreignYear = AcademicYear::create(['title' => '2025-2026', 'start_date' => '2025-10-01', 'end_date' => '2026-09-30', 'status' => 'closed']);
        $foreign = $this->extraEnrollment($entry->replicate()->forceFill(['academic_year_id' => $foreignYear->id]), $group);

        $assessment = $this->gradebookAssessment($course, 'Devoir noté');
        $second = $this->gradebookAssessment($course, 'Examen');
        $personal = $this->gradebookAssessment($course, 'Évaluation individuelle privée', $excluded->student_profile_id);
        $unrelated = $this->gradebookAssessment($other, 'Évaluation du cours privé');
        $course->resources()->create(['kind' => 'assignment', 'title' => 'Ancien devoir sans grille', 'is_published' => true]);
        $zero = $assessment->records()->create([
            'academic_enrollment_id' => $entry->id, 'participation' => 'submitted', 'points' => 0,
            'feedback' => 'Un commentaire qui reste dans la fiche de correction.', 'corrected_by' => $actor->id,
        ]);
        $second->records()->create([
            'academic_enrollment_id' => $entry->id, 'participation' => 'present', 'points' => 1250,
            'correction_state' => 'finalized', 'corrected_by' => $actor->id,
        ]);
        $assessment->records()->create([
            'academic_enrollment_id' => $absent->id, 'participation' => 'absent', 'correction_state' => 'validated',
            'released_at' => now()->subHour(),
        ]);
        $second->records()->create([
            'academic_enrollment_id' => $history->id, 'participation' => 'late_submission', 'points' => 2000,
            'correction_state' => 'validated',
        ]);
        foreach ([[$assessment, $foreign], [$personal, $excluded], [$unrelated, $excluded]] as [$work, $student]) {
            $work->records()->create(['academic_enrollment_id' => $student->id, 'participation' => 'submitted', 'points' => 999]);
        }

        $query = ['view' => 'courses', 'offering' => $course->id, 'tab' => 'grades', 'year' => $entry->academic_year_id, 'semester' => 1];
        $url = $this->workplace($query);
        $response = $this->actingAs($actor)->get($url)->assertInertia(fn (Assert $page) => $page
            ->component('dashboard/teaching/Teacher')->where('courseTab', 'grades')->where('canSeeCourseGrades', true)
            ->where('gradebook.assessments.total', 2)->where('gradebook.students.total', 4));
        $columns = collect($response->inertiaProps('gradebook.assessments.data'))->keyBy('id');
        $this->assertEqualsCanonicalizing([$assessment->id, $second->id], $columns->keys()->all());
        $this->assertSame($assessment->academic_resource_id, $columns[$assessment->id]['resource_id']);
        $this->assertSame(2000, $columns[$assessment->id]['maximum_points']);

        $rows = collect($response->inertiaProps('gradebook.students.data'))->keyBy('id');
        $this->assertEqualsCanonicalizing([$entry->id, $absent->id, $empty->id, $history->id], $rows->keys()->all());
        $this->assertSame('USK-001', $rows[$entry->id]['matricule']);
        $this->assertSame('Groupe A', $rows[$entry->id]['group']);
        $this->assertSame([], $rows[$empty->id]['grades']);

        $zeroCell = $rows[$entry->id]['grades'][$assessment->id];
        $this->assertSame(0, $zeroCell['points']);
        $this->assertSame('draft', $zeroCell['correction_state']);
        $this->assertTrue($zeroCell['has_correction']);
        $this->assertNull($zeroCell['released_at']);
        $this->assertArrayNotHasKey('feedback', $zeroCell);
        $finalizedCell = $rows[$entry->id]['grades'][$second->id];
        $this->assertSame(1250, $finalizedCell['points']);
        $this->assertSame('finalized', $finalizedCell['correction_state']);
        $this->assertNull($finalizedCell['released_at']);
        $absenceCell = $rows[$absent->id]['grades'][$assessment->id];
        $this->assertNull($absenceCell['points']);
        $this->assertSame('absent', $absenceCell['participation']);
        $this->assertSame('validated', $absenceCell['correction_state']);
        $this->assertNotNull($absenceCell['released_at']);
        $this->assertArrayNotHasKey($second->id, $rows[$absent->id]['grades']);
        $this->assertNull($rows[$history->id]['grades'][$second->id]['released_at']);

        $correction = [
            'offering' => $course->id, 'resource' => $assessment->academic_resource_id, 'record' => $zero->id,
            'from_gradebook' => 1, 'gradebook_semester' => 1,
        ];
        $this->assertTrue($this->matchesUrl($zeroCell['url'], 'dashboard.teaching.assessments.index', $correction));
        $this->assertSame('assessment-correction', parse_url($zeroCell['url'], PHP_URL_FRAGMENT));
        $this->get($zeroCell['url'])->assertInertia(fn (Assert $page) => $page
            ->component('dashboard/teaching/Assessments')->where('record.id', $zero->id)->where('record.points', 0)
            ->where('record.academic_enrollment_id', $entry->id)
            ->where('gradebook_url', fn ($href) => $this->matchesUrl($href, 'dashboard.teaching.index', $query)));
        $this->get(route('dashboard.teaching.assessments.index', array_diff_key($correction, ['from_gradebook' => true, 'gradebook_semester' => true])))
            ->assertInertia(fn (Assert $page) => $page->where('gradebook_url', null));
        $this->get(route('dashboard.teaching.assessments.index', array_replace($correction, ['resource' => $second->academic_resource_id])))
            ->assertNotFound();

        $this->get($this->workplace(['offering' => $course->id]))->assertInertia(fn (Assert $page) => $page
            ->where('courseTab', 'overview')->where('canSeeCourseGrades', true)->where('gradebook', null));
        $this->actingAs($assistant)->get($url)->assertInertia(fn (Assert $page) => $page
            ->where('courseTab', 'overview')->where('canSeeCourseGrades', false)->where('gradebook', null));
        $this->get($zeroCell['url'])->assertNotFound();
        $this->actingAs($outsider)->get($url)->assertNotFound();
        $this->get($zeroCell['url'])->assertNotFound();

        $admin = User::factory()->create();
        $admin->assignRole(Role::findOrCreate('admin', 'web'))->givePermissionTo(Permission::findOrCreate('publish academic content', 'web'));
        $this->actingAs($admin)->get(route('dashboard.admin.assessments.index', $correction))
            ->assertInertia(fn (Assert $page) => $page->where('record.id', $zero->id)->where('gradebook_url', null));
    }

    public function test_gradebook_pages_students_and_assessments_independently_and_preserves_the_return_context(): void
    {
        $entry = $this->studentContext()->studentProfile->enrollments()->sole();
        [$actor, $teacher] = $this->professor();
        $course = $this->offering($entry, $teacher, 'Systèmes');
        $students = collect([$entry, ...array_map(fn () => $this->extraEnrollment($entry), range(1, 20))]);
        $assessments = collect(array_map(fn ($index) => $this->gradebookAssessment($course, 'Évaluation '.$index), range(1, 7)));
        foreach ($assessments as $assessment) {
            foreach ($students as $student) {
                $assessment->records()->create(['academic_enrollment_id' => $student->id, 'participation' => 'present', 'points' => 1450]);
            }
        }

        $firstPage = ['view' => 'courses', 'offering' => $course->id, 'tab' => 'grades', 'semester' => 1, 'year' => $entry->academic_year_id];
        $secondPage = $firstPage + ['grades_students_page' => 2, 'grades_assessments_page' => 2];
        $this->actingAs($actor)->get($this->workplace($firstPage))->assertInertia(fn (Assert $page) => $page
            ->where('gradebook.students.total', 21)->has('gradebook.students.data', 20)
            ->where('gradebook.assessments.total', 7)->has('gradebook.assessments.data', 6));
        $page = $this->get($this->workplace($secondPage))->assertInertia(fn (Assert $page) => $page
            ->where('gradebook.students.current_page', 2)->has('gradebook.students.data', 1)
            ->where('gradebook.assessments.current_page', 2)->has('gradebook.assessments.data', 1)
            ->where('gradebook.students.prev_page_url', fn ($href) => $this->matchesUrl($href, 'dashboard.teaching.index', $firstPage + ['grades_assessments_page' => 2]))
            ->where('gradebook.assessments.prev_page_url', fn ($href) => $this->matchesUrl($href, 'dashboard.teaching.index', $firstPage + ['grades_students_page' => 2])));
        $column = $page->inertiaProps('gradebook.assessments.data.0');
        $cells = $page->inertiaProps('gradebook.students.data.0.grades');
        $this->assertSame([$column['id']], array_keys($cells));
        $this->get($cells[$column['id']]['url'])->assertInertia(fn (Assert $page) => $page
            ->where('record.points', 1450)
            ->where('gradebook_url', fn ($href) => $this->matchesUrl($href, 'dashboard.teaching.index', $secondPage)));
    }

    public function test_weekly_schedule_uses_kinshasa_dates_and_links_to_a_scoped_session(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-09 10:00', 'Africa/Kinshasa'));
        $entry = $this->studentContext()->studentProfile->enrollments()->sole();
        [$actor, $professor] = $this->professor();
        [, $other] = $this->professor();
        $methods = $this->offering($entry, $professor, 'Méthodes');
        $methods->update(['class_id' => $this->group($entry, 'Groupe A')->id]);
        $otherSemester = $this->offering($entry, $professor, 'Électronique', 2);
        $archived = $this->offering($entry, $professor, 'Offre archivée');
        $archived->update(['archived_at' => now()]);
        $unpublishedCourse = $this->offering($entry, $professor, 'Offre en brouillon');
        $unpublishedCourse->update(['is_published' => false]);
        $outsider = $this->offering($entry, $other, 'Offre privée');
        $room = AcademicRoom::create([
            'code' => 'B-208', 'name' => 'Salle 208', 'campus' => 'Central', 'building' => 'Bâtiment B',
            'capacity' => 40, 'type' => 'classroom',
        ]);
        $overnight = $methods->sessions()->create([
            'starts_at' => '2026-11-08 22:30:00', 'ends_at' => '2026-11-08 23:30:00',
            'room' => '', 'academic_room_id' => $room->id, 'activity_type' => 'TP', 'is_published' => true,
        ]);
        $endsAtMidnight = $methods->sessions()->create([
            'starts_at' => '2026-11-08 21:00:00', 'ends_at' => '2026-11-08 23:00:00', 'room' => 'Salle 312', 'is_published' => true,
        ]);
        $hidden = [
            $this->createSession($methods, 'Séance en brouillon', false),
            $this->createSession($otherSemester, 'Autre semestre'),
            $this->createSession($archived, 'Cours archivé'),
            $this->createSession($unpublishedCourse, 'Cours en brouillon'),
            $this->createSession($outsider, 'Cours non assigné'),
        ];
        $parameters = ['view' => 'schedule', 'year' => $entry->academic_year_id, 'semester' => 1, 'week' => '2026-11-09', 'day' => '2026-11-09'];
        $this->actingAs($actor)->get($this->workplace($parameters))->assertInertia(fn (Assert $page) => $page
            ->component('dashboard/teaching/Teacher')->where('view', 'schedule')->has('overview.week.days', 7)
            ->where('overview.week.start', '2026-11-09')->where('overview.week.end', '2026-11-15')->where('overview.week.selected_day', '2026-11-09')
            ->where('overview.week.previous', '2026-11-02')->where('overview.week.next', '2026-11-16')
            ->has('overview.week.days.0.sessions', 1)->where('overview.week.days.0.sessions.0.id', $overnight->id)
            ->where('overview.week.days.0.sessions.0.url', fn ($href) => $this->matchesUrl($href, 'dashboard.teaching.index', $parameters + ['session' => $overnight->id]))
            ->has('overview.week.days.1.sessions', 0)->where('overview.selected_session', null));

        $this->get($this->workplace($parameters + ['session' => $overnight->id]))->assertInertia(fn (Assert $page) => $page
            ->where('overview.selected_session.id', $overnight->id)->where('overview.selected_session.course', 'Méthodes')
            ->where('overview.selected_session.level', $entry->level->title)->where('overview.selected_session.group', 'Groupe A')
            ->where('overview.selected_session.location', fn ($location) => str_contains($location, 'Bâtiment B') && str_contains($location, 'Salle 208'))
            ->where('overview.selected_session.activity_type', 'TP')
            ->where('overview.selected_session.back_url', fn ($href) => $this->matchesUrl($href, 'dashboard.teaching.index', $parameters)
                && ! str_contains(parse_url($href, PHP_URL_QUERY) ?? '', 'session='))
            ->where('overview.selected_session.course_url', fn ($href) => $this->matchesUrl($href, 'dashboard.teaching.index', ['offering' => $methods->id])));
        $this->get($this->workplace(['session' => $overnight->id]))->assertInertia(fn (Assert $page) => $page
            ->where('overview.week.start', '2026-11-02')->where('overview.week.selected_day', '2026-11-08')
            ->where('overview.selected_session.id', $overnight->id));

        foreach ([...$hidden, $endsAtMidnight] as $session) {
            $this->get($this->workplace($parameters + ['session' => $session->id]))->assertNotFound();
        }
        $this->get($this->workplace(array_replace($parameters, ['week' => '2026-11-16', 'day' => '2026-11-16', 'session' => $overnight->id])))
            ->assertNotFound();
    }

    public function test_session_detail_opens_attendance_with_week_context_and_student_roster(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-10 10:00', 'Africa/Kinshasa'));
        $entry = $this->studentContext()->studentProfile->enrollments()->sole();
        [$actor, $professor] = $this->professor();
        [$assistant, $assistantProfile] = $this->professor();
        $offering = $this->offering($entry, $professor, 'Algorithmique');
        $offering->update(['assistant_professor_id' => $assistantProfile->id]);
        $session = $this->createSession($offering, 'Salle A');
        $schedule = ['view' => 'schedule', 'year' => $entry->academic_year_id, 'semester' => 1, 'week' => '2026-11-09', 'day' => '2026-11-10', 'session' => $session->id];
        $attendance = array_diff_key($schedule, ['view' => true]);
        $attendanceUrl = route('dashboard.teaching.attendance', $attendance);
        $saveUrl = route('dashboard.teaching.attendance.save', $attendance);

        $this->actingAs($actor)->get($this->workplace($schedule))->assertInertia(fn (Assert $page) => $page
            ->where('overview.selected_session.attendance_status', 'recordable')->where('overview.selected_session.can_record_attendance', true)
            ->where('overview.selected_session.attendance_url', fn ($href) => $this->matchesUrl($href, 'dashboard.teaching.attendance', $attendance)));
        $this->get($attendanceUrl)->assertInertia(fn (Assert $page) => $page
            ->component('dashboard/schedule/Attendance')->where('session.id', $session->id)->where('canRecord', true)->has('students', 1)
            ->where('students.0.id', $entry->id)->where('returnUrl', fn ($href) => $this->matchesUrl($href, 'dashboard.teaching.index', $schedule))
            ->where('saveUrl', fn ($href) => $this->matchesUrl($href, 'dashboard.teaching.attendance.save', $attendance)));
        $saved = $this->from($this->workplace($schedule))->post($saveUrl, [
            'revision' => 0, 'records' => [['id' => $entry->id, 'status' => 'present']],
        ])->assertStatus(303)->assertSessionHas('success', 'Présences enregistrées.')->assertSessionHasNoErrors();
        $this->assertTrue($this->matchesUrl($saved->headers->get('Location'), 'dashboard.teaching.attendance', $attendance));
        $this->assertSame('present', AcademicAttendance::sole()->status);
        $this->get($attendanceUrl)->assertInertia(fn (Assert $page) => $page->where('students.0.status', 'present'));

        $this->actingAs($assistant)->get($this->workplace($schedule))->assertInertia(fn (Assert $page) => $page
            ->where('overview.selected_session.id', $session->id)
            ->where('overview.selected_session.attendance_status', 'unavailable')
            ->where('overview.selected_session.can_record_attendance', false)->where('overview.selected_session.attendance_url', null));
        $this->get($attendanceUrl)->assertForbidden();
    }

    public function test_future_closed_and_rescheduled_sessions_show_the_correct_attendance_state(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-10 10:00', 'Africa/Kinshasa'));
        $entry = $this->studentContext()->studentProfile->enrollments()->sole();
        [$actor, $professor] = $this->professor();
        $offering = $this->offering($entry, $professor, 'Topologie');
        $original = $this->createSession($offering, 'Ancienne salle');
        $original->update(['cancelled_at' => now(), 'change_reason' => 'Travaux dans la salle']);
        $future = $offering->sessions()->create([
            'starts_at' => '2026-11-12 09:00:00', 'ends_at' => '2026-11-12 11:00:00', 'room' => 'Salle B',
            'is_published' => true, 'replaces_session_id' => $original->id,
        ]);
        $closed = $this->createSession($offering, 'Salle C');
        $closed->update(['attendance_closed_at' => now()]);
        $schedule = ['view' => 'schedule', 'year' => $entry->academic_year_id, 'week' => '2026-11-09', 'day' => '2026-11-10'];

        $this->actingAs($actor)->get($this->workplace($schedule + ['session' => $original->id]))->assertInertia(fn (Assert $page) => $page
            ->where('overview.selected_session.status', 'rescheduled')->missing('overview.selected_session.change_reason')
            ->where('overview.selected_session.replacement_starts_at', fn ($datetime) => CarbonImmutable::parse($datetime)->eq($future->starts_at))
            ->where('overview.selected_session.replacement_url', fn ($href) => $this->matchesUrl($href, 'dashboard.teaching.index',
                array_replace($schedule, ['day' => '2026-11-12', 'session' => $future->id])))
            ->where('overview.selected_session.can_record_attendance', false)->where('overview.selected_session.attendance_url', null));
        $this->get($this->workplace(array_replace($schedule, ['day' => '2026-11-12', 'session' => $future->id])))->assertInertia(fn (Assert $page) => $page
            ->where('overview.selected_session.attendance_status', 'upcoming')->where('overview.selected_session.can_record_attendance', false));
        $this->get($this->workplace($schedule + ['session' => $closed->id]))->assertInertia(fn (Assert $page) => $page
            ->where('overview.selected_session.attendance_status', 'read_only')->where('overview.selected_session.can_record_attendance', false)
            ->where('overview.selected_session.attendance_url', fn ($href) => $this->matchesUrl($href, 'dashboard.teaching.attendance', ['session' => $closed->id])));
        $this->get(route('dashboard.teaching.attendance', $future))->assertInertia(fn (Assert $page) => $page->where('canRecord', false));
        $this->get(route('dashboard.teaching.attendance', $closed))->assertInertia(fn (Assert $page) => $page->where('canRecord', false)->where('closed', true));
        $attendance = ['revision' => 0, 'records' => [['id' => $entry->id, 'status' => 'present']]];
        $this->post(route('dashboard.teaching.attendance.save', $future), $attendance)->assertUnprocessable();
        $this->post(route('dashboard.teaching.attendance.save', $closed), $attendance)->assertForbidden();
        $this->post(route('dashboard.teaching.attendance.save', $original), $attendance)->assertUnprocessable();
        $this->assertDatabaseCount('academic_attendances', 0);
    }

    private function matchesUrl(string $url, string $route, array $parameters): bool
    {
        $expected = route($route, $parameters, false);
        if (parse_url($url, PHP_URL_PATH) !== parse_url($expected, PHP_URL_PATH)) {
            return false;
        }
        parse_str(parse_url($url, PHP_URL_QUERY) ?? '', $query);
        parse_str(parse_url($expected, PHP_URL_QUERY) ?? '', $expectedQuery);

        return ! array_diff_assoc($expectedQuery, $query);
    }

    private function workplace(array $parameters): string
    {
        return route('dashboard.teaching.index', $parameters);
    }

    private function createSession(AcademicOffering $course, string $room, bool $published = true): AcademicSession
    {
        return $course->sessions()->create(['starts_at' => '2026-11-10 07:00:00', 'ends_at' => '2026-11-10 09:00:00', 'is_published' => $published, 'room' => $room]);
    }

    private function section(AcademicOffering $offering, string $title, int $position): ContentSection
    {
        return ContentSection::create(['academic_offering_id' => $offering->id, 'title' => $title, 'position' => $position]);
    }

    private function gradebookAssessment(AcademicOffering $offering, string $title, ?int $studentProfile = null): AcademicAssessment
    {
        return $offering->resources()->create(['title' => $title, 'kind' => 'assignment', 'student_profile_id' => $studentProfile, 'is_published' => true])
            ->assessment()->create([
                'category' => 'assignment', 'session_code' => 'ordinaire', 'modality' => 'submission', 'state' => 'closed',
                'attempt_limit' => 1, 'maximum_points' => 2000,
            ]);
    }

    private function group(AcademicEnrollment $entry, string $name): Classes
    {
        return Classes::create(['faculty_id' => $entry->level->faculty_id, 'level_id' => $entry->level_id, 'intake_id' => Intake::create(['name' => $name])->id]);
    }

    private function extraEnrollment(AcademicEnrollment $sample, ?Classes $group = null, array $identity = []): AcademicEnrollment
    {
        $user = User::factory()->create($identity);
        $context = ['level_id' => $sample->level_id, 'academic_year_id' => $sample->academic_year_id, 'class_id' => $group?->id];
        $application = Enrollment::create($context + ['student_id' => $user->id, 'status' => 'validated']);
        $profile = StudentProfile::create(['user_id' => $user->id, 'student_status' => 'active']);

        return $profile->enrollments()->create($context + ['application_id' => $application->id, 'enrollment_status' => 'confirmed', 'currency' => 'USD']);
    }
}

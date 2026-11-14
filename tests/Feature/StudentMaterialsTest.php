<?php

namespace Tests\Feature;

use App\Models\Classes;
use App\Models\Courses;
use App\Models\Intake;
use App\Models\Professor;
use App\Models\Student\AcademicOffering;
use App\Models\Student\AcademicResource;
use App\Models\Student\AcademicSession;
use App\Models\Student\AccessRule;
use App\Models\Student\StudentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

final class StudentMaterialsTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    public function test_student_library_classifies_real_published_supports_and_reuses_private_file_routes(): void
    {
        Storage::fake('local');
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $course = Courses::forceCreate(['title' => 'Base de données', 'level_id' => $entry->level_id]);
        $author = User::factory()->create();
        Professor::create(['first_name' => 'Alice', 'last_name' => 'Kiala', 'email' => $author->email])->forceFill(['user_id' => $author->id])->save();
        $offering = AcademicOffering::create(['level_id' => $entry->level_id, 'academic_year_id' => $entry->academic_year_id, 'course_id' => $course->id, 'is_published' => true]);
        AccessRule::create(['feature' => 'materials_download', 'level_id' => $entry->level_id, 'mode' => 'open', 'is_active' => true]);
        $td = $this->makeSession($offering, 'TD');
        $exam = $this->makeSession($offering, 'Examen');
        $pdf = "%PDF-1.4\ncontenu de test\n%%EOF\n";
        Storage::disk('local')->put('learning-content/sujet.pdf', $pdf);
        $material = $this->support($offering, 'Conception des tables', [
            'body' => 'Lire le schéma et ses exemples.', 'path' => 'learning-content/sujet.pdf', 'filename' => 'sujet.pdf', 'mime' => 'application/pdf',
            'size_bytes' => strlen($pdf), 'academic_session_id' => $td->id, 'author_id' => $author->id, 'published_at' => now(),
        ]);
        $courseSupport = $this->support($offering, 'Comprendre les examens', ['body' => 'Texte de ce support.']);
        $this->support($offering, 'Corrigé de session', ['academic_session_id' => $exam->id]);
        $this->support($offering, 'Lien de cours', ['kind' => 'online', 'url' => 'https://example.test/cours']);

        $index = route('dashboard.student.materials.index', ['academic' => $entry->id]);
        $detail = route('dashboard.student.materials.show', ['resource' => $material->id, 'academic' => $entry->id, 'filter' => 'practical']);
        $preview = route('dashboard.student.resources.preview', ['resource' => $material->id, 'academic' => $entry->id], false);
        $download = route('dashboard.student.resources.download', ['resource' => $material->id, 'academic' => $entry->id], false);
        $this->actingAs($student)->get($index)->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('dashboard/student/Materials')->where('materials.stats.total', 4)->where('materials.stats.courses', 1)
            ->where('materials.stats.recent', 4)->where('materials.filters.1.count', 2)->where('materials.filters.2.count', 1)
            ->where('materials.filters.3.count', 1)->has('materials.items.data', 4)
            ->where('materials.items.data', fn ($rows) => collect($rows)->every(fn ($row) => $row['description'] === null)));
        $this->get($index.'&filter=practical')->assertInertia(fn (Assert $page) => $page
            ->has('materials.items.data', 1)->where('materials.items.data.0.category', 'practical')->where('materials.items.data.0.id', $material->id));
        $this->get($detail)->assertInertia(fn (Assert $page) => $page
            ->where('materials.selected.description', 'Lire le schéma et ses exemples.')
            ->where('materials.selected.teacher', 'Alice Kiala')->where('materials.selected.course', 'Base de données')
            ->where('materials.selected.format', 'PDF')->where('materials.selected.size_bytes', strlen($pdf))
            ->where('materials.selected.preview_url', $preview)->where('materials.selected.download_url', $download)
            ->where('materials.selected.share_url', route('dashboard.student.materials.show', ['resource' => $material->id], false))
            ->where('materials.index_url', route('dashboard.student.materials.index', ['academic' => $entry->id, 'filter' => 'practical'], false))
            ->has('materials.related', 3)->missing('materials.selected.path'));
        $this->get($preview)->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->get($download)->assertOk()->assertDownload('sujet.pdf');
        $this->get($index.'&filter=saved&saved='.$courseSupport->id)->assertInertia(fn (Assert $page) => $page
            ->has('materials.items.data', 1)->where('materials.items.data.0.id', $courseSupport->id)->where('materials.items.data.0.category', 'course'));

        $anotherLevel = $entry->level->replicate()->fill(['title' => 'Autre niveau', 'code' => 'T2']);
        $anotherLevel->save();
        $anotherEntry = $entry->replicate()->fill(['level_id' => $anotherLevel->id]);
        $anotherEntry->save();
        $share = route('dashboard.student.materials.show', ['resource' => $material->id]);
        $this->get($share.'?academic='.$anotherEntry->id)->assertNotFound();
        $this->get($share)->assertInertia(fn (Assert $page) => $page->where('materials.academic_id', $entry->id)
            ->where('materials.selected.id', $material->id));
    }

    public function test_materials_detail_and_bookmarks_obey_publication_audience_and_parent_permissions(): void
    {
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $course = Courses::forceCreate(['title' => 'Réseaux', 'level_id' => $entry->level_id]);
        $offering = AcademicOffering::create(['level_id' => $entry->level_id, 'academic_year_id' => $entry->academic_year_id, 'course_id' => $course->id, 'is_published' => true]);
        $intake = Intake::create(['name' => 'Promotion distincte']);
        $class = Classes::forceCreate(['faculty_id' => $entry->level->faculty_id, 'level_id' => $entry->level_id, 'intake_id' => $intake->id]);
        $otherOffering = AcademicOffering::create(['level_id' => $entry->level_id, 'academic_year_id' => $entry->academic_year_id, 'course_id' => $course->id, 'class_id' => $class->id, 'is_published' => true]);
        $otherProfile = StudentProfile::create(['user_id' => User::factory()->create()->id, 'student_status' => 'active']);
        $assessment = $this->support($offering, 'Sujet de l’évaluation', ['kind' => 'evaluation']);
        $hidden = [
            $this->support($offering, 'Non publié', ['is_published' => false]),
            $this->support($offering, 'Archivé', ['archived_at' => now()]),
            $this->support($offering, 'Pour un autre étudiant', ['student_profile_id' => $otherProfile->id]),
            $this->support($otherOffering, 'Pour un autre groupe'),
            $this->support($offering, 'Réservé à l’évaluation', ['supplementary_for_id' => $assessment->id]),
            $assessment,
            $this->support($offering, 'Ouverture à venir', ['opens_at' => now()->addDay()]),
        ];
        $visible = $this->support($offering, 'Notes du cours', ['body' => 'Contenu réservé', 'path' => 'learning-content/notes.pdf']);
        $index = route('dashboard.student.materials.index');
        $this->actingAs($student)->get($index)->assertInertia(fn (Assert $page) => $page
            ->has('materials.items.data', 1)->where('materials.items.data.0.id', $visible->id));
        foreach ($hidden as $row) {
            $this->get(route('dashboard.student.materials.show', ['resource' => $row->id]))->assertNotFound();
        }
        $this->get($index.'?filter=saved&saved='.implode(',', array_map(fn ($row) => $row->id, $hidden)))->assertInertia(fn (Assert $page) => $page
            ->has('materials.items.data', 0)->where('materials.stats.total', 1));
        $this->get(route('dashboard.student.materials.show', ['resource' => $visible->id]))->assertInertia(fn (Assert $page) => $page
            ->where('materials.selected.description', null)->where('materials.selected.preview_url', null)->where('materials.selected.download_url', null));
    }

    private function makeSession(AcademicOffering $offering, string $type): AcademicSession
    {
        return AcademicSession::create([
            'academic_offering_id' => $offering->id, 'starts_at' => now()->subHours(2), 'ends_at' => now()->subHour(),
            'is_published' => true, 'room' => 'A', 'activity_type' => $type,
        ]);
    }

    private function support(AcademicOffering $offering, string $title, array $overrides = []): AcademicResource
    {
        return $offering->resources()->create($overrides + ['kind' => 'material', 'title' => $title, 'is_published' => true]);
    }
}

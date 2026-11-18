<?php

namespace Tests\Feature;

use App\Models\Classes;
use App\Models\Courses;
use App\Models\Enrollment;
use App\Models\Faculty;
use App\Models\Intake;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicOffering;
use App\Models\Student\AcademicResource;
use App\Models\Student\AccessRule;
use App\Models\Student\StudentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

final class StudentAnnouncementsTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    public function test_announcements_show_real_media_and_dates_and_keep_the_list_context(): void
    {
        Storage::fake('local');
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $offering = $this->offering($entry);
        $old = $this->announcement($offering, 'Information précédente', ['published_at' => now()->subDays(8)]);
        $photo = $this->announcement($offering, 'Journée portes ouvertes', [
            'path' => 'academic-resources/campus.png', 'filename' => 'campus.png', 'mime' => 'image/png',
            'published_at' => now()->subDay(),
        ]);
        Storage::disk('local')->put('academic-resources/campus.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l3sAAAAASUVORK5CYII='));
        $video = $this->announcement($offering, 'Conférence', ['url' => 'https://www.youtube.com/watch?v=jfKfPfyJRdk', 'published_at' => now()->subDays(2)]);
        $pdf = "%PDF-1.4\ncontenu de test\n%%EOF\n";
        Storage::disk('local')->put('academic-resources/calendrier.pdf', $pdf);
        $document = $this->announcement($offering, 'Calendrier des examens', [
            'body' => 'Les dates de la session sont disponibles dans le calendrier.', 'path' => 'academic-resources/calendrier.pdf',
            'filename' => 'calendrier.pdf', 'mime' => 'application/pdf', 'size_bytes' => strlen($pdf), 'published_at' => now(),
        ]);
        $index = route('dashboard.student.announcements', ['academic' => $entry->id]);
        $fileParameters = ['resource' => $document->id, 'academic' => $entry->id];
        $preview = route('dashboard.student.resources.preview', $fileParameters, false);
        $download = route('dashboard.student.resources.download', $fileParameters, false);
        $share = route('dashboard.student.announcements', ['announcement' => $document->id], false);

        $this->actingAs($student)->get($index)->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('dashboard/student/Announcements')
            ->where('announcements.academic_id', $entry->id)->where('announcements.faculty', $entry->level->faculty->name)
            ->where('announcements.stats.total', 4)->where('announcements.stats.recent', 3)->where('announcements.stats.media', 3)
            ->where('announcements.featured.id', $document->id)->has('announcements.items.data', 4)
            ->where('announcements.items.data.0.id', $document->id)->where('announcements.items.data.0.description', null)
            ->where('announcements.items.data.1.id', $photo->id)->where('announcements.items.data.1.kind', 'photo')
            ->where('announcements.items.data.2.id', $video->id)->where('announcements.items.data.2.kind', 'video')
            ->where('announcements.items.data.2.source_url', $video->url)->where('announcements.items.data.2.preview_url', null)
            ->where('announcements.items.data.3.id', $old->id)->where('announcements.items.data.3.recent', false));
        $this->get($index.'&filter=photo')->assertInertia(fn (Assert $page) => $page
            ->where('announcements.featured', null)->has('announcements.items.data', 1)
            ->where('announcements.items.data.0.id', $photo->id));
        $this->get($index.'&filter=saved&saved='.$video->id)->assertInertia(fn (Assert $page) => $page
            ->has('announcements.items.data', 1)->where('announcements.items.data.0.id', $video->id));
        $this->get($index.'&filter=document&announcements_page=2&announcement='.$document->id)->assertInertia(fn (Assert $page) => $page
            ->where('announcements.selected.description', $document->body)->where('announcements.selected.kind', 'document')
            ->where('announcements.selected.preview_url', $preview)->where('announcements.selected.download_url', $download)
            ->where('announcements.selected.share_url', $share)->where('announcements.selected.size_bytes', strlen($pdf))
            ->where('announcements.index_url', route('dashboard.student.announcements', ['academic' => $entry->id, 'filter' => 'document', 'announcements_page' => 2], false))
            ->has('announcements.related', 3)->missing('announcements.selected.path'));
        $this->get($share)->assertInertia(fn (Assert $page) => $page->where('announcements.selected.id', $document->id));
        $this->get($preview)->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->get(route('dashboard.student.resources.preview', ['resource' => $photo->id, 'academic' => $entry->id]))
            ->assertOk()->assertHeader('Content-Type', 'image/png');
        $this->get($download)->assertOk()->assertDownload('calendrier.pdf');
        $this->get('/app/dashboard/student')->assertInertia(fn (Assert $page) => $page
            ->where('overview.announcements.0.id', $document->id)->where('overview.announcements.0.preview_url', $preview)
            ->where('overview.announcements.0.detail_url', route('dashboard.student.announcements', ['academic' => $entry->id, 'announcement' => $document->id], false)));

        $otherLevel = $entry->level->replicate()->fill(['title' => 'Autre niveau', 'code' => 'A2']);
        $otherLevel->save();
        $otherApplication = Enrollment::create([
            'student_id' => $student->id, 'level_id' => $otherLevel->id, 'academic_year_id' => $entry->academic_year_id,
            'status' => 'validated',
        ]);
        $otherEntry = $entry->replicate()->fill(['level_id' => $otherLevel->id, 'application_id' => $otherApplication->id]);
        $otherEntry->save();
        $this->get($share.'&academic='.$otherEntry->id)->assertNotFound();
        $this->get($share)->assertInertia(fn (Assert $page) => $page->where('announcements.academic_id', $entry->id));
    }

    public function test_announcement_detail_and_previews_respect_publication_and_audience(): void
    {
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $offering = $this->offering($entry);
        $group = Classes::forceCreate([
            'faculty_id' => $entry->level->faculty_id, 'level_id' => $entry->level_id,
            'intake_id' => Intake::create(['name' => 'Autre promotion'])->id,
        ]);
        $otherOffering = $this->offering($entry, $group->id);
        $otherProfile = StudentProfile::create(['user_id' => User::factory()->create()->id, 'student_status' => 'active']);
        $file = ['path' => 'academic-resources/calendrier.pdf', 'filename' => 'calendrier.pdf', 'mime' => 'application/pdf'];
        $hidden = [
            $this->announcement($offering, 'Brouillon', ['is_published' => false] + $file),
            $this->announcement($offering, 'Annonce archivée', ['archived_at' => now()] + $file),
            $this->announcement($offering, 'Annonce personnelle', ['student_profile_id' => $otherProfile->id] + $file),
            $this->announcement($otherOffering, 'Annonce de l’autre groupe', $file),
            $this->announcement($offering, 'Autre type de ressource', ['kind' => 'evaluation']),
        ];
        $visible = $this->announcement($offering, 'Annonce de la promotion');
        $index = route('dashboard.student.announcements');

        $this->actingAs($student)->get($index)->assertInertia(fn (Assert $page) => $page
            ->where('announcements.stats.total', 1)->where('announcements.items.data.0.id', $visible->id));
        foreach ($hidden as $row) {
            $this->get($index.'?announcement='.$row->id)->assertNotFound();
        }
        foreach (array_slice($hidden, 0, 4) as $row) {
            $this->get(route('dashboard.student.resources.preview', ['resource' => $row->id]))->assertNotFound();
        }
        $this->get($index.'?filter=saved&saved='.implode(',', array_column($hidden, 'id')))
            ->assertInertia(fn (Assert $page) => $page->has('announcements.items.data', 0));

        AccessRule::create(['feature' => 'courses_view', 'level_id' => $entry->level_id, 'mode' => 'hidden', 'is_active' => true]);
        $this->get($index.'?academic='.$entry->id.'&announcement='.$visible->id)->assertForbidden();
    }

    public function test_administration_records_when_a_draft_announcement_is_published(): void
    {
        Storage::fake('local');
        $student = $this->studentContext();
        $offering = $this->offering($student->studentProfile->enrollments()->sole());
        $admin = User::factory()->create();
        $admin->assignRole(Role::findOrCreate('admin', 'web'))->givePermissionTo(Permission::findOrCreate('publish academic content', 'web'));
        $contents = "%PDF-1.4\ncontenu de test\n%%EOF\n";

        $this->actingAs($admin)->post(route('dashboard.admin.student-academic.resources'), [
            'academic_offering_id' => $offering->id, 'kind' => 'announcement', 'title' => 'Calendrier de session',
            'file' => UploadedFile::fake()->createWithContent('calendrier.pdf', $contents),
        ])->assertSessionHasNoErrors();
        $draft = $offering->resources()->where('kind', 'announcement')->sole();
        $this->assertNull($draft->published_at);
        $this->assertSame(strlen($contents), $draft->size_bytes);

        $this->travel(8)->days();
        $this->post(route('dashboard.admin.student-academic.publish', ['type' => 'resources', 'id' => $draft->id]), [
            'is_published' => true, 'reason' => 'Le calendrier est validé.',
        ])->assertSessionHasNoErrors();
        $this->assertTrue($draft->fresh()->published_at->isToday());
        $this->actingAs($student)->get(route('dashboard.student.announcements'))->assertInertia(fn (Assert $page) => $page
            ->where('announcements.stats.recent', 1)->where('announcements.featured.id', $draft->id));
    }

    public function test_announcement_publication_windows_apply_to_list_detail_overview_and_private_media(): void
    {
        $this->travelTo(now()->startOfSecond()->addMicroseconds(500000));
        Storage::fake('local');
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $offering = $this->offering($entry);
        $file = ['path' => 'academic-resources/calendar.pdf', 'filename' => 'calendar.pdf', 'mime' => 'application/pdf'];
        Storage::disk('local')->put($file['path'], "%PDF-1.4\ncalendrier de test\n%%EOF\n");
        $visible = $this->announcement($offering, 'Annonce à la limite de validité', [
            'published_at' => now(), 'opens_at' => now(), 'closes_at' => now(),
        ] + $file);
        $hidden = [
            $this->announcement($offering, 'Publication future', ['published_at' => now()->addDay()] + $file),
            $this->announcement($offering, 'Annonce à venir', ['opens_at' => now()->addMinute()] + $file),
            $this->announcement($offering, 'Annonce expirée', ['closes_at' => now()->subMinute()] + $file),
        ];
        $index = route('dashboard.student.announcements', ['academic' => $entry->id]);

        $this->actingAs($student)->get($index)->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('announcements.stats.total', 1)->has('announcements.items.data', 1)
            ->where('announcements.items.data.0.id', $visible->id));
        $this->get('/app/dashboard/student?academic='.$entry->id)->assertInertia(fn (Assert $page) => $page
            ->has('overview.announcements', 1)->where('overview.announcements.0.id', $visible->id));
        $this->get($index.'&announcement='.$visible->id)->assertOk();
        $preview = $this->get(route('dashboard.student.resources.preview', ['resource' => $visible->id, 'academic' => $entry->id]))
            ->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->assertTrue($preview->baseResponse->headers->hasCacheControlDirective('no-store'));
        $this->assertTrue($preview->baseResponse->headers->hasCacheControlDirective('private'));
        foreach ($hidden as $row) {
            $this->get($index.'&announcement='.$row->id)->assertNotFound();
            $this->get(route('dashboard.student.announcements', ['announcement' => $row->id]))->assertNotFound();
            foreach (['preview', 'download'] as $action) {
                $this->get(route('dashboard.student.resources.'.$action, ['resource' => $row->id, 'academic' => $entry->id]))->assertNotFound();
            }
        }
    }

    public function test_announcements_remain_scoped_to_the_students_faculty_and_course(): void
    {
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $visible = $this->announcement($this->offering($entry), 'Annonce du cours autorisé');
        $faculty = Faculty::create(['name' => 'Autre faculté', 'code' => 'AUTRE']);
        $level = $entry->level->replicate()->fill(['faculty_id' => $faculty->id, 'title' => 'Autre niveau', 'code' => 'A2']);
        $level->save();
        $other = User::factory()->create();
        $other->assignRole(Role::findOrCreate('student', 'web'));
        $application = Enrollment::create(['student_id' => $other->id, 'level_id' => $level->id, 'academic_year_id' => $entry->academic_year_id, 'status' => 'validated']);
        $profile = StudentProfile::create(['user_id' => $other->id, 'student_status' => 'active']);
        $otherEntry = AcademicEnrollment::create([
            'student_profile_id' => $profile->id, 'application_id' => $application->id, 'level_id' => $level->id,
            'academic_year_id' => $entry->academic_year_id, 'enrollment_status' => 'confirmed', 'currency' => 'USD',
        ]);
        $foreign = $this->announcement($this->offering($otherEntry), 'Annonce de l’autre faculté', [
            'path' => 'academic-resources/foreign.pdf', 'filename' => 'foreign.pdf', 'mime' => 'application/pdf',
        ]);

        $this->actingAs($student)->get(route('dashboard.student.announcements'))->assertInertia(fn (Assert $page) => $page
            ->has('announcements.items.data', 1)->where('announcements.items.data.0.id', $visible->id));
        $this->get(route('dashboard.student.announcements', ['announcement' => $foreign->id]))->assertNotFound();
        foreach (['preview', 'download'] as $action) {
            $this->get(route('dashboard.student.resources.'.$action, ['resource' => $foreign->id]))->assertNotFound();
        }
        $this->actingAs($other)->get(route('dashboard.student.announcements'))->assertInertia(fn (Assert $page) => $page
            ->has('announcements.items.data', 1)->where('announcements.items.data.0.id', $foreign->id));
        $this->get(route('dashboard.student.announcements', ['announcement' => $visible->id]))->assertNotFound();
    }

    public function test_empty_announcements_and_nullable_text_fields_are_presented_without_media(): void
    {
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $index = route('dashboard.student.announcements');
        $this->actingAs($student)->get($index)->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('announcements.stats.total', 0)->where('announcements.featured', null)
            ->has('announcements.items.data', 0)->has('announcements.related', 0));
        $row = $this->announcement($this->offering($entry), 'Annonce textuelle', [
            'body' => null, 'url' => null, 'path' => null, 'mime' => null, 'filename' => null, 'published_at' => null,
        ]);
        $this->get($index.'?announcement='.$row->id)->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('announcements.selected.kind', 'text')->where('announcements.selected.description', null)
            ->where('announcements.selected.preview_url', null)->where('announcements.selected.download_url', null)
            ->where('announcements.selected.source_url', null));
    }

    private function offering(AcademicEnrollment $entry, ?int $group = null): AcademicOffering
    {
        $course = Courses::forceCreate(['title' => 'Base de données', 'level_id' => $entry->level_id]);

        return AcademicOffering::create([
            'level_id' => $entry->level_id, 'academic_year_id' => $entry->academic_year_id,
            'course_id' => $course->id, 'is_published' => true, 'class_id' => $group,
        ]);
    }

    private function announcement(AcademicOffering $offering, string $title, array $overrides = []): AcademicResource
    {
        return $offering->resources()->create($overrides + ['kind' => 'announcement', 'title' => $title, 'is_published' => true]);
    }
}

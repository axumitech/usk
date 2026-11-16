<?php

namespace Tests\Feature;

use App\Models\Courses;
use App\Models\Professor;
use App\Models\Student\AcademicAttendance;
use App\Models\Student\AcademicOffering;
use App\Models\Student\AcademicSession;
use App\Models\Student\StudentNfcCard;
use App\Models\User;
use BaconQrCode\Renderer\GDLibRenderer;
use BaconQrCode\Writer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\URL;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

final class AttendanceCheckInTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    public function test_teacher_presents_a_temporary_qr_and_only_the_eligible_student_can_confirm(): void
    {
        [$teacher, $student, $session, $enrollment] = $this->context();
        $expiresAt = now()->addMinutes(2);
        $url = URL::temporarySignedRoute('dashboard.student.attendance.check-in', $expiresAt, $session->id);
        $image = (new Writer(new GDLibRenderer(520)))->writeString($url);

        $this->get($url)->assertRedirect(route('login.show'));
        $this->post(route('login'), ['email' => $student->email, 'password' => 'password'])->assertRedirect($url);
        $this->actingAs($this->teacher())->postJson(route('dashboard.teaching.attendance.qr', $session))->assertForbidden();
        $this->actingAs($teacher)->postJson(route('dashboard.teaching.attendance.qr', $session))
            ->assertOk()->assertJsonPath('expires_at', $expiresAt->toISOString())
            ->assertJsonPath('image', 'data:image/png;base64,'.base64_encode($image));
        $other = User::factory()->create();
        $other->assignRole(Role::findOrCreate('student', 'web'));
        $this->actingAs($other)->postJson($url)->assertForbidden();
        $this->actingAs($student)->postJson($url.'&changed=1')->assertForbidden();

        $this->get($url)->assertInertia(fn (Assert $page) => $page->component('dashboard/student/AttendanceCheckIn')
            ->where('course', 'Algorithmique')->where('existing', null));
        $this->assertDatabaseCount('academic_attendances', 0);
        $this->postJson($url)->assertOk()->assertJsonPath('duplicate', false)->assertJsonPath('status', 'present')
            ->assertJsonPath('checked_in_at', now()->toISOString());
        $this->travel(30)->seconds();
        $this->postJson($url)->assertOk()->assertJsonPath('duplicate', true);
        $this->assertDatabaseHas('academic_attendances', [
            'academic_session_id' => $session->id, 'academic_enrollment_id' => $enrollment,
            'recorded_by' => $student->id, 'source' => 'qr', 'status' => 'present',
        ]);
        $this->assertDatabaseCount('academic_attendances', 1);
        $this->assertSame(1, $session->fresh()->attendance_revision);
        $this->travel(2)->minutes();
        $this->postJson($url)->assertForbidden();
    }

    public function test_nfc_shares_the_attendance_record_and_cannot_change_a_manual_absence(): void
    {
        [$teacher, $student, $session, $enrollment] = $this->context();
        $nfc = route('dashboard.teaching.attendance.nfc', $session);
        $attendance = route('dashboard.teaching.attendance', $session);
        $url = URL::temporarySignedRoute('dashboard.student.attendance.check-in', now()->addMinutes(2), $session->id);
        $card = StudentNfcCard::create(['academic_enrollment_id' => $enrollment, 'uid_hash' => StudentNfcCard::fingerprint('04-E2-A9-12')]);
        $this->actingAs($teacher)->postJson($nfc, ['uid' => '1234'])->assertUnprocessable()->assertJsonValidationErrors('uid');
        $this->postJson($nfc, ['uid' => '04:e2:a9:12'])->assertOk()->assertJsonPath('duplicate', false)
            ->assertJsonPath('name', $student->full_name)->assertJsonPath('checked_in_at', now()->toISOString());
        $this->get($attendance)->assertInertia(fn (Assert $page) => $page->where('students.0.source', 'nfc')
            ->where('students.0.status', 'present')->where('students.0.checked_in_at', now()->toISOString()));
        $this->actingAs($student)->postJson($url)->assertOk()->assertJsonPath('duplicate', true);
        $this->assertDatabaseCount('academic_attendances', 1);
        $this->assertDatabaseHas('academic_attendances', ['recorded_by' => $teacher->id, 'source' => 'nfc']);
        $card->delete();
        $this->actingAs($teacher)->postJson($nfc, ['uid' => '04E2A912'])->assertUnprocessable();
        $card->newQuery()->create(['academic_enrollment_id' => $enrollment, 'uid_hash' => StudentNfcCard::fingerprint('AABB5678')]);
        AcademicAttendance::sole()->update(['status' => 'absent']);
        $this->postJson($nfc, ['uid' => 'AABB5678'])->assertConflict();
        $this->actingAs($student)->postJson($url)->assertConflict();
        $this->assertDatabaseHas('academic_attendances', ['status' => 'absent', 'source' => 'nfc']);
    }

    public function test_ended_and_closed_sessions_reject_scans_and_do_not_display_controls(): void
    {
        [$teacher, $student, $session, $enrollment] = $this->context();
        $session->update(['ends_at' => now()->addSeconds(30)]);
        $qr = route('dashboard.teaching.attendance.qr', $session);
        $nfc = route('dashboard.teaching.attendance.nfc', $session);
        $this->actingAs($teacher)->postJson($qr)->assertOk()->assertJsonPath('expires_at', $session->ends_at->toISOString());
        $session->update(['attendance_closed_at' => now()]);
        $this->postJson($qr)->assertUnprocessable();
        $this->get(route('dashboard.teaching.attendance', $session))->assertInertia(fn (Assert $page) => $page->where('checkIn', null));
        $session->update(['attendance_closed_at' => null]);
        $url = URL::temporarySignedRoute('dashboard.student.attendance.check-in', now()->addMinutes(2), $session->id);
        $this->travel(30)->seconds();
        $this->postJson($nfc, ['uid' => '04E2A912'])->assertUnprocessable();
        $this->actingAs($student)->postJson($url)->assertUnprocessable();
        $this->assertDatabaseMissing('academic_attendances', ['academic_enrollment_id' => $enrollment]);
    }

    private function context(): array
    {
        $this->travelTo(now()->setDate(2026, 11, 16)->setTime(10, 0));
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $teacher = $this->teacher();
        $professor = Professor::forceCreate(['user_id' => $teacher->id, 'first_name' => $teacher->first_name, 'last_name' => $teacher->last_name,
            'email' => $teacher->email, 'is_active' => true, 'photo' => 'professors/example.jpg']);
        $course = Courses::forceCreate(['level_id' => $entry->level_id, 'title' => 'Algorithmique', 'credits' => 3]);
        $offering = AcademicOffering::create([
            'course_id' => $course->id, 'level_id' => $entry->level_id, 'academic_year_id' => $entry->academic_year_id,
            'professor_id' => $professor->id, 'is_published' => true,
        ]);
        $session = AcademicSession::create([
            'academic_offering_id' => $offering->id, 'starts_at' => now()->subMinute(), 'ends_at' => now()->addHour(), 'is_published' => true,
            'room' => 'Salle A',
        ]);

        return [$teacher, $student, $session, $entry->id];
    }

    private function teacher(): User
    {
        $user = User::factory()->create();
        $user->assignRole(Role::findOrCreate('professor', 'web'));
        $user->givePermissionTo(Permission::findOrCreate('manage students', 'web'));

        return $user;
    }
}

<?php

namespace Tests\Feature;

use App\Models\Enrollment;
use App\Models\Student\AcademicAudit;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\StudentNfcCard;
use App\Models\Student\StudentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

final class StudentNfcCardTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    public function test_nfc_card_can_be_registered_replaced_and_removed_without_storing_its_uid(): void
    {
        $student = $this->studentContext();
        $student->update(['first_name' => 'Mireille', 'post_name' => 'Ilunga', 'last_name' => 'Kamba']);
        $entry = $student->studentProfile->enrollments()->sole();
        $entry->update(['matricule' => 'UMK-01234']);
        $other = $this->makeAnotherEnrollment($entry);
        $admin = $this->admin();
        $admin->academicFaculties()->attach($entry->level->faculty_id);
        $index = route('dashboard.admin.card-issuance.nfc.index');
        $assign = route('dashboard.admin.card-issuance.nfc.assign', $entry);
        $remove = route('dashboard.admin.card-issuance.nfc.remove', $entry);
        $uid = 'ab:01:02:03';
        $normalizedUid = 'AB010203';
        $newUid = '01020304';

        $this->actingAs($admin)->get($index.'?q=Mireille+Kamba')->assertInertia(fn (Assert $page) => $page
            ->component('dashboard/cardIssuance/NfcCards')->where('term', 'Mireille Kamba')
            ->where('rows.total', 1)->where('rows.data.0.id', $entry->id)->where('rows.data.0.name', 'Mireille Ilunga Kamba')
            ->where('rows.data.0.eligible', true)->where('rows.data.0.linked', false));
        $this->from($index)->put($assign, ['uid' => $uid])->assertStatus(303)->assertRedirect($index)->assertSessionHasNoErrors();
        $hash = $entry->nfcCard()->sole()->uid_hash;
        $this->assertSame(StudentNfcCard::fingerprint($normalizedUid), $hash);
        $this->assertNotSame($normalizedUid, $hash);
        $this->put($assign, ['uid' => $normalizedUid])->assertStatus(303);
        $this->assertSame(1, AcademicAudit::where('action', 'student_nfc_card_linked')->where('entity_id', $entry->id)->count());

        $this->put(route('dashboard.admin.card-issuance.nfc.assign', $other), ['uid' => $normalizedUid])->assertSessionHasErrors('uid');
        $this->assertFalse($other->nfcCard()->exists());
        $this->put($assign, ['uid' => $newUid])->assertStatus(303);
        $this->assertSame(StudentNfcCard::fingerprint($newUid), $entry->nfcCard()->sole()->uid_hash);

        $entry->profile->update(['student_status' => 'suspended']);
        $this->get($index.'?q=UMK-01234')->assertInertia(fn (Assert $page) => $page
            ->where('rows.total', 1)->where('rows.data.0.eligible', false)->where('rows.data.0.linked', true)
            ->missing('rows.data.0.uid_hash')->missing('rows.data.0.uid'));
        $this->put($assign, ['uid' => $uid])->assertSessionHasErrors('uid');
        $this->delete($remove)->assertStatus(303);
        $this->assertDatabaseMissing('student_nfc_cards', ['academic_enrollment_id' => $entry->id]);
        $this->get($index.'?q=UMK-01234')->assertInertia(fn (Assert $page) => $page->where('rows.total', 0));
        $audits = AcademicAudit::where('entity_type', 'academic_enrollments')->where('entity_id', $entry->id)
            ->where('action', 'like', 'student_nfc_card_%')->orderBy('id')->get();
        $this->assertSame(['student_nfc_card_linked', 'student_nfc_card_replaced', 'student_nfc_card_removed'], $audits->pluck('action')->all());
        $this->assertFalse($audits->contains(fn (AcademicAudit $audit) => $audit->data !== [] || $audit->reason !== null));
    }

    public function test_nfc_cards_are_limited_to_authorized_academic_staff_and_faculties(): void
    {
        $student = $this->studentContext();
        $entry = $student->studentProfile->enrollments()->sole();
        $index = route('dashboard.admin.card-issuance.nfc.index');
        $assign = route('dashboard.admin.card-issuance.nfc.assign', $entry);
        $remove = route('dashboard.admin.card-issuance.nfc.remove', $entry);
        $this->actingAs($student)->get($index)->assertForbidden();
        Role::findByName('admin', 'web')->revokePermissionTo('manage academic access');
        $this->actingAs($this->admin(withPermission: false))->get($index)->assertForbidden();

        $admin = $this->admin();
        $admin->academicFaculties()->attach(DB::table('faculties')->insertGetId(['name' => 'Faculté externe', 'code' => 'EXT']));
        $this->actingAs($admin)->get($index)->assertInertia(fn (Assert $page) => $page->where('rows.total', 0));
        $this->put($assign, ['uid' => 'AB010203'])->assertNotFound();
        $this->delete($remove)->assertNotFound();
    }

    private function makeAnotherEnrollment(AcademicEnrollment $original): AcademicEnrollment
    {
        $user = User::factory()->create();
        $profile = StudentProfile::create(['user_id' => $user->id, 'student_status' => 'active']);
        $application = Enrollment::create([
            'student_id' => $user->id, 'level_id' => $original->level_id, 'academic_year_id' => $original->academic_year_id, 'status' => 'validated',
        ]);
        $entry = $original->replicate()->fill(['student_profile_id' => $profile->id, 'application_id' => $application->id, 'matricule' => null]);
        $entry->save();

        return $entry;
    }

    private function admin(bool $withPermission = true): User
    {
        $user = User::factory()->create();
        $user->assignRole(Role::findOrCreate('admin', 'web'));
        if ($withPermission) {
            $user->givePermissionTo(Permission::findOrCreate('manage academic access', 'web'));
        }

        return $user;
    }
}

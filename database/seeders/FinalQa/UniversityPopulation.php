<?php

namespace Database\Seeders\FinalQa;

use App\Models\Student\AcademicAttendance;
use App\Models\Student\AcademicEnrollment;
use App\Models\Student\AcademicOfficialResult;
use App\Models\Student\AcademicProgression;
use App\Models\User;
use App\Modules\Documents\Application\DocumentPdf;
use App\Modules\Student\Application\Services\AcademicEnrollmentService;
use App\Modules\Student\Application\Services\AcademicProgressionService;
use App\Modules\Student\Application\Services\Audit;
use App\Modules\Student\Application\Services\FeeTariffService;
use App\Modules\Student\Application\Services\StudentFinanceService;
use App\Modules\Student\Application\Services\StudentPaymentProofs;
use Database\Seeders\RecetteV2\HistoricalAcademicFixtures;
use Database\Seeders\RecetteV2\StudentFinanceFixtures;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class UniversityPopulation
{
    public function __construct(private StudentFinanceFixtures $finance, private HistoricalAcademicFixtures $history) {}

    public function historical(array $catalog, User $admin, UniversityAccounts $accounts): array
    {
        $students = [];
        foreach (array_keys($catalog['programs']) as $departmentIndex => $key) {
            $cashier = $this->staff($catalog, $key, 'finance-officer');
            $levels = array_keys($catalog['levels'][$key]);
            for ($position = 0; $position < 20; $position++) {
                $level = $levels[$position < 12 ? 0 : 1];
                $student = $accounts->student($key, $departmentIndex, $position);
                $entry = $this->finance->admit($student, $admin, $catalog, 'past', $key, $level);
                if ($position === 0 || $position === 1) {
                    app(StudentFinanceService::class)->adjust($entry, $cashier, [
                        'type' => $position === 0 ? 'scholarship' : 'reduction', 'fee_kind' => 'tuition', 'amount' => '20.00',
                        'funding_source' => 'institution', 'starts_at' => $catalog['past_year']->start_date,
                        'expires_at' => $catalog['past_year']->end_date, 'operation_key' => (string) Str::uuid(), 'reason' => UniversityCatalog::REASON,
                    ]);
                }
                $amount = $position < 2 ? '80.00' : ($position % 3 === 0 ? '40.00' : '100.00');
                $this->finance->pay($entry, $cashier, $admin, $amount, $this->finance->firstObligation($entry), 'past-'.$key.'-'.$position);
                $this->finance->register($entry->refresh(), $admin, $catalog, 'past', $key, $level);
                $local = strstr($student->email, '@', true);
                $students[$key][$level][$local] = $entry;
            }
            fwrite(STDERR, "Admissions historiques préparées pour $key (20).".PHP_EOL);
        }

        return $students;
    }

    private function staff(array $catalog, string $key, string $role): User
    {
        return User::where('email', $role.'.'.$catalog['faculty_codes'][$key].'@usk.test')->sole();
    }

    public function results(array $catalog, array $students, User $admin): void
    {
        foreach ($students as $key => $byLevel) {
            $teacher = User::findOrFail($catalog['professors'][$key]->user_id);
            $publisher = $this->staff($catalog, $key, 'dean');
            foreach ($byLevel as $level => $entries) {
                $decisions = $scores = $sources = [];
                foreach (array_keys($entries) as $index => $local) {
                    $decisions[$local] = match ($index % 5) { 2 => 'repeat_demo', 3 => 'resit_demo', default => 'pass_demo' };
                    $scores[$local] = match ($decisions[$local]) {
                        'repeat_demo' => ['6.00', '8.00'], 'resit_demo' => ['11.00', '8.00'], default => ['16.00', '14.00'],
                    };
                }
                foreach ($catalog['offerings']['past'][$key][$level] as $index => $offer) {
                    $resources = $this->history->work($offer, $teacher, $admin, $entries, $index, $scores);
                    foreach ($resources as $resource) {
                        $sources[$offer->curriculum_item_id][$resource->assessment()->sole()->id] = 5000;
                    }
                    $session = $offer->sessions()->sole();
                    Carbon::withTestNow($session->ends_at->copy()->addHour(), function () use ($session, $offer, $entries, $teacher, $admin) {
                        foreach (array_values($entries) as $position => $entry) {
                            $registration = $offer->registrations()->where('academic_enrollment_id', $entry->id)->sole();
                            $record = AcademicAttendance::create(['academic_session_id' => $session->id, 'academic_enrollment_id' => $entry->id,
                                'academic_course_registration_id' => $registration->id, 'status' => $position % 5 === 0 ? 'absent' : 'present',
                                'recorded_by' => $teacher->id]);
                            Audit::record($teacher->id, 'attendance_status_changed', $record, UniversityCatalog::REASON, ['to' => $record->status]);
                            if ($position === 0) {
                                app(UniversityRecords::class)->justify($record, $entry->profile->user, $admin);
                            }
                        }
                        $session->update(['attendance_closed_at' => now(), 'attendance_revision' => 1]);
                        Audit::record($teacher->id, 'attendance_recorded', $session, UniversityCatalog::REASON, ['count' => count($entries)]);
                    });
                }
                app(UniversityRecords::class)->practice($catalog['offerings']['past'][$key][$level][0], $teacher, $entries);
                Carbon::withTestNow('2026-06-20 10:00:00 Africa/Kinshasa',
                    fn () => $this->history->deliberation($admin, $publisher, $catalog, $key, $sources, $level, $decisions, true));
                Carbon::withTestNow('2026-06-22 10:00:00 Africa/Kinshasa',
                    fn () => app(UniversityRecords::class)->appeal(array_values($entries)[2], $admin, $publisher));
                Carbon::withTestNow('2026-09-20 10:00:00 Africa/Kinshasa', function () use ($entries, $admin) {
                    foreach ($entries as $entry) {
                        $entry->refresh();
                        app(AcademicEnrollmentService::class)->transition($entry, $admin, [
                            'expected_status' => 'confirmed', 'expected_context' => AcademicEnrollmentService::contextToken($entry),
                            'enrollment_status' => 'completed', 'operation_key' => (string) Str::uuid(), 'reason' => UniversityCatalog::REASON,
                        ]);
                    }
                });
            }
            fwrite(STDERR, "Jurys et présences historiques préparés pour $key.".PHP_EOL);
        }
    }

    public function renew(array $catalog, array $students, User $admin, UniversityAccounts $accounts): void
    {
        $service = app(AcademicProgressionService::class);
        foreach ($students as $key => $byLevel) {
            $levels = array_keys($catalog['levels'][$key]);
            $cashier = $this->staff($catalog, $key, 'finance-officer');
            $newSurnames = ['dpu' => 'Mabiala', 'dpr' => 'Kayembe', 'scl' => 'Nlandu', 'sbm' => 'Kabasele', 'epi' => 'Tshilumba',
                'sco' => 'Mabika', 'soc' => 'Mutombo', 'adm' => 'Ntumba', 'the' => 'Lufungula', 'rel' => 'Samba'];
            $newStudent = $accounts->create('nouveau.'.$key, 'Solange', $newSurnames[$key], 'user', 'female');
            $new = $this->finance->admit($newStudent, $admin, $catalog, 'current', $key, $levels[0]);
            $this->finance->pay($new, $cashier, $admin, '30.00', $this->finance->firstObligation($new), 'admission-'.$key);
            $this->finance->register($new->refresh(), $admin, $catalog, 'current', $key, $levels[0]);
            foreach ($byLevel as $sourceLevel => $entries) {
                $position = array_search($sourceLevel, $levels, true);
                foreach (array_values($entries) as $index => $entry) {
                    $result = AcademicOfficialResult::published()->where('academic_enrollment_id', $entry->id)->sole();
                    $targetLevel = match ($result->decision) {
                        'repeat_demo' => $sourceLevel, 'pass_demo' => $levels[$position + 1] ?? null, default => null,
                    };
                    if ($targetLevel === null) {
                        continue;
                    }
                    $service->decide($entry->refresh(), $admin, ['level_id' => $catalog['levels'][$key][$targetLevel]->id,
                        'academic_year_id' => $catalog['current_year']->id, 'academic_official_result_id' => $result->id,
                        'target_curriculum_version_id' => $catalog['versions']['current'][$key]->id, 'reason' => UniversityCatalog::REASON]);
                    $decision = AcademicProgression::where('source_enrollment_id', $entry->id)->sole();
                    $target = $service->start($decision, $entry->profile);
                    app(FeeTariffService::class)->applyToEnrollment($target, $admin->id);
                    $this->finance->assignGroup($target, $admin, $catalog, 'current', $key, $targetLevel);
                    $amount = match ($index % 6) { 0 => '100.00', 1 => '29.00', 2 => '30.00', 4 => '0.00', default => '45.00' };
                    if ($amount !== '0.00') {
                        $this->finance->pay($target, $cashier, $admin, $amount, $this->finance->firstObligation($target), 'current-'.$target->id);
                    }
                    if ($target->refresh()->enrollment_status === 'confirmed') {
                        $this->finance->register($target, $admin, $catalog, 'current', $key, $targetLevel);
                    }
                    if ($index === 0 && $sourceLevel === $levels[0]) {
                        $entry->profile->user->assignRole('promotion-representative');
                        DB::table('promotion_representatives')->insert([
                            'user_id' => $entry->profile->user_id,
                            'academic_promotion_id' => $catalog['promotions']['current'][$key][$targetLevel]->id,
                        ]);
                    }
                    if ($index === 2) {
                        $ref = 'QA-JUST-'.$target->id;
                        $pdf = app(DocumentPdf::class)->render('<h1>Justificatif entièrement fictif</h1><p>'.$ref.'</p>');
                        app(StudentPaymentProofs::class)->submit($target, $entry->profile->user, ['amount' => '5.00', 'kind' => 'tuition',
                            'method' => 'bank_transfer', 'reference' => $ref], UploadedFile::fake()->createWithContent('justificatif-fictif.pdf', $pdf));
                    }
                    if ($index === 4) {
                        $finance = app(StudentFinanceService::class);
                        $payment = $finance->record($target, $cashier, ['kind' => 'unallocated', 'method' => 'bank_transfer', 'amount' => '12.00',
                            'reference' => 'QA-ANNULE-'.$target->id, 'note' => UniversityCatalog::REASON]);
                        $finance->transition($payment, $admin, 'cancelled', UniversityCatalog::REASON);
                    }
                }
            }
            fwrite(STDERR, "Réinscriptions préparées pour $key.".PHP_EOL);
        }
    }
}


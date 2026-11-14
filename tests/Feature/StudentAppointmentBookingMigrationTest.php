<?php

namespace Tests\Feature;

use Illuminate\Database\MySqlConnection;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Support\CreatesStudentContext;
use Tests\TestCase;

final class StudentAppointmentBookingMigrationTest extends TestCase
{
    use CreatesStudentContext, RefreshDatabase;

    private const MIGRATION = 'migrations/2026_11_14_130000_create_student_appointment_booking_tables.php';

    public function test_booking_migration_preserves_rows_and_recovers_a_partial_schema(): void
    {
        $student = $this->studentContext();
        $profile = $student->studentProfile;
        $request = $profile->enrollments()->sole()->serviceRequests()->create([
            'category' => 'appointment', 'procedure' => 'finance-appointment',
            'subject' => 'Rendez-vous financier', 'body' => 'Je souhaite faire vérifier mes frais universitaires.',
        ]);
        $table = 'student_appointment_reservations';
        DB::table($table)->insert([
            'student_service_request_id' => $request->id, 'student_profile_id' => $profile->id,
            'service' => 'finance-appointment', 'starts_at' => '2026-11-16 08:00:00',
        ]);
        DB::table('student_appointment_profile_locks')->insert(['student_profile_id' => $profile->id]);
        DB::table('student_appointment_schedules')->insert(['service' => 'finance-appointment', 'revision' => 3]);

        Schema::table($table, function (Blueprint $blueprint) {
            $blueprint->dropForeign(['student_service_request_id']);
            $blueprint->dropForeign(['student_profile_id']);
            $blueprint->dropUnique('student_appointment_reservation_slot');
            $blueprint->dropIndex('student_appointment_profile_time');
        });
        Schema::table('student_appointment_profile_locks', fn (Blueprint $blueprint) => $blueprint->dropForeign(['student_profile_id']));

        $migration = require database_path(self::MIGRATION);
        $migration->up();
        $migration->up();

        $this->assertDatabaseHas($table, ['student_service_request_id' => $request->id, 'student_profile_id' => $profile->id]);
        $this->assertDatabaseHas('student_appointment_profile_locks', ['student_profile_id' => $profile->id]);
        $this->assertDatabaseHas('student_appointment_schedules', ['service' => 'finance-appointment', 'revision' => 3]);
        $this->assertCount(2, Schema::getForeignKeys($table));
        $this->assertCount(1, Schema::getForeignKeys('student_appointment_profile_locks'));
        $this->assertTrue(Schema::hasIndex($table, ['service', 'starts_at'], 'unique'));
        $this->assertTrue(Schema::hasIndex($table, ['student_profile_id', 'starts_at']));
    }

    public function test_booking_mysql_constraints_use_supported_identifiers(): void
    {
        $original = Schema::getFacadeRoot();
        $connection = new MySqlConnection(fn () => throw new \RuntimeException('This test must not connect to MySQL.'), 'migration_test');
        try {
            Schema::swap($connection->getSchemaBuilder());
            $queries = $connection->pretend(function () {
                (require database_path(self::MIGRATION))->up();
            });
        } finally {
            Schema::swap($original);
        }

        $constraints = [];
        foreach ($queries as $query) {
            preg_match_all('/(?:constraint|add unique|add index) `([^`]+)`/i', $query['query'], $matches);
            array_push($constraints, ...$matches[1]);
        }
        $this->assertContains('appointment_reservation_request_fk', $constraints);
        $this->assertContains('appointment_reservation_profile_fk', $constraints);
        $this->assertContains('appointment_lock_profile_fk', $constraints);
        foreach ($constraints as $name) {
            $this->assertLessThanOrEqual(64, strlen($name), $name);
        }
    }
}

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const PROFILE_LOCKS = 'student_appointment_profile_locks';

    private const RESERVATIONS = 'student_appointment_reservations';

    public function up(): void
    {
        if (! Schema::hasTable('student_appointment_schedules')) {
            Schema::create('student_appointment_schedules', function (Blueprint $table) {
                $table->string('service', 48)->primary();
                $table->json('windows')->nullable();
                $table->unsignedInteger('revision')->default(0);
            });
        }

        if (! Schema::hasTable(self::PROFILE_LOCKS)) {
            Schema::create(self::PROFILE_LOCKS, function (Blueprint $table) {
                $table->foreignId('student_profile_id')->primary();
                $table->foreign('student_profile_id', 'appointment_lock_profile_fk')->references('id')->on('student_profiles')->cascadeOnDelete();
            });
        } else {
            $this->restoreForeignKey(self::PROFILE_LOCKS, 'student_profile_id', 'student_profiles', 'appointment_lock_profile_fk');
        }

        if (! Schema::hasTable(self::RESERVATIONS)) {
            Schema::create(self::RESERVATIONS, function (Blueprint $table) {
                $table->foreignId('student_service_request_id')->primary();
                $table->foreignId('student_profile_id');
                $table->string('service', 48);
                $table->dateTime('starts_at');
                $table->foreign('student_service_request_id', 'appointment_reservation_request_fk')->references('id')->on('student_service_requests')->cascadeOnDelete();
                $table->foreign('student_profile_id', 'appointment_reservation_profile_fk')->references('id')->on('student_profiles')->cascadeOnDelete();
                $table->unique(['service', 'starts_at'], 'student_appointment_reservation_slot');
                $table->index(['student_profile_id', 'starts_at'], 'student_appointment_profile_time');
            });

            return;
        }

        // MySQL can leave tables in place when a later index or constraint fails.
        $this->restoreForeignKey(self::RESERVATIONS, 'student_service_request_id', 'student_service_requests', 'appointment_reservation_request_fk');
        $this->restoreForeignKey(self::RESERVATIONS, 'student_profile_id', 'student_profiles', 'appointment_reservation_profile_fk');
        $slotMissing = ! Schema::hasIndex(self::RESERVATIONS, ['service', 'starts_at'], 'unique');
        $profileTimeMissing = ! Schema::hasIndex(self::RESERVATIONS, ['student_profile_id', 'starts_at']);
        if ($slotMissing || $profileTimeMissing) {
            Schema::table(self::RESERVATIONS, function (Blueprint $table) use ($slotMissing, $profileTimeMissing) {
                if ($slotMissing) {
                    $table->unique(['service', 'starts_at'], 'student_appointment_reservation_slot');
                }
                if ($profileTimeMissing) {
                    $table->index(['student_profile_id', 'starts_at'], 'student_appointment_profile_time');
                }
            });
        }
    }

    private function restoreForeignKey(string $table, string $column, string $target, string $name): void
    {
        foreach (Schema::getForeignKeys($table) as $key) {
            if ($key['columns'] === [$column] && $key['foreign_table'] === $target && $key['foreign_columns'] === ['id'] && strtolower($key['on_delete']) === 'cascade') {
                return;
            }
        }

        Schema::table($table, function (Blueprint $blueprint) use ($column, $target, $name) {
            $blueprint->foreign($column, $name)->references('id')->on($target)->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists(self::RESERVATIONS);
        Schema::dropIfExists(self::PROFILE_LOCKS);
        Schema::dropIfExists('student_appointment_schedules');
    }
};

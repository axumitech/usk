<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('student_service_requests', function (Blueprint $table) {
            $table->timestamp('appointment_cancelled_at')->nullable();
            $table->foreignId('appointment_cancelled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('appointment_cancellation_reason')->nullable();
            $table->index(['category', 'appointment_starts_at'], 'student_request_appointment_agenda_idx');
        });
    }

    public function down(): void
    {
        Schema::table('student_service_requests', function (Blueprint $table) {
            $table->dropIndex('student_request_appointment_agenda_idx');
            $table->dropConstrainedForeignId('appointment_cancelled_by');
            $table->dropColumn(['appointment_cancelled_at', 'appointment_cancellation_reason']);
        });
    }
};

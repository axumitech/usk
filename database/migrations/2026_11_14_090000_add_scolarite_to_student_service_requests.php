<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('student_service_requests', function (Blueprint $table) {
            $table->string('procedure', 48)->nullable();
            $table->text('request_attachment_path')->nullable();
            $table->string('request_attachment_name')->nullable();
            $table->date('appointment_date')->nullable();
            $table->string('appointment_period', 12)->nullable();
            $table->uuid('request_operation_key')->nullable();
            $table->string('request_operation_hash', 64)->nullable();
            $table->unique(['academic_enrollment_id', 'request_operation_key'], 'student_request_operation_unique');
        });
    }

    public function down(): void
    {
        Schema::table('student_service_requests', function (Blueprint $table) {
            $table->dropUnique('student_request_operation_unique');
            $table->dropColumn(['procedure', 'request_attachment_path', 'request_attachment_name', 'appointment_date', 'appointment_period',
                'request_operation_key', 'request_operation_hash']);
        });
    }
};

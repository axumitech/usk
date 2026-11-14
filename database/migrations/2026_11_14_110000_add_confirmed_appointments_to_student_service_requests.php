<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('student_service_requests', function (Blueprint $table) {
            $table->timestamp('appointment_starts_at')->nullable();
            $table->string('appointment_location', 180)->nullable();
            $table->timestamp('appointment_confirmed_at')->nullable();
            $table->foreignId('appointment_confirmed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedInteger('appointment_revision')->default(0);
        });
    }

    public function down(): void
    {
        Schema::table('student_service_requests', function (Blueprint $table) {
            $table->dropConstrainedForeignId('appointment_confirmed_by');
            $table->dropColumn(['appointment_starts_at', 'appointment_location', 'appointment_confirmed_at', 'appointment_revision']);
        });
    }
};

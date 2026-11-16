<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('academic_attendances', function (Blueprint $table) {
            $table->string('source', 12)->nullable();
            $table->timestamp('checked_in_at')->nullable();
        });

        Schema::create('student_nfc_cards', function (Blueprint $table) {
            $table->id();
            $table->foreignId('academic_enrollment_id')->unique()->constrained()->cascadeOnDelete();
            $table->char('uid_hash', 64)->unique();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('student_nfc_cards');

        Schema::table('academic_attendances', function (Blueprint $table) {
            $table->dropColumn(['source', 'checked_in_at']);
        });
    }
};

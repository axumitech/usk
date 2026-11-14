<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('academic_assessments', function (Blueprint $table) {
            $table->json('submission_formats')->nullable();
            $table->unsignedSmallInteger('submission_max_kb')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('academic_assessments', fn (Blueprint $table) => $table->dropColumn(['submission_formats', 'submission_max_kb']));
    }
};

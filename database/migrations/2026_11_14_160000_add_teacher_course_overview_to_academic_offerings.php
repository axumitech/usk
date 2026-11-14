<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('academic_offerings', function (Blueprint $table) {
            $table->text('teaching_presentation')->nullable();
            $table->text('teaching_objectives')->nullable();
            $table->unsignedInteger('teaching_overview_revision')->default(0);
        });
    }

    public function down(): void
    {
        Schema::table('academic_offerings', function (Blueprint $table) {
            $table->dropColumn(['teaching_presentation', 'teaching_objectives', 'teaching_overview_revision']);
        });
    }
};

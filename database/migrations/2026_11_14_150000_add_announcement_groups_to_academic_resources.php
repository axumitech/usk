<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('academic_resources', function (Blueprint $table) {
            $table->foreignId('announcement_class_id')->nullable()->constrained('classes')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('academic_resources', function (Blueprint $table) {
            $table->dropConstrainedForeignId('announcement_class_id');
        });
    }
};

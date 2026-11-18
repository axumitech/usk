<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('enrollments', function (Blueprint $table) {
            // nullable() after constrained() in the original migration did not apply to the column.
            $table->foreignId('level_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        if (DB::table('enrollments')->whereNull('level_id')->exists()) {
            throw new RuntimeException('Complétez les brouillons sans niveau avant de rétablir la contrainte. Aucune donnée n’a été supprimée.');
        }

        Schema::table('enrollments', function (Blueprint $table) {
            $table->foreignId('level_id')->nullable(false)->change();
        });
    }
};

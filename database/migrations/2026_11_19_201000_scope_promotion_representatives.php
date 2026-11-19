<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('promotion_representatives', function (Blueprint $table) {
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('academic_promotion_id')->constrained()->cascadeOnDelete();
            $table->primary(['user_id', 'academic_promotion_id']);
        });
    }

    public function down(): void
    {
        if (DB::table('promotion_representatives')->exists()) {
            throw new RuntimeException('Sauvegardez et retirez les mandats de promotion avant le retour arrière.');
        }
        Schema::drop('promotion_representatives');
    }
};

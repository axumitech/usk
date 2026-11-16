<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('student_payment_proofs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('academic_enrollment_id')->constrained()->restrictOnDelete();
            $table->foreignId('student_payment_id')->nullable()->unique()->constrained()->restrictOnDelete();
            $table->string('kind', 50);
            $table->unsignedBigInteger('amount_cents');
            $table->string('currency', 3);
            $table->string('method', 24);
            $table->string('reference', 180);
            $table->string('file_path');
            $table->string('status', 12)->default('pending');
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->text('review_note')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
            $table->index(['academic_enrollment_id', 'reference'], 'student_payment_proofs_reference_idx');
            $table->index(['status', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('student_payment_proofs');
    }
};

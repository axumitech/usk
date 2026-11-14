<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('academic_assessments', function (Blueprint $table) {
            $table->timestamp('scheduled_publish_at')->nullable();
            $table->foreignId('scheduled_publisher_id')->nullable()->constrained('users')->nullOnDelete();
            $table->boolean('scheduled_publish_notify')->default(false);
            $table->string('scheduled_publish_error')->nullable();
            $table->index(['state', 'scheduled_publish_at'], 'assessment_publish_due_idx');
        });
    }

    public function down(): void
    {
        Schema::table('academic_assessments', function (Blueprint $table) {
            $table->dropIndex('assessment_publish_due_idx');
            $table->dropForeign(['scheduled_publisher_id']);
            $table->dropColumn(['scheduled_publish_at', 'scheduled_publisher_id', 'scheduled_publish_notify', 'scheduled_publish_error']);
        });
    }
};

<?php

namespace App\Models\Student;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class StudentPaymentProof extends Model
{
    protected $fillable = [
        'academic_enrollment_id', 'student_payment_id', 'kind', 'amount_cents', 'currency', 'method', 'reference',
        'file_path', 'status', 'reviewed_by', 'review_note', 'reviewed_at',
    ];

    protected $hidden = ['file_path', 'reviewed_by', 'review_note'];

    protected $casts = ['reviewed_at' => 'datetime', 'amount_cents' => 'integer'];

    public function enrollment(): BelongsTo
    {
        return $this->belongsTo(AcademicEnrollment::class, 'academic_enrollment_id');
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(StudentPayment::class, 'student_payment_id');
    }
}

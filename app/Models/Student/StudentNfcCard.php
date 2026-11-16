<?php

namespace App\Models\Student;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Validation\ValidationException;

final class StudentNfcCard extends Model
{
    protected $fillable = ['academic_enrollment_id', 'uid_hash'];

    protected $hidden = ['uid_hash'];

    public function enrollment(): BelongsTo
    {
        return $this->belongsTo(AcademicEnrollment::class, 'academic_enrollment_id');
    }

    public static function fingerprint(string $uid): string
    {
        $normalized = strtoupper(preg_replace('/[\s:-]+/', '', $uid));
        if (! preg_match('/\A[0-9A-F]{4,32}\z/', $normalized)) {
            throw ValidationException::withMessages(['uid' => 'Le lecteur doit transmettre un UID hexadécimal ou décimal valide.']);
        }

        return hash_hmac('sha256', 'student-nfc:'.$normalized, config('app.key'));
    }
}

<?php

namespace App\Models\Student;

use App\Models\AcademicStructure\AcademicProgram;
use App\Models\AcademicYear;
use App\Models\Faculty;
use App\Models\Level;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\ValidationException;

class FinanceTariff extends Model
{
    protected $table = 'finance_tariffs';

    protected $guarded = ['id'];

    protected $casts = ['schedule' => 'array', 'valid_from' => 'date', 'valid_until' => 'date', 'automatic' => 'boolean'];

    public function academicYear()
    {
        return $this->belongsTo(AcademicYear::class);
    }

    public function level()
    {
        return $this->belongsTo(Level::class);
    }

    public function faculty()
    {
        return $this->belongsTo(Faculty::class);
    }

    public function program()
    {
        return $this->belongsTo(AcademicProgram::class, 'academic_program_id');
    }

    protected static function booted(): void
    {
        static::updating(function ($model) {
            $allowed = $model->getOriginal('status') === 'draft' && $model->status === 'draft'
                ? ['title', 'valid_from', 'valid_until', 'schedule', 'reason', 'updated_at']
                : ['status', 'updated_at'];
            if (array_diff(array_keys($model->getDirty()), $allowed)) {
                throw ValidationException::withMessages(['tariff' => 'Créez une nouvelle version du barème.']);
            }
        });
        static::deleting(fn () => throw ValidationException::withMessages(['tariff' => 'Les barèmes historiques sont conservés.']));
    }
}

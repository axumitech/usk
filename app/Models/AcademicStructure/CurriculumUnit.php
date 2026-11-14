<?php

namespace App\Models\AcademicStructure;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

class CurriculumUnit extends Model
{
    protected $guarded = ['id'];

    protected $casts = ['expected_credits' => 'decimal:2'];

    protected static function booted(): void
    {
        $guard = function (self $unit) {
            $ids = array_filter([$unit->curriculum_version_id, $unit->getOriginal('curriculum_version_id')]);
            if (CurriculumVersion::whereIn('id', $ids)->where('status', '!=', 'draft')->exists()) {
                throw ValidationException::withMessages(['units' => 'Les unités d’une version validée ne peuvent plus être modifiées.']);
            }
        };
        static::saving($guard);
        static::deleting($guard);
    }

    public function version()
    {
        return $this->belongsTo(CurriculumVersion::class, 'curriculum_version_id');
    }

    public function items()
    {
        return $this->hasMany(CurriculumItem::class)->orderBy('id');
    }

    public static function isCatalogGroup(string $code, string $name): bool
    {
        // The catalog import puts unrelated courses into placeholder units by period.
        return preg_match('/^CAT-\d+$/', $code) === 1
            && preg_match('/^Matières du catalogue(?: · \d+)?$/u', $name) === 1;
    }

    public function isComposite(int $count): bool
    {
        return $count > 1 && ! self::isCatalogGroup($this->code, $this->name);
    }

    public function creditTotal(Collection $items): ?float
    {
        if ($this->credit_rule === 'independent') {
            return $this->expected_credits === null ? null : (float) $this->expected_credits;
        }

        return $items->contains('credits', '===', null) ? null : (float) $items->sum('credits');
    }
}

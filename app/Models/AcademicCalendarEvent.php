<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AcademicCalendarEvent extends Model
{
    public const CATEGORIES = [
        'courses' => 'Début ou reprise des cours',
        'exam' => 'Examens',
        'resit' => 'Rattrapages',
        'holiday' => 'Vacances et congés',
        'other' => 'Autre',
    ];

    protected $fillable = ['academic_year_id', 'title', 'category', 'start_date', 'end_date', 'location', 'description', 'instructions'];

    protected $casts = ['start_date' => 'immutable_date:Y-m-d', 'end_date' => 'immutable_date:Y-m-d'];
}

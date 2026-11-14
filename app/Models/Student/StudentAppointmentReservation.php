<?php

namespace App\Models\Student;

use Illuminate\Database\Eloquent\Model;

final class StudentAppointmentReservation extends Model
{
    public $incrementing = false;

    public $timestamps = false;

    protected $primaryKey = 'student_service_request_id';

    protected $fillable = ['student_service_request_id', 'student_profile_id', 'service', 'starts_at'];

    protected $casts = ['starts_at' => 'immutable_datetime'];
}

<?php

namespace App\Models\Student;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasOne;

class ServiceRequest extends Model
{
    public function enrollment()
    {
        return $this->belongsTo(AcademicEnrollment::class, 'academic_enrollment_id');
    }

    public function appointmentReservation(): HasOne
    {
        return $this->hasOne(StudentAppointmentReservation::class, 'student_service_request_id');
    }

    protected $table = 'student_service_requests';

    protected $fillable = ['academic_enrollment_id', 'category', 'subject', 'body', 'status', 'response', 'responded_by', 'academic_official_result_id', 'result_target', 'result_attachment', 'result_revision', 'assigned_to',
        'official_document_type_id', 'official_document_template_id', 'document_source_result_id', 'document_previous_id',
        'document_approved_by', 'document_action', 'document_pending_key', 'document_operation_key', 'document_revision', 'document_fingerprint', 'document_mandate',
        'procedure', 'request_attachment_path', 'request_attachment_name', 'appointment_date', 'appointment_period', 'request_operation_key', 'request_operation_hash',
        'appointment_starts_at', 'appointment_location', 'appointment_confirmed_at', 'appointment_confirmed_by', 'appointment_revision',
        'appointment_cancelled_at', 'appointment_cancelled_by', 'appointment_cancellation_reason'];

    protected $hidden = ['result_attachment', 'document_fingerprint', 'document_pending_key', 'document_operation_key', 'document_mandate',
        'request_attachment_path', 'request_operation_key', 'request_operation_hash'];

    public function officialResult()
    {
        return $this->belongsTo(AcademicOfficialResult::class, 'academic_official_result_id');
    }

    public function documentType()
    {
        return $this->belongsTo(OfficialDocumentType::class, 'official_document_type_id');
    }

    public function responder()
    {
        return $this->belongsTo(User::class, 'responded_by');
    }

    public function documentTemplate()
    {
        return $this->belongsTo(OfficialDocumentTemplate::class, 'official_document_template_id');
    }

    public function document()
    {
        return $this->hasOne(OfficialDocument::class, 'student_service_request_id');
    }

    public function previousDocument()
    {
        return $this->belongsTo(OfficialDocument::class, 'document_previous_id');
    }

    public function sourceResult()
    {
        return $this->belongsTo(AcademicOfficialResult::class, 'document_source_result_id');
    }

    protected $casts = [
        'appointment_date' => 'date', 'appointment_starts_at' => 'immutable_datetime', 'appointment_confirmed_at' => 'immutable_datetime', 'appointment_revision' => 'integer',
        'appointment_cancelled_at' => 'immutable_datetime',
    ];
}

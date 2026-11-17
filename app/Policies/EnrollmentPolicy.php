<?php

namespace App\Policies;


use App\Models\User;
use App\Models\Enrollment;
use App\Modules\Student\Application\Services\AcademicStaffScope;


class EnrollmentPolicy
{
    public function view(User $u, Enrollment $e): bool
    {
        return $u->id === $e->student_id || $this->review($u, $e);
    }
    public function create(User $u): bool
    {
        return $u->hasAnyRole(['student', 'staff']);
    }
    public function review(User $u, Enrollment $e): bool
    {
        return $u->hasRole('admin') && $u->can('manage academic access')
            && AcademicStaffScope::apply(Enrollment::query(), $u)->whereKey($e->id)->exists();
    }
    public function download(User $u, Enrollment $e): bool
    {
        return $this->view($u, $e);
    }
}

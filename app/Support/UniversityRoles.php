<?php

namespace App\Support;

final class UniversityRoles
{
    public const FACULTY_STAFF = ['dean', 'vice-dean', 'registrar', 'admissions-officer', 'finance-officer'];

    public const GRANTS = [
        'user' => ['view dashboard'],
        'candidate' => ['apply to programs', 'view application status'],
        'student' => ['view dashboard', 'view courses', 'submit assignments', 'view grades'],
        'professor' => ['view dashboard', 'manage courses', 'grade assignments', 'manage students'],
        'admin' => ['view dashboard', 'manage academic access', 'manage academic finance', 'publish academic content', 'manage users', 'manage content', 'configure settings', 'faculties.create', 'faculties.update'],
        'super-admin' => ['view platform', 'configure platform institution', 'delegate institutional administration', 'maintain permission cache'],
        'rector' => ['view institutional indicators'],
        'academic-secretary' => ['view dashboard', 'manage academic access', 'manage official documents', 'approve official documents', 'issue official documents', 'manage academic progression'],
        'dean' => ['view dashboard', 'manage academic access', 'approve academic progression', 'approve official documents', 'deliberate academic results', 'publish official results'],
        'vice-dean' => ['view dashboard', 'publish academic content', 'manage academic results', 'manage academic progression'],
        'registrar' => ['view dashboard', 'manage academic access', 'manage official documents', 'issue official documents'],
        'admissions-officer' => ['view dashboard', 'manage academic access'],
        'finance-officer' => ['view dashboard', 'manage academic finance'],
        'department-head' => ['view department programs'],
        'promotion-representative' => ['communicate with own promotion'],
    ];

    /** Named delegations may only enter these back-office route families. Older admin accounts keep their individual policies. */
    public const ADMIN_AREAS = [
        'academic-secretary' => ['enrollments', 'student-academic', 'official-documents', 'progression', 'academic-years', 'academic-structure', 'levels', 'notifications'],
        'dean' => ['enrollments', 'student-academic', 'official-documents', 'progression', 'results', 'academic-structure', 'levels', 'notifications'],
        'vice-dean' => ['teaching', 'learning', 'assessments', 'schedule', 'results', 'progression', 'academic-structure', 'course-catalog', 'levels', 'professors'],
        'registrar' => ['student-academic', 'official-documents', 'card-requests', 'card-issuance', 'notifications'],
        'admissions-officer' => ['enrollments', 'notifications'],
        'finance-officer' => ['finance'],
    ];
}

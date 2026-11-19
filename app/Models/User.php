<?php

namespace App\Models;

use App\Models\Student\StudentProfile;
use App\Modules\Blog\Infrastructure\Persistence\Eloquent\Models\PostModel;
use App\Modules\Identity\Domain\Nationality;
use App\Support\UniversityRoles;
use Illuminate\Auth\MustVerifyEmail; // le trait ajoute hasVerifiedEmail(), markEmailAsVerified()...
use Illuminate\Contracts\Auth\MustVerifyEmail as MustVerifyEmailContract;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable implements MustVerifyEmailContract
{
    use HasRoles, \Illuminate\Database\Eloquent\Factories\HasFactory, MustVerifyEmail, Notifiable {
        hasRole as private hasAssignedRole;
        hasPermissionTo as private hasAssignedPermission;
        getAllPermissions as private allAssignedPermissions;
    }

    public function hasRole($roles, ?string $guard = null): bool
    {
        // Existing assignments remain available for audit. A mixed platform account operates only as platform staff.
        $this->loadMissing('roles');
        if ($this->roles->count() > 1 && $this->hasAssignedRole('super-admin', $guard)) {
            $platform = clone $this;
            $platform->setRelation('roles', $this->roles->where('name', 'super-admin')->values());

            return $platform->hasAssignedRole($roles, $guard);
        }
        if ($roles !== 'admin') {
            return $this->hasAssignedRole($roles, $guard);
        }

        return $this->hasAssignedRole('admin', $guard) || $this->hasAssignedRole('academic-secretary', $guard)
            || ($this->hasAssignedRole(UniversityRoles::FACULTY_STAFF, $guard)
                && $this->academicFaculties()->exists());
    }

    public function hasPermissionTo($permission, $guardName = null): bool
    {
        if ($this->hasAssignedRole('super-admin') && ! in_array($this->filterPermission($permission, $guardName)->name, UniversityRoles::GRANTS['super-admin'], true)) {
            return false;
        }

        return $this->hasAssignedPermission($permission, $guardName);
    }

    public function getAllPermissions(): \Illuminate\Support\Collection
    {
        $permissions = $this->allAssignedPermissions();

        return $this->hasAssignedRole('super-admin')
            ? $permissions->whereIn('name', UniversityRoles::GRANTS['super-admin'])->values()
            : $permissions;
    }

    public function scopeAdministrators(Builder $query): Builder
    {
        $guard = $this->getDefaultGuardName();

        return $query->whereDoesntHave('roles', fn ($roles) => $roles->where('guard_name', $guard)->where('name', 'super-admin'))
            ->where(fn ($actors) => $actors->whereHas('roles', fn ($roles) => $roles->where('guard_name', $guard)->whereIn('name', ['admin', 'academic-secretary']))
                ->orWhere(fn ($facultyStaff) => $facultyStaff->whereHas('academicFaculties')
                    ->whereHas('roles', fn ($roles) => $roles->where('guard_name', $guard)->whereIn('name', UniversityRoles::FACULTY_STAFF))));
    }

    public function delegatedAreas(): ?array
    {
        $names = $this->getRoleNames();
        if ($names->contains('admin')) {
            return null;
        }

        return $names->flatMap(fn ($name) => \App\Support\UniversityRoles::ADMIN_AREAS[$name] ?? [])->unique()->values()->all();
    }

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'last_name',
        'first_name',
        'post_name',
        'gender',
        'nationality_code',
        'email',
        'password',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function updateLoginInfo($request)
    {
        $this->update([
            'last_login_at' => now(),
            'last_login_ip' => $request->ip(),
        ]);
    }

    public function academicFaculties()
    {
        return $this->belongsToMany(Faculty::class, 'academic_staff_faculties', 'user_id', 'faculty_id');
    }

    public function studentProfile()
    {
        return $this->hasOne(StudentProfile::class);
    }

    public function feeCategoryFromNationality(): ?string
    {
        return Nationality::feeCategory($this->nationality_code);
    }

    public function enrollments()
    {
        return $this->hasMany(Enrollment::class, 'student_id');
    }

    public function posts()
    {
        return $this->hasMany(PostModel::class, 'author_id');
    }

    public function getFullNameAttribute()
    {
        return $this->first_name.' '.$this->last_name;
    }
}

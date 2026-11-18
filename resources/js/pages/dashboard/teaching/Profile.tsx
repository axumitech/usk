import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import ProfessorAvatar from '@/components/teaching/ProfessorAvatar';
import TeacherModuleHeading from '@/components/teaching/TeacherModuleHeading';
import { defaultUploadLimits, imageAccept, imageUploadError, uploadSize, type UploadLimits } from '@/lib/uploadLimits';
import { Head, useForm, usePage } from '@inertiajs/react';
import { Camera, Upload, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import '../../../../css/dashboard/professor-portraits.css';

export default function TeacherProfile({ name, photoUrl }: { name: string; photoUrl: string | null }) {
    const form = useForm<{ photo: File | null }>({ photo: null });
    const limits = usePage<{ uploadLimits?: UploadLimits }>().props.uploadLimits ?? defaultUploadLimits;
    const [preview, setPreview] = useState<string | null>(null);

    useEffect(() => {
        if (!form.data.photo) return;
        const url = URL.createObjectURL(form.data.photo);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [form.data.photo]);

    return (
        <Dashboard hideAppsNavigation>
            <Head title="Mon profil enseignant" />
            <div className="teacher-module-page teacher-profile-workspace">
                <TeacherModuleHeading
                    title="Mon profil enseignant"
                    icon={UserRound}
                    home={photoUrl ? route('dashboard.teaching.index') : undefined}
                />
                <section className="professor-photo-panel teacher-profile-photo" aria-labelledby="teacher-photo-title">
                    <div className="professor-photo-heading">
                        <ProfessorAvatar name={name} photoUrl={form.data.photo ? preview : photoUrl} />
                        <div>
                            <h2 id="teacher-photo-title">Photo de profil</h2>
                            <p>{name}</p>
                        </div>
                    </div>
                    <p>
                        {photoUrl
                            ? 'Choisissez un nouveau portrait pour mettre à jour votre fiche enseignant.'
                            : 'Ajoutez un portrait pour accéder à vos cours, supports et évaluations.'}
                    </p>
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (form.processing || !form.data.photo) return;
                            form.post(route('dashboard.teaching.profile.photo'), { forceFormData: true });
                        }}
                    >
                        <label className="professor-photo-upload">
                            <Upload size={18} aria-hidden="true" />
                            <span>Choisir une photo</span>
                            <input
                                required
                                type="file"
                                accept={imageAccept}
                                disabled={form.processing}
                                aria-describedby="teacher-photo-formats"
                                aria-invalid={!!form.errors.photo}
                                onChange={(event) => {
                                    const file = event.target.files?.[0] ?? null;
                                    const error = file && imageUploadError(file, limits);
                                    form.clearErrors('photo');
                                    form.setData('photo', error ? null : file);
                                    if (error) {
                                        form.setError('photo', error);
                                        event.target.value = '';
                                    }
                                }}
                            />
                        </label>
                        <p id="teacher-photo-formats">JPEG, PNG ou WebP · {uploadSize(limits.image_kb)} maximum.</p>
                        {form.errors.photo && (
                            <p role="alert" className="professor-photo-error">
                                {form.errors.photo}
                            </p>
                        )}
                        {form.progress && <progress aria-label="Téléversement de la photo" max={100} value={form.progress.percentage ?? 0} />}
                        <button className="admin-primary" disabled={!form.data.photo || form.processing}>
                            <Camera size={17} aria-hidden="true" /> {form.processing ? 'Enregistrement…' : 'Enregistrer ma photo'}
                        </button>
                    </form>
                </section>
            </div>
        </Dashboard>
    );
}

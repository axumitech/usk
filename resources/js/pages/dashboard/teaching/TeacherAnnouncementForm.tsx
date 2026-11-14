import AdminModal from '@/components/admin/AdminModal';
import { useForm } from '@inertiajs/react';
import { Bell, BookOpen, UsersRound } from 'lucide-react';
import { useId } from 'react';
import type { TeacherAnnouncementTarget } from './overviewTypes';

export default function TeacherAnnouncementForm({
    action,
    targets,
    offering,
    onClose,
}: {
    action: string;
    targets: TeacherAnnouncementTarget[];
    offering?: number;
    onClose: () => void;
}) {
    const id = useId();
    const form = useForm({
        offering_id: offering ?? (targets.length === 1 ? targets[0].id : null),
        group_id: null as number | null,
        title: '',
        body: '',
        operation_key: '',
    });
    const course = targets.find((target) => target.id === form.data.offering_id);
    const group = course?.groups.find((target) => target.id === form.data.group_id);
    const audience = group?.label ?? course?.group ?? 'Tous les étudiants du cours';

    return (
        <AdminModal
            title="Envoyer une annonce"
            eyebrow="ESPACE ENSEIGNANT"
            description="Publiez un message dans l’espace étudiant et notifiez les destinataires choisis."
            formId={id}
            submitLabel="Envoyer l’annonce"
            busy={form.processing}
            errors={form.errors}
            className="teacher-announcement-modal"
            onClose={onClose}
        >
            <form
                id={id}
                className="teacher-announcement-form"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (!course || form.processing) return;
                    const key = form.data.operation_key || crypto.randomUUID();
                    form.setData('operation_key', key);
                    form.transform((data) => ({ ...data, operation_key: key, title: data.title.trim(), body: data.body.trim() }));
                    form.post(action, { onSuccess: onClose });
                }}
            >
                <fieldset disabled={form.processing}>
                    <div className="teacher-announcement-fields">
                        <label>
                            <span>
                                <BookOpen size={16} aria-hidden="true" /> Cours *
                            </span>
                            <select
                                value={form.data.offering_id ?? ''}
                                required
                                onChange={(event) => {
                                    const value = event.target.value;
                                    form.setData((data) => ({ ...data, offering_id: value ? Number(value) : null, group_id: null }));
                                    form.clearErrors('offering_id', 'group_id');
                                }}
                            >
                                <option value="">Choisir un cours</option>
                                {targets.map((target) => (
                                    <option key={target.id} value={target.id}>
                                        {[target.title, target.level, target.group].filter(Boolean).join(' · ')}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {course && (course.groups.length > 0 || course.group) && (
                            <label>
                                <span>
                                    <UsersRound size={16} aria-hidden="true" /> Destinataires
                                </span>
                                <select
                                    value={form.data.group_id ?? ''}
                                    onChange={(event) => {
                                        const value = event.target.value;
                                        form.setData('group_id', value ? Number(value) : null);
                                        form.clearErrors('group_id');
                                    }}
                                >
                                    <option value="">{course.group ? `Groupe ${course.group}` : 'Tous les étudiants du cours'}</option>
                                    {course.groups.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                    </div>
                    <label>
                        <span>Titre *</span>
                        <input
                            type="text"
                            maxLength={180}
                            value={form.data.title}
                            onChange={(event) => form.setData('title', event.target.value)}
                            required
                        />
                    </label>
                    <label>
                        <span>Message *</span>
                        <textarea
                            rows={5}
                            maxLength={5000}
                            value={form.data.body}
                            onChange={(event) => form.setData('body', event.target.value)}
                            required
                        />
                    </label>
                    {course && (
                        <p className="teacher-announcement-audience">
                            <Bell size={16} aria-hidden="true" />{' '}
                            <span>
                                Notification dans l’espace étudiant · <strong>{audience}</strong>
                            </span>
                        </p>
                    )}
                </fieldset>
            </form>
        </AdminModal>
    );
}

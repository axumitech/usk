import AdminModal from '@/components/admin/AdminModal';
import { dateLabel, localDate, time } from '@/lib/scheduleDates';
import { Link, useForm } from '@inertiajs/react';
import { BookOpen, CalendarDays, ChevronRight, Layers3, Pencil, Target } from 'lucide-react';
import { useId, useState } from 'react';
import '../../../../css/dashboard/teacher-course-overview.css';
import { TeacherPanel } from './TeacherOverview';

export type TeacherCourseOverviewData = {
    presentation: string | null;
    presentation_override: string | null;
    objectives: string | null;
    sections: { id: number; title: string }[];
    schedule: { elapsed: number; total: number; next_at: string | null };
    revision: number;
    update_url: string | null;
};

function EditOverview({ overview, action, onClose }: { overview: TeacherCourseOverviewData; action: string; onClose: () => void }) {
    const formId = useId();
    const presentationHelp = `${formId}-presentation-help`;
    const form = useForm({ presentation: overview.presentation_override ?? '', objectives: overview.objectives ?? '', revision: overview.revision });
    return (
        <AdminModal
            title="Modifier la présentation du cours"
            description="Renseignez la présentation et les objectifs pédagogiques de cette offre."
            eyebrow="ESPACE ENSEIGNANT"
            formId={formId}
            submitLabel="Enregistrer"
            busy={form.processing}
            errors={form.errors}
            onClose={onClose}
        >
            <form
                id={formId}
                className="teacher-course-overview-form"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (form.processing) return;
                    form.put(action, { preserveScroll: true, onSuccess: onClose });
                }}
            >
                <label>
                    Présentation
                    <textarea
                        rows={4}
                        maxLength={5000}
                        value={form.data.presentation}
                        onChange={(event) => form.setData('presentation', event.target.value)}
                        aria-describedby={presentationHelp}
                    />
                </label>
                <p className="teacher-course-overview-field-help" id={presentationHelp}>
                    Si le champ est vide, la description du catalogue s’affiche lorsqu’elle est disponible.
                </p>
                <label>
                    Objectifs pédagogiques
                    <textarea
                        rows={4}
                        maxLength={5000}
                        value={form.data.objectives}
                        onChange={(event) => form.setData('objectives', event.target.value)}
                    />
                </label>
            </form>
        </AdminModal>
    );
}

export default function TeacherCourseOverview({
    overview,
    supportsHref,
    sessionsHref,
}: {
    overview: TeacherCourseOverviewData;
    supportsHref: (section?: number) => string;
    sessionsHref: string;
}) {
    const [editing, setEditing] = useState(false);
    const { schedule, sections } = overview;
    const next = schedule.next_at;

    return (
        <div className="teacher-course-overview">
            <TeacherPanel
                id="teacher-course-presentation"
                title="Présentation"
                icon={BookOpen}
                action={
                    overview.update_url && (
                        <button className="teacher-course-entry-action" type="button" onClick={() => setEditing(true)}>
                            <Pencil size={16} aria-hidden="true" /> Modifier
                        </button>
                    )
                }
            >
                <p className="teacher-course-overview-text" data-empty={!overview.presentation || undefined}>
                    {overview.presentation || 'La présentation du cours reste à renseigner.'}
                </p>
                <div className="teacher-course-objectives">
                    <h3>
                        <Target size={17} aria-hidden="true" /> Objectifs pédagogiques
                    </h3>
                    <p className="teacher-course-overview-text" data-empty={!overview.objectives || undefined}>
                        {overview.objectives || 'Les objectifs du cours restent à renseigner.'}
                    </p>
                </div>
            </TeacherPanel>

            <TeacherPanel id="teacher-course-progress" title="Avancement des séances" icon={CalendarDays}>
                {schedule.total > 0 ? (
                    <div className="teacher-course-progress-meter">
                        <p>
                            <strong>
                                {schedule.elapsed} sur {schedule.total}
                            </strong>{' '}
                            séances écoulées
                        </p>
                        <progress aria-label="Séances publiées dont le créneau est écoulé" value={schedule.elapsed} max={schedule.total} />
                    </div>
                ) : (
                    <p className="teacher-empty">Aucune séance publiée pour ce cours.</p>
                )}
                {next && (
                    <div className="teacher-course-next-session">
                        <span>Prochaine séance</span>
                        <time dateTime={next}>
                            {dateLabel(localDate(next))} à {time(next)}
                        </time>
                    </div>
                )}
                {schedule.total > 0 && (
                    <Link className="teacher-course-entry-action" href={sessionsHref} preserveScroll>
                        Voir les séances <ChevronRight size={15} aria-hidden="true" />
                    </Link>
                )}
            </TeacherPanel>

            <TeacherPanel id="teacher-course-plan" title="Plan du cours" icon={Layers3}>
                {sections.length ? (
                    <ol className="teacher-list teacher-course-plan">
                        {sections.map((section) => (
                            <li key={section.id}>
                                <Link className="teacher-row" href={supportsHref(section.id)} preserveScroll>
                                    <span className="teacher-symbol" data-tone="olive">
                                        <Layers3 size={17} aria-hidden="true" />
                                    </span>
                                    <span className="teacher-row-copy">
                                        <strong>{section.title}</strong>
                                    </span>
                                    <ChevronRight className="teacher-row-chevron" size={16} aria-hidden="true" />
                                </Link>
                            </li>
                        ))}
                    </ol>
                ) : (
                    <p className="teacher-empty">Aucun chapitre dans le plan du cours.</p>
                )}
                {!sections.length && overview.update_url && (
                    <Link className="teacher-course-entry-action" href={supportsHref()} preserveScroll>
                        Voir les supports <ChevronRight size={15} aria-hidden="true" />
                    </Link>
                )}
            </TeacherPanel>
            {editing && overview.update_url && <EditOverview overview={overview} action={overview.update_url} onClose={() => setEditing(false)} />}
        </div>
    );
}

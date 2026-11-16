import PageHeading from '@/components/admin/PageHeading';
import Pagination from '@/components/admin/Pagination';
import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import TeacherAttendanceCheckIn from '@/components/teaching/TeacherAttendanceCheckIn';
import TeacherModuleHeading from '@/components/teaching/TeacherModuleHeading';
import { dateLabel, localDate, time } from '@/lib/scheduleDates';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import { CheckCheck, ClipboardCheck, ClipboardX, Lock, Save, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import '../../../../css/dashboard/teacher-attendance.css';
import '../../../../css/dashboard/teaching.css';
import '../../../../css/student-course.css';
import AcademicForm, { type FormSpec } from '../studentAcademic/AcademicForm';

type Props = {
    session: { id: number; title: string; level: string; year: string; starts_at: string; ends_at: string; room: string };
    students: { id: number; name: string; matricule: string; status: string; checked_in_at?: string | null; source?: 'qr' | 'nfc' | null }[];
    canRecord: boolean;
    closed: boolean;
    revision: number;
    teacher: boolean;
    returnUrl?: string | null;
    saveUrl?: string | null;
    checkIn?: { qr_url: string; nfc_url: string } | null;
    pagination: unknown;
    flash?: { success?: string };
};
type RosterSnapshot = Pick<Props, 'students' | 'revision'>;

export default function AttendancePage() {
    const { session } = usePage<Props>().props;
    return <Attendance key={session.id} />;
}

function Attendance() {
    const { props, url } = usePage<Props>();
    const { session, students, canRecord, closed, revision, teacher, pagination, returnUrl, checkIn, flash } = props;
    const [modal, setModal] = useState<FormSpec | null>(null);
    const [draft, setDraft] = useState<RosterSnapshot | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const draftRef = useRef(false);
    const cancelRefresh = useRef<(() => void) | null>(null);
    const live = Boolean(checkIn);
    const roster = draft ?? { students, revision };
    const hasDraft = draft !== null;
    const slot = `${dateLabel(localDate(session.starts_at))} · ${time(session.starts_at)}–${time(session.ends_at)}`;
    const teacherContext = [session.level, session.year, slot, session.room].filter(Boolean).join(' · ');

    const updateDraft = useCallback((value: RosterSnapshot | null) => {
        draftRef.current = value !== null;
        setDraft(value);
        if (value) cancelRefresh.current?.();
    }, []);

    const refresh = useCallback(() => {
        if (draftRef.current || cancelRefresh.current) return;

        router.reload({
            only: ['students', 'revision', 'checkIn', 'canRecord', 'closed'],
            onCancelToken: ({ cancel }) => {
                cancelRefresh.current = cancel;
            },
            onStart: () => setRefreshing(true),
            onFinish: () => {
                cancelRefresh.current = null;
                setRefreshing(false);
            },
        });
    }, []);

    useEffect(() => {
        updateDraft(null);
        return () => cancelRefresh.current?.();
    }, [updateDraft, url]);

    useEffect(() => {
        if (!live || hasDraft) return;

        const timer = window.setInterval(() => {
            if (document.visibilityState === 'visible') refresh();
        }, 12_000);
        return () => window.clearInterval(timer);
    }, [hasDraft, live, refresh]);

    useEffect(() => {
        const now = Date.now();
        const startDelay = Date.parse(session.starts_at) - now;
        if (!teacher || canRecord || closed || Date.parse(session.ends_at) <= now || startDelay > 2_147_000_000) return;

        const timer = window.setTimeout(refresh, Math.max(0, startDelay) + 1000);
        return () => window.clearTimeout(timer);
    }, [canRecord, closed, refresh, session.ends_at, session.starts_at, teacher]);

    return (
        <Dashboard>
            <Head title={`Présences · ${session.title}`} />
            {modal && <AcademicForm spec={modal} onClose={() => setModal(null)} onSuccess={() => setModal(null)} />}
            <div className={`teaching-page${teacher ? 'teacher-module-page teacher-attendance' : ''}`}>
                {teacher ? (
                    <TeacherModuleHeading
                        title={`Appel · ${session.title}`}
                        icon={ClipboardCheck}
                        home={returnUrl ?? route('dashboard.teaching.index', { view: 'schedule' })}
                        homeLabel={returnUrl ? 'Retour à la séance' : 'Retour à l’emploi du temps'}
                        description={teacherContext}
                    />
                ) : (
                    <>
                        <Link href={route('dashboard.admin.schedule.index')}>← Retour aux horaires</Link>
                        <PageHeading
                            title={`Présences · ${session.title}`}
                            description={`${session.level} · ${session.year} · ${slot} · ${session.room}`}
                        />
                    </>
                )}
                {flash?.success && (
                    <p role="status" className="teaching-feedback">
                        {flash.success}
                    </p>
                )}
                {!canRecord && (
                    <p className={teacher ? 'teacher-attendance-note' : undefined}>
                        {teacher && <Lock size={17} aria-hidden="true" />}
                        {teacher && closed
                            ? 'L’appel est clôturé. Vous pouvez consulter les présences.'
                            : 'L’appel est en lecture seule. La saisie exige une séance publiée et commencée.'}
                    </p>
                )}
                {!teacher && !closed && canRecord && new Date(session.ends_at) <= new Date() && students.some((student) => student.status) && (
                    <button
                        className="admin-secondary"
                        onClick={() =>
                            setModal({
                                title: 'Clôturer l’appel',
                                description: 'Les corrections ultérieures seront réservées aux agents habilités.',
                                action: route('dashboard.admin.schedule.transition', session.id),
                                values: { action: 'close_attendance' },
                                fields: [{ name: 'reason', label: 'Motif', type: 'textarea', required: true }],
                            })
                        }
                    >
                        Clôturer l’appel
                    </button>
                )}
                {checkIn && (
                    <TeacherAttendanceCheckIn
                        endpoints={checkIn}
                        title={session.title}
                        end={session.ends_at}
                        draft={hasDraft}
                        refreshing={refreshing}
                        onRefresh={refresh}
                    />
                )}
                <AttendanceSheet
                    key={`${roster.revision}:${roster.students.map((student) => student.id).join(':')}`}
                    roster={roster}
                    onDraftChange={(value) => updateDraft(value ? roster : null)}
                />
                <Pagination value={pagination} />
            </div>
        </Dashboard>
    );
}

function AttendanceSheet({ roster, onDraftChange }: { roster: RosterSnapshot; onDraftChange: (dirty: boolean) => void }) {
    const { session, canRecord, closed, teacher, saveUrl } = usePage<Props>().props;
    const { students, revision } = roster;
    const form = useForm({ reason: '', records: students.map((student) => ({ id: student.id, status: student.status })) });
    const canMarkAbsences = teacher && new Date(session.ends_at) <= new Date();
    const isUnrecorded = (record: { status: string }, index: number) => !record.status && !students[index].status;

    function setRecords(records: typeof form.data.records) {
        onDraftChange(records.some((record, index) => record.status !== students[index].status) || Boolean(form.data.reason));
        form.setData('records', records);
    }

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                onDraftChange(true);
                let saved = false;
                form.transform((data) => ({ revision, reason: data.reason, records: data.records.filter((record) => record.status) }));
                form.post(saveUrl ?? route(teacher ? 'dashboard.teaching.attendance.save' : 'dashboard.admin.schedule.attendance.save', session.id), {
                    preserveScroll: true,
                    onSuccess: () => {
                        saved = true;
                    },
                    onFinish: () => onDraftChange(!saved && form.isDirty),
                });
            }}
            className="teaching-profile"
        >
            <header className="teaching-section-heading">
                {teacher ? (
                    <div className="teacher-attendance-heading">
                        <span className="teacher-attendance-symbol">
                            <UsersRound size={21} aria-hidden="true" />
                        </span>
                        <div>
                            <h2>Liste d’appel</h2>
                            <p>
                                {students.length} étudiant{students.length > 1 ? 's' : ''} sur cette page
                            </p>
                        </div>
                    </div>
                ) : (
                    <h2>{students.length} étudiant(s)</h2>
                )}
                <div className={teacher ? 'teacher-attendance-roster-actions' : undefined}>
                    <button
                        type="button"
                        className="admin-secondary"
                        disabled={!canRecord || form.processing}
                        onClick={() => setRecords(form.data.records.map((record) => ({ ...record, status: 'present' })))}
                    >
                        {teacher && <CheckCheck size={17} aria-hidden="true" />}
                        Marquer tous présents
                    </button>
                    {canMarkAbsences && (
                        <button
                            type="button"
                            className="admin-secondary"
                            disabled={!canRecord || form.processing || !form.data.records.some(isUnrecorded)}
                            onClick={() =>
                                setRecords(
                                    form.data.records.map((record, index) =>
                                        isUnrecorded(record, index) ? { ...record, status: 'absent' } : record,
                                    ),
                                )
                            }
                        >
                            <ClipboardX size={17} aria-hidden="true" />
                            Marquer les non renseignés absents
                        </button>
                    )}
                </div>
            </header>
            {Object.values(form.errors).map((error, index) => (
                <p role="alert" key={index} className="text-red-700">
                    {error}
                </p>
            ))}
            <div className="course-attendance-list">
                {students.map((student, index) => (
                    <article key={student.id}>
                        <div>
                            <strong>{student.name}</strong>
                            <p>
                                {student.matricule}
                                {student.checked_in_at && ` · ${time(student.checked_in_at)}`}
                                {student.source && ` · ${student.source === 'nfc' ? 'Carte NFC' : 'QR'}`}
                            </p>
                        </div>
                        <label>
                            <span className="sr-only">Présence de {student.name}</span>
                            <select
                                disabled={!canRecord || form.processing}
                                value={form.data.records[index].status}
                                data-status={teacher ? form.data.records[index].status : undefined}
                                onChange={(event) =>
                                    setRecords(
                                        form.data.records.map((record, i) => (i === index ? { ...record, status: event.target.value } : record)),
                                    )
                                }
                            >
                                <option value="">Non renseigné</option>
                                <option value="present">Présent</option>
                                <option value="absent">Absent</option>
                                <option value="late">En retard</option>
                                <option value="excused" disabled={teacher}>
                                    Excusé
                                </option>
                            </select>
                        </label>
                    </article>
                ))}
            </div>
            {!students.length && <p>Aucun étudiant confirmé ne correspond au niveau, à l’année et au groupe de cet enseignement.</p>}
            {closed && canRecord && (
                <label>
                    Motif obligatoire de la correction
                    <textarea
                        required
                        minLength={5}
                        value={form.data.reason}
                        onChange={(event) => {
                            onDraftChange(
                                Boolean(event.target.value) || form.data.records.some((record, index) => record.status !== students[index].status),
                            );
                            form.setData('reason', event.target.value);
                        }}
                    />
                </label>
            )}
            <div className={teacher ? 'teacher-attendance-form-actions' : undefined}>
                <button
                    type="submit"
                    className="admin-primary mt-5"
                    disabled={!canRecord || form.processing || !form.data.records.some((record) => record.status)}
                >
                    {teacher && <Save size={16} aria-hidden="true" />}
                    {form.processing ? 'Enregistrement…' : 'Enregistrer les présences'}
                </button>
                {teacher && form.isDirty && (
                    <button
                        className="admin-secondary"
                        type="button"
                        disabled={form.processing}
                        onClick={() => {
                            form.resetAndClearErrors();
                            onDraftChange(false);
                        }}
                    >
                        Annuler les modifications
                    </button>
                )}
            </div>
        </form>
    );
}

import { Head, Link } from '@inertiajs/react';
import axios from 'axios';
import { ArrowRight, CalendarDays, CircleAlert, CircleCheck, LoaderCircle, ScanQrCode } from 'lucide-react';
import { useState } from 'react';
import '../../../../css/dashboard/attendance-check-in.css';

type Record = { status: string; checked_in_at: string | null };
type Props = {
    course: string;
    startsAt: string;
    submitUrl: string;
    attendanceUrl: string | null;
    existing: Record | null;
};

const date = new Intl.DateTimeFormat('fr-CD', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Kinshasa' });
const time = new Intl.DateTimeFormat('fr-CD', { timeStyle: 'short', timeZone: 'Africa/Kinshasa' });

export default function AttendanceCheckIn({ course, startsAt, submitUrl, attendanceUrl, existing }: Props) {
    const [record, setRecord] = useState(existing);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const confirmed = record?.status === 'present' || record?.status === 'late';
    const hasConflict = record !== null && !confirmed;
    const Icon = confirmed ? CircleCheck : hasConflict ? CircleAlert : ScanQrCode;

    async function confirm() {
        setBusy(true);
        setError('');
        try {
            const { data } = await axios.post<Record>(submitUrl, {}, { headers: { Accept: 'application/json' } });
            setRecord(data);
        } catch (failure) {
            const response = axios.isAxiosError<{ message?: string }>(failure) ? failure.response : undefined;
            setError(
                response?.status === 401 || response?.status === 419
                    ? 'Reconnectez-vous à votre espace étudiant, puis scannez le QR code à nouveau.'
                    : response?.data?.message || 'Le pointage n’a pas abouti. Vérifiez votre connexion et réessayez.',
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <main className="student-check-in">
            <Head title="Pointage de présence" />
            <section className="student-check-in-card" aria-labelledby="check-in-heading">
                <span className="student-check-in-icon">
                    <Icon size={32} aria-hidden />
                </span>
                <header aria-live="polite">
                    <h1 id="check-in-heading">
                        {confirmed ? 'Présence enregistrée' : hasConflict ? 'Appel déjà renseigné' : 'Confirmer ma présence'}
                    </h1>
                    <p>{course}</p>
                </header>
                <div className="student-check-in-session">
                    <CalendarDays size={19} aria-hidden />
                    <time dateTime={startsAt}>{date.format(new Date(startsAt))}</time>
                </div>
                {confirmed && record.checked_in_at && (
                    <p className="student-check-in-detail">
                        Pointage enregistré à <time dateTime={record.checked_in_at}>{time.format(new Date(record.checked_in_at))}</time>.
                    </p>
                )}
                {hasConflict && <p className="student-check-in-detail">Adressez-vous à l’enseignant pour faire vérifier votre statut.</p>}
                {error && (
                    <p role="alert" className="student-check-in-error">
                        {error}
                    </p>
                )}
                {record ? (
                    <Link className="student-check-in-action" href={attendanceUrl ?? route('dashboard.index')}>
                        {attendanceUrl ? 'Voir mes présences' : 'Retour à mon espace'} <ArrowRight size={18} aria-hidden />
                    </Link>
                ) : (
                    <button type="button" className="student-check-in-action" disabled={busy} onClick={confirm}>
                        {busy ? 'Enregistrement…' : 'Confirmer ma présence'}
                        {busy ? <LoaderCircle size={18} className="animate-spin" aria-hidden /> : <ArrowRight size={18} aria-hidden />}
                    </button>
                )}
            </section>
        </main>
    );
}

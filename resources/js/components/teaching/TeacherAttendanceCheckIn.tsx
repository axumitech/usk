import { time } from '@/lib/scheduleDates';
import axios from 'axios';
import { CircleCheck, CreditCard, LoaderCircle, Nfc, QrCode, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

type CheckInEndpoints = { qr_url: string; nfc_url: string };
type QrCodeData = { image: string; expires_at: string };
type CardResult = { name: string; status: 'present' | 'late'; checked_in_at: string | null; duplicate: boolean };
type RequestError = { message?: string; errors?: { uid?: string[] } };

const jsonHeaders = { Accept: 'application/json' };

function failureMessage(error: unknown, fallback: string) {
    if (!axios.isAxiosError<RequestError>(error)) return fallback;

    const { status, data } = error.response ?? {};
    if (status === 419) return 'Votre connexion a expiré. Rechargez la page pour continuer.';
    if (status === 429) return 'Les demandes sont trop rapprochées. Réessayez dans un instant.';
    if (status && status < 500) return data?.errors?.uid?.[0] ?? data?.message ?? fallback;

    return fallback;
}

function QrPresentation({ endpoint, title, end, onClose }: { endpoint: string; title: string; end: string; onClose: () => void }) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [qr, setQr] = useState<QrCodeData | null>(null);
    const [error, setError] = useState('');
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        const dialog = dialogRef.current;
        dialog?.showModal();
        return () => dialog?.close();
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        let refreshTimer: number | undefined;
        let expiryTimer: number | undefined;

        async function issueCode() {
            try {
                const { data } = await axios.post<QrCodeData>(endpoint, {}, { signal: controller.signal, headers: jsonHeaders });
                const expiresAt = Date.parse(data.expires_at);
                const validFor = Math.max(0, expiresAt - Date.now());
                if (controller.signal.aborted) return;

                setQr(data);
                setError('');
                window.clearTimeout(expiryTimer);
                expiryTimer = window.setTimeout(() => {
                    setQr(null);
                    if (expiresAt >= Date.parse(end)) setError('La fenêtre de pointage est terminée.');
                }, validFor);

                if (expiresAt < Date.parse(end)) {
                    refreshTimer = window.setTimeout(issueCode, Math.max(1000, validFor - 30_000));
                }
            } catch (error) {
                if (controller.signal.aborted) return;
                setError(failureMessage(error, 'Impossible de générer le QR. Réessayez.'));
            }
        }

        void issueCode();
        return () => {
            controller.abort();
            window.clearTimeout(refreshTimer);
            window.clearTimeout(expiryTimer);
        };
    }, [attempt, end, endpoint]);

    return (
        <dialog
            ref={dialogRef}
            className="teacher-checkin-dialog"
            aria-labelledby="teacher-checkin-qr-title"
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
        >
            <button type="button" className="teacher-checkin-close" aria-label="Fermer le QR de séance" onClick={onClose}>
                <X size={22} aria-hidden="true" />
            </button>
            <header>
                <h2 id="teacher-checkin-qr-title">Scannez pour pointer votre présence</h2>
                <p>{title}</p>
            </header>
            <div className="teacher-checkin-qr-image">
                {qr ? (
                    <img src={qr.image} alt="QR code de pointage de cette séance" width={520} height={520} />
                ) : (
                    <span role="status">
                        {error ? (
                            <QrCode size={42} aria-hidden="true" />
                        ) : (
                            <LoaderCircle size={36} className="teacher-checkin-spinner" aria-hidden="true" />
                        )}
                        {!error && 'Génération du QR…'}
                    </span>
                )}
            </div>
            <p>Ouvrez l’appareil photo de votre téléphone et suivez le lien qui s’affiche.</p>
            {qr && !error && <small>Le QR se renouvelle automatiquement pendant la séance.</small>}
            {error && (
                <div className="teacher-checkin-qr-error">
                    <p role="alert">{error}</p>
                    {Date.now() < Date.parse(end) && (
                        <button
                            className="admin-secondary"
                            type="button"
                            onClick={() => {
                                setQr(null);
                                setError('');
                                setAttempt(attempt + 1);
                            }}
                        >
                            Réessayer
                        </button>
                    )}
                </div>
            )}
        </dialog>
    );
}

function CardReader({ endpoint, onRecorded }: { endpoint: string; onRecorded: () => void }) {
    const inputRef = useRef<HTMLInputElement>(null);
    const requestRef = useRef<AbortController | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<CardResult | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        inputRef.current?.focus();
        return () => requestRef.current?.abort();
    }, []);

    async function readCard(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const input = inputRef.current;
        const uid = input?.value.trim();
        if (!input || !uid) return;

        input.value = '';
        input.focus();

        if (uid.length > 64) {
            setResult(null);
            setError('L’identifiant de la carte dépasse la longueur autorisée. Vérifiez la configuration du lecteur.');
            return;
        }

        if (requestRef.current) {
            setError('Un pointage est en cours. Présentez à nouveau la carte dans un instant.');
            return;
        }

        const controller = new AbortController();
        requestRef.current = controller;
        setLoading(true);
        setError('');
        setResult(null);
        try {
            const { data } = await axios.post<CardResult>(endpoint, { uid }, { signal: controller.signal, headers: jsonHeaders });
            if (controller.signal.aborted) return;

            setResult(data);
            onRecorded();
        } catch (error) {
            if (!controller.signal.aborted) setError(failureMessage(error, 'Pointage indisponible. Présentez à nouveau la carte.'));
        } finally {
            requestRef.current = null;
            if (!controller.signal.aborted) setLoading(false);
        }
    }

    return (
        <form className="teacher-checkin-reader" aria-busy={loading} onSubmit={(event) => void readCard(event)}>
            <label htmlFor="teacher-checkin-uid">Identifiant lu par le lecteur</label>
            <div>
                <input
                    id="teacher-checkin-uid"
                    ref={inputRef}
                    type="text"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="En attente d’une carte…"
                />
                <button type="submit" className="admin-secondary">
                    Valider
                </button>
            </div>
            <p>Gardez le curseur dans ce champ pendant les lectures.</p>
            {loading && <p role="status">Pointage en cours…</p>}
            {error && (
                <p className="teacher-checkin-error" role="alert">
                    {error}
                </p>
            )}
            {result && (
                <p className="teacher-checkin-success" role="status">
                    <CircleCheck size={17} aria-hidden="true" />
                    <span>
                        <strong>{result.name}</strong> ·{' '}
                        {result.duplicate ? 'Déjà pointé' : result.status === 'late' ? 'Retard enregistré' : 'Présence enregistrée'}
                        {result.checked_in_at && ` à ${time(result.checked_in_at)}`}
                    </span>
                </p>
            )}
        </form>
    );
}

export default function TeacherAttendanceCheckIn({
    endpoints,
    title,
    end,
    draft,
    refreshing,
    onRefresh,
}: {
    endpoints: CheckInEndpoints;
    title: string;
    end: string;
    draft: boolean;
    refreshing: boolean;
    onRefresh: () => void;
}) {
    const [qrOpen, setQrOpen] = useState(false);
    const [readerOpen, setReaderOpen] = useState(false);

    return (
        <section className="teaching-profile teacher-checkin" aria-labelledby="teacher-checkin-heading">
            <header className="teaching-section-heading">
                <div className="teacher-attendance-heading">
                    <span className="teacher-attendance-symbol">
                        <Nfc size={21} aria-hidden="true" />
                    </span>
                    <div>
                        <h2 id="teacher-checkin-heading">Pointage de la séance</h2>
                        <p>Les présences rejoignent la liste d’appel avec leur heure de pointage.</p>
                    </div>
                </div>
                <button className="admin-secondary" type="button" onClick={onRefresh} disabled={draft || refreshing}>
                    <RefreshCw size={16} className={refreshing ? 'teacher-checkin-spinner' : undefined} aria-hidden="true" />
                    Actualiser la liste
                </button>
            </header>
            {draft && <p className="teacher-attendance-note">Enregistrez ou annulez vos modifications pour actualiser la liste d’appel.</p>}
            <div className="teacher-checkin-options">
                <article>
                    <span className="teacher-checkin-icon">
                        <QrCode size={23} aria-hidden="true" />
                    </span>
                    <h3>QR de séance</h3>
                    <p>Projetez le QR pour que chaque étudiant puisse pointer avec son téléphone.</p>
                    <button type="button" className="admin-primary" onClick={() => setQrOpen(true)}>
                        Afficher le QR
                    </button>
                </article>
                <article>
                    <span className="teacher-checkin-icon">
                        <CreditCard size={23} aria-hidden="true" />
                    </span>
                    <h3>Carte étudiante NFC</h3>
                    <p>
                        Branchez un lecteur configuré pour envoyer l’identifiant de la carte suivi de la touche Entrée. L’administration associe
                        chaque carte à l’inscription de l’étudiant.
                    </p>
                    <button
                        type="button"
                        className="admin-primary"
                        onClick={() => setReaderOpen(!readerOpen)}
                        aria-expanded={readerOpen}
                        aria-controls={readerOpen ? 'teacher-checkin-reader' : undefined}
                    >
                        {readerOpen ? 'Fermer le lecteur' : 'Ouvrir le lecteur'}
                    </button>
                    {readerOpen && (
                        <div id="teacher-checkin-reader">
                            <CardReader endpoint={endpoints.nfc_url} onRecorded={onRefresh} />
                        </div>
                    )}
                </article>
            </div>
            {qrOpen && <QrPresentation endpoint={endpoints.qr_url} title={title} end={end} onClose={() => setQrOpen(false)} />}
        </section>
    );
}

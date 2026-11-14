import FeedbackToast from '@/components/admin/FeedbackToast';
import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import { Head, Link, useForm } from '@inertiajs/react';
import { ArrowLeft, CalendarClock, Clock3, Plus, Save, Trash2 } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import '../../../../css/dashboard/school-appointment-agenda.css';
import '../../../../css/dashboard/school-appointment-availability.css';

type AvailabilityWindow = { weekday: number; starts_at: string; ends_at: string };
type DraftWindow = AvailabilityWindow & { key: number };
type AvailabilityData = {
    service: string;
    services: { key: string; label: string; url: string }[];
    windows: AvailabilityWindow[];
    configured: boolean;
    slot_minutes: number;
    revision: number;
    update_url: string;
    agenda_url: string;
};

const weekdays = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

function AvailabilityEditor({ availability, success }: { availability: AvailabilityData; success?: string | null }) {
    const nextKey = useRef(availability.windows.length);
    const [dismissed, setDismissed] = useState(false);
    const service = availability.services.find(({ key }) => key === availability.service);
    const form = useForm({
        windows: availability.windows.map((window, key): DraftWindow => ({ ...window, key })),
        expected_revision: availability.revision,
    });
    const errors = form.errors as Record<string, string | undefined>;

    function addWindow(weekday: number) {
        form.clearErrors();
        form.setData('windows', [...form.data.windows, { key: nextKey.current++, weekday, starts_at: '', ends_at: '' }]);
    }

    function removeWindow(key: number) {
        form.clearErrors();
        form.setData(
            'windows',
            form.data.windows.filter((window) => window.key !== key),
        );
    }

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        form.transform(({ windows, expected_revision }) => ({
            windows: windows.map(({ weekday, key }) => ({
                weekday,
                starts_at: String(values.get(`start-${key}`) ?? ''),
                ends_at: String(values.get(`end-${key}`) ?? ''),
            })),
            expected_revision,
        }));
        form.put(availability.update_url, { preserveScroll: true, preserveState: 'errors' });
    }

    return (
        <div className="school-agenda school-availability">
            {success && !dismissed && <FeedbackToast feedback={{ id: 0, tone: 'success', message: success }} onDismiss={() => setDismissed(true)} />}
            <Link href={availability.agenda_url} className="school-agenda-button school-agenda-back">
                <ArrowLeft size={18} aria-hidden="true" /> Retour à l’agenda
            </Link>
            <header className="school-agenda-hero">
                <div>
                    <p className="school-agenda-section">
                        <CalendarClock size={19} aria-hidden="true" /> Scolarité
                    </p>
                    <h1>Disponibilités des services</h1>
                    <p className="school-agenda-clock">
                        <Clock3 size={15} aria-hidden="true" /> Créneaux de {availability.slot_minutes} min · Heure de Kinshasa
                    </p>
                </div>
            </header>
            <nav className="school-agenda-services" aria-label="Choisir un service">
                {availability.services.map(({ key, label, url }) => (
                    <Link key={key} href={url} aria-current={key === availability.service ? 'page' : undefined}>
                        {label}
                    </Link>
                ))}
            </nav>
            <section className="school-agenda-calendar" aria-labelledby="school-availability-title">
                <header className="school-availability-heading">
                    <div>
                        <h2 id="school-availability-title">{service?.label}</h2>
                        <p>Les plages se répètent chaque semaine. Ajoutez une plage pour chaque période d’ouverture.</p>
                    </div>
                    <span data-open={availability.windows.length > 0} className="school-availability-state">
                        {availability.windows.length > 0
                            ? 'Réservations ouvertes'
                            : availability.configured
                              ? 'Réservations fermées'
                              : 'À configurer'}
                    </span>
                </header>
                <form className="school-availability-form" onSubmit={submit}>
                    <fieldset disabled={form.processing}>
                        <div className="school-availability-week">
                            {weekdays.map((day, offset) => {
                                const weekday = offset + 1;
                                const rows = form.data.windows.flatMap((window, index) => (window.weekday === weekday ? [{ window, index }] : []));
                                return (
                                    <section className="school-availability-day" key={day} aria-labelledby={`school-availability-day-${weekday}`}>
                                        <header>
                                            <h3 id={`school-availability-day-${weekday}`}>{day}</h3>
                                            {rows.length === 0 && <span>Fermé</span>}
                                        </header>
                                        <div className="school-availability-ranges">
                                            {rows.map(({ window, index }, position) => {
                                                const startError = errors[`windows.${index}.starts_at`];
                                                const endError = errors[`windows.${index}.ends_at`] ?? errors[`windows.${index}.weekday`];
                                                return (
                                                    <div className="school-availability-range" key={window.key}>
                                                        <label>
                                                            Début
                                                            <input
                                                                type="time"
                                                                name={`start-${window.key}`}
                                                                required
                                                                defaultValue={window.starts_at}
                                                                aria-label={`Début · ${day} · Plage ${position + 1}`}
                                                                aria-invalid={Boolean(startError)}
                                                            />
                                                        </label>
                                                        <label>
                                                            Fin
                                                            <input
                                                                type="time"
                                                                name={`end-${window.key}`}
                                                                required
                                                                defaultValue={window.ends_at}
                                                                aria-label={`Fin · ${day} · Plage ${position + 1}`}
                                                                aria-invalid={Boolean(endError)}
                                                            />
                                                        </label>
                                                        <button
                                                            type="button"
                                                            className="school-agenda-button school-availability-remove"
                                                            onClick={() => removeWindow(window.key)}
                                                            aria-label={`Retirer la plage ${position + 1} du ${day.toLocaleLowerCase('fr')}`}
                                                        >
                                                            <Trash2 size={17} aria-hidden="true" />
                                                        </button>
                                                        {(startError || endError) && (
                                                            <p className="school-availability-error" role="alert">
                                                                {startError || endError}
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <button
                                            type="button"
                                            className="school-agenda-button school-availability-add"
                                            onClick={() => addWindow(weekday)}
                                            aria-label={`Ajouter une plage le ${day.toLocaleLowerCase('fr')}`}
                                        >
                                            <Plus size={17} aria-hidden="true" /> Ajouter une plage
                                        </button>
                                    </section>
                                );
                            })}
                        </div>
                        {(errors.windows || errors.expected_revision) && (
                            <p className="school-availability-error" role="alert">
                                {errors.windows || errors.expected_revision}
                                {errors.expected_revision && (
                                    <button type="button" className="school-availability-reload" onClick={() => window.location.reload()}>
                                        Actualiser les disponibilités
                                    </button>
                                )}
                            </p>
                        )}
                        <footer className="school-availability-footer">
                            <p>Les rendez-vous déjà réservés restent en place si vous modifiez les plages.</p>
                            <button type="submit" className="school-agenda-button school-availability-save">
                                <Save size={18} aria-hidden="true" /> {form.processing ? 'Enregistrement…' : 'Enregistrer les disponibilités'}
                            </button>
                        </footer>
                    </fieldset>
                </form>
            </section>
        </div>
    );
}

export default function Availability({ availability, success }: { availability: AvailabilityData; success?: string | null }) {
    return (
        <Dashboard hideAppsNavigation>
            <Head title="Disponibilités des services · Scolarité" />
            <AvailabilityEditor key={availability.service} availability={availability} success={success} />
        </Dashboard>
    );
}

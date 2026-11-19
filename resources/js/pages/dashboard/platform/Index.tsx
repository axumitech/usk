import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import { Head, useForm, usePage } from '@inertiajs/react';
import type { FormEvent, ReactNode } from 'react';

type Institution = { name: string; code: string; acronym: string | null; revision: number };
type Props = { institution: Institution | null; services: Record<string, string>; events: { id: number; action: string; created_at: string }[] };
const base = '/app/dashboard/platform';
const eventLabels: Record<string, string> = {
    academic_structure_university_saved: 'Identité institutionnelle enregistrée',
    institutional_admin_granted: 'Administration institutionnelle attribuée',
    institutional_admin_revoked: 'Administration institutionnelle retirée',
    platform_permission_cache_refreshed: 'Cache des permissions actualisé',
};
const button = 'rounded-md bg-blue-800 px-4 py-2 font-medium text-white hover:bg-blue-900 disabled:opacity-50';
const input = 'mt-1 block w-full rounded border border-slate-400 bg-transparent px-3 py-2 text-inherit';

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
    return (
        <label className="block">
            <span>{label}</span>
            {children}
            {error && (
                <span role="alert" className="text-red-700 dark:text-red-300">
                    {error}
                </span>
            )}
        </label>
    );
}

export default function Platform({ institution, services, events }: Props) {
    const grants = usePage<{ auth: { user: { permissions: string[] } } }>().props.auth.user.permissions;
    const identity = useForm({
        name: institution?.name ?? '',
        code: institution?.code ?? '',
        acronym: institution?.acronym ?? '',
        revision: institution?.revision ?? 0,
        reason: '',
    });
    const delegation = useForm({ email: '', operation: 'grant', reason: '', current_password: '' });
    const maintenance = useForm({ reason: '' });
    const changeIdentity = (event: FormEvent) => {
        event.preventDefault();
        identity.transform((data) => ({ ...data, revision: institution?.revision ?? 0 }));
        identity.put(base + '/institution', { preserveScroll: true, onSuccess: () => identity.reset('reason') });
    };
    return (
        <Dashboard>
            <Head title="Administration de la plateforme" />
            <main className="mx-auto max-w-5xl space-y-8 p-4 text-slate-900 sm:p-8 dark:text-slate-100">
                <h1 className="text-3xl font-semibold">Administration de la plateforme</h1>
                <section>
                    <h2 className="mb-3 text-xl font-semibold">Services configurés</h2>
                    <dl className="grid gap-3 sm:grid-cols-2">
                        {Object.entries(services).map(([name, value]) => (
                            <div key={name}>
                                <dt>{name}</dt>
                                <dd className="font-semibold">{value}</dd>
                            </div>
                        ))}
                    </dl>
                </section>
                {grants.includes('configure platform institution') && (
                    <section>
                        <h2 className="mb-3 text-xl font-semibold">Établissement actif</h2>
                        <form className="grid max-w-xl gap-3" onSubmit={changeIdentity}>
                            {(['name', 'code', 'acronym', 'reason'] as const).map((key) => (
                                <Field
                                    key={key}
                                    label={
                                        { name: 'Nom de l’établissement', code: 'Code', acronym: 'Sigle', reason: 'Motif de la modification' }[key]
                                    }
                                    error={identity.errors[key]}
                                >
                                    <input
                                        className={input}
                                        required={key !== 'acronym'}
                                        minLength={key === 'reason' ? 8 : undefined}
                                        value={identity.data[key]}
                                        onChange={(event) => identity.setData(key, event.target.value)}
                                    />
                                </Field>
                            ))}
                            {identity.errors.revision && <p role="alert">{identity.errors.revision}</p>}
                            <button className={button} disabled={identity.processing}>
                                Enregistrer l’établissement
                            </button>
                        </form>
                    </section>
                )}
                {grants.includes('delegate institutional administration') && (
                    <section>
                        <h2 className="mb-3 text-xl font-semibold">Administrateur institutionnel</h2>
                        <form
                            className="grid max-w-xl gap-3"
                            onSubmit={(event) => {
                                event.preventDefault();
                                delegation.post(base + '/administrators', {
                                    preserveScroll: true,
                                    onFinish: () => delegation.reset('current_password'),
                                });
                            }}
                        >
                            <Field label="Adresse du compte administratif vérifié" error={delegation.errors.email}>
                                <input
                                    type="email"
                                    className={input}
                                    required
                                    value={delegation.data.email}
                                    onChange={(e) => delegation.setData('email', e.target.value)}
                                />
                            </Field>
                            <Field label="Opération" error={delegation.errors.operation}>
                                <select
                                    className={input}
                                    value={delegation.data.operation}
                                    onChange={(e) => delegation.setData('operation', e.target.value)}
                                >
                                    <option value="grant">Attribuer la délégation</option>
                                    <option value="revoke">Retirer la délégation</option>
                                </select>
                            </Field>
                            <Field label="Motif de la délégation" error={delegation.errors.reason}>
                                <input
                                    className={input}
                                    required
                                    minLength={8}
                                    value={delegation.data.reason}
                                    onChange={(e) => delegation.setData('reason', e.target.value)}
                                />
                            </Field>
                            <Field label="Votre mot de passe actuel" error={delegation.errors.current_password}>
                                <input
                                    type="password"
                                    autoComplete="current-password"
                                    className={input}
                                    required
                                    value={delegation.data.current_password}
                                    onChange={(e) => delegation.setData('current_password', e.target.value)}
                                />
                            </Field>
                            <button className={button} disabled={delegation.processing}>
                                Confirmer la délégation
                            </button>
                        </form>
                    </section>
                )}
                {grants.includes('maintain permission cache') && (
                    <section>
                        <h2 className="mb-3 text-xl font-semibold">Cache des permissions</h2>
                        <form
                            className="grid max-w-xl gap-3"
                            onSubmit={(e) => {
                                e.preventDefault();
                                maintenance.post(base + '/permission-cache', { preserveScroll: true, onSuccess: () => maintenance.reset() });
                            }}
                        >
                            <Field label="Motif de maintenance" error={maintenance.errors.reason}>
                                <input
                                    className={input}
                                    required
                                    minLength={8}
                                    value={maintenance.data.reason}
                                    onChange={(e) => maintenance.setData('reason', e.target.value)}
                                />
                            </Field>
                            <button className={button} disabled={maintenance.processing}>
                                Actualiser le cache
                            </button>
                        </form>
                    </section>
                )}
                <section>
                    <h2 className="mb-3 text-xl font-semibold">Journal de la plateforme</h2>
                    {events.length ? (
                        <ul className="space-y-2">
                            {events.map((item) => (
                                <li key={item.id}>
                                    {eventLabels[item.action]} ·{' '}
                                    <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('fr-CD')}</time>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p>Aucune opération enregistrée.</p>
                    )}
                </section>
            </main>
        </Dashboard>
    );
}

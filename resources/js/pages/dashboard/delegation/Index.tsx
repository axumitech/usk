import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import { Head, Link, useForm } from '@inertiajs/react';
import RectorDashboard, { type RectorProps } from './RectorDashboard';

type Props = {
    title: string;
    programs?: { id: number; code: string; name: string; is_active: boolean }[];
    promotions?: { id: number; name: string }[];
} & Partial<RectorProps>;

export default function Delegation({ title, indicators, years, report, programs, promotions }: Props) {
    const form = useForm({ promotion: promotions?.[0]?.id ?? 0, message: '' });
    return (
        <Dashboard>
            <Head title={title} />
            {indicators && years ? (
                <RectorDashboard indicators={indicators} years={years} report={report ?? null} />
            ) : (
                <div className="mx-auto max-w-4xl space-y-6 p-4 text-slate-900 sm:p-8 dark:text-slate-100">
                    <h1 className="text-3xl font-semibold">{title}</h1>
                    {programs && (
                        <section>
                            <h2 className="mb-3 text-xl font-semibold">Programmes de vos départements</h2>
                            {programs.length ? (
                                <ul>
                                    {programs.map((p) => (
                                        <li key={p.id}>
                                            {p.code} · {p.name}
                                            {!p.is_active && ' (inactif)'}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p>Aucun programme rattaché à vos départements.</p>
                            )}
                        </section>
                    )}
                    {promotions && (
                        <section className="space-y-4">
                            <Link className="underline" href="/app/dashboard/student">
                                Mon espace étudiant
                            </Link>
                            <h2 className="text-xl font-semibold">Message à la promotion</h2>
                            {promotions.length ? (
                                <form
                                    className="grid max-w-xl gap-3"
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        form.post('/app/dashboard/delegation/promotion', {
                                            preserveScroll: true,
                                            onSuccess: () => form.reset('message'),
                                        });
                                    }}
                                >
                                    <label>
                                        Promotion
                                        <select
                                            className="block w-full rounded border bg-transparent p-2"
                                            value={form.data.promotion}
                                            onChange={(e) => form.setData('promotion', Number(e.target.value))}
                                        >
                                            {promotions.map((p) => (
                                                <option key={p.id} value={p.id}>
                                                    {p.name}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <label>
                                        Message
                                        <textarea
                                            className="block w-full rounded border bg-transparent p-2"
                                            required
                                            minLength={5}
                                            maxLength={500}
                                            value={form.data.message}
                                            onChange={(e) => form.setData('message', e.target.value)}
                                        />
                                    </label>
                                    {(form.errors.promotion || form.errors.message) && (
                                        <p role="alert">{form.errors.promotion || form.errors.message}</p>
                                    )}
                                    <button
                                        className="rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white hover:bg-emerald-800"
                                        disabled={form.processing}
                                    >
                                        Envoyer à ma promotion
                                    </button>
                                </form>
                            ) : (
                                <p>Aucune promotion active pour votre inscription.</p>
                            )}
                        </section>
                    )}
                </div>
            )}
        </Dashboard>
    );
}

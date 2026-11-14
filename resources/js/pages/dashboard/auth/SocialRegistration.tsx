import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import NationalityField from '@/components/section/dashboard/auth/NationalityField';
import { Head, Link, useForm, usePage } from '@inertiajs/react';

export default function SocialRegistration({ nationalities }: { nationalities: Record<string, string> }) {
    const { data, setData, errors, post, processing } = useForm({ nationality_code: '' });
    const { errors: pageErrors } = usePage<{ errors: { email?: string } }>().props;

    return (
        <Dashboard authPage>
            <Head title="Finaliser la création du compte" />
            <div className="usk-auth-form flex w-full items-center justify-center">
                <div className="usk-auth-panel w-full min-w-0">
                    <h1 className="mb-6 text-center text-2xl font-bold text-gray-800">Finaliser la création du compte</h1>
                    <form
                        className="space-y-5"
                        onSubmit={(event) => {
                            event.preventDefault();
                            post(route('social-registration.complete'));
                        }}
                    >
                        <NationalityField
                            nationalities={nationalities}
                            value={data.nationality_code}
                            onChange={(nationality) => setData('nationality_code', nationality)}
                            error={errors.nationality_code}
                        />
                        {pageErrors.email && <p className="text-sm text-red-700">{pageErrors.email}</p>}
                        <button
                            type="submit"
                            className="w-full rounded-lg bg-linear-to-r from-emerald-500 to-teal-600 py-3.5 font-medium text-white hover:from-emerald-600 hover:to-teal-700 disabled:opacity-60"
                            disabled={processing}
                        >
                            {processing ? 'Création du compte…' : 'Créer mon compte'}
                        </button>
                    </form>
                    <Link href={route('login.show')} className="mt-4 block text-center text-sm font-medium text-emerald-700">
                        Retour à la connexion
                    </Link>
                </div>
            </div>
        </Dashboard>
    );
}

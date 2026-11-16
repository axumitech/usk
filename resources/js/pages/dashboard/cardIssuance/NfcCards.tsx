import AdminModal from '@/components/admin/AdminModal';
import PageHeading from '@/components/admin/PageHeading';
import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import CardPagination from '@/components/studentCards/CardPagination';
import { Head, router, useForm } from '@inertiajs/react';
import { Link2Off, Nfc, Search } from 'lucide-react';
import { useState } from 'react';
import '../../../../css/dashboard/card-issuance.css';
import '../../../../css/dashboard/card-requests.css';

type Enrollment = {
    id: number;
    name: string;
    matricule: string | null;
    year: string;
    level: string;
    linked: boolean;
    eligible: boolean;
};

type Props = {
    rows: { data: Enrollment[]; prev_page_url: string | null; next_page_url: string | null };
    term: string;
    success: string | null;
};

type Selection = { student: Enrollment; remove?: boolean };

const prefix = 'dashboard.admin.card-issuance.nfc.';

function CardForm({ selection: { student, remove }, close }: { selection: Selection; close: () => void }) {
    const form = useForm({ uid: '' });
    const title = remove ? 'Dissocier cette carte NFC' : student.linked ? 'Remplacer la carte NFC' : 'Associer une carte NFC';

    return (
        <AdminModal
            title={title}
            description={[student.name, student.matricule, student.year].filter(Boolean).join(' · ')}
            formId="student-nfc-card"
            submitLabel={remove ? 'Dissocier' : 'Associer la carte'}
            onClose={close}
            busy={form.processing}
            errors={form.errors}
        >
            <form
                id="student-nfc-card"
                onSubmit={(event) => {
                    event.preventDefault();
                    const options = { preserveScroll: true, onSuccess: close };
                    if (remove) form.delete(route(prefix + 'remove', student.id), options);
                    else form.put(route(prefix + 'assign', student.id), options);
                }}
            >
                {remove ? (
                    <p>Cette carte ne pourra plus servir à pointer pour cette inscription.</p>
                ) : (
                    <>
                        <p>
                            Approchez le badge du lecteur configuré pour transmettre son identifiant (UID), puis la touche Entrée.
                            {student.linked && ' La précédente carte sera dissociée.'}
                        </p>
                        <label className="ci-nfc-field">
                            Identifiant de la carte *
                            <input
                                type="text"
                                autoComplete="off"
                                autoCapitalize="characters"
                                spellCheck={false}
                                required
                                maxLength={64}
                                value={form.data.uid}
                                onChange={(event) => form.setData('uid', event.target.value)}
                            />
                        </label>
                    </>
                )}
            </form>
        </AdminModal>
    );
}

export default function NfcCards({ rows, term, success }: Props) {
    const [query, setQuery] = useState(term);
    const [selected, setSelected] = useState<Selection | null>(null);

    return (
        <Dashboard hideAppsNavigation>
            <Head title="Cartes NFC" />
            <div className="cr-page">
                <PageHeading title="Cartes NFC" description="Associez les badges physiques aux inscriptions étudiantes pour le pointage en cours." />
                {success && (
                    <p className="ci-success" role="status">
                        {success}
                    </p>
                )}
                <section className="cr-panel" aria-label="Inscriptions étudiantes">
                    <form
                        className="ci-search"
                        onSubmit={(event) => {
                            event.preventDefault();
                            router.get(route(prefix + 'index'), { q: query.trim() || undefined });
                        }}
                    >
                        <label>
                            Rechercher un étudiant
                            <input
                                type="search"
                                maxLength={100}
                                value={query}
                                placeholder="Nom ou matricule"
                                onChange={(event) => setQuery(event.target.value)}
                            />
                        </label>
                        <button type="submit" className="admin-secondary">
                            <Search size={16} aria-hidden /> Rechercher
                        </button>
                    </form>
                    {rows.data.length ? (
                        <div className="cr-table-wrap" data-dashboard-panel="q page">
                            <table className="cr-table">
                                <thead>
                                    <tr>
                                        <th scope="col">Étudiant</th>
                                        <th scope="col">Inscription</th>
                                        <th scope="col">Carte</th>
                                        <th scope="col">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.data.map((student) => (
                                        <tr key={student.id}>
                                            <td>
                                                <strong>{student.name}</strong>
                                                <small>{student.matricule}</small>
                                            </td>
                                            <td>
                                                {student.year}
                                                <small>{student.level}</small>
                                            </td>
                                            <td>{student.linked ? 'Associée' : 'À associer'}</td>
                                            <td>
                                                <div className="ci-nfc-actions">
                                                    {student.eligible && (
                                                        <button type="button" className="admin-primary" onClick={() => setSelected({ student })}>
                                                            <Nfc size={16} aria-hidden /> {student.linked ? 'Remplacer' : 'Associer'}
                                                        </button>
                                                    )}
                                                    {student.linked && (
                                                        <button
                                                            type="button"
                                                            className="admin-secondary"
                                                            onClick={() => setSelected({ student, remove: true })}
                                                        >
                                                            <Link2Off size={16} aria-hidden /> Dissocier
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="cr-empty" data-dashboard-panel="q page">
                            Aucune inscription trouvée.
                        </p>
                    )}
                    <CardPagination
                        previous={rows.prev_page_url ? { href: rows.prev_page_url, label: 'Précédente' } : undefined}
                        next={rows.next_page_url ? { href: rows.next_page_url, label: 'Suivante' } : undefined}
                        preserveScroll
                    />
                </section>
            </div>
            {selected && <CardForm selection={selected} close={() => setSelected(null)} />}
        </Dashboard>
    );
}

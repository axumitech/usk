import Pagination from '@/components/admin/Pagination';
import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import { documentLabels, documentReason, type DocumentRequest, type DocumentRow, type Page } from '@/components/student/OfficialDocumentCenter';
import AcademicForm, { type Field, type FormSpec } from '@/pages/dashboard/studentAcademic/AcademicForm';
import { Head, Link, router } from '@inertiajs/react';
import {
    Archive as ArchiveIcon,
    ArrowRight,
    BookOpen,
    ChevronRight,
    ClipboardList,
    FileCheck2,
    FileText,
    Filter,
    Inbox,
    RotateCcw,
} from 'lucide-react';
import { useState } from 'react';
import '../../../../css/dashboard/official-documents.css';

type Type = { id: number; name: string; kind: string; code: string; active: boolean; policy: { copies: boolean } };
type Template = {
    id: number;
    title: string;
    version: number;
    signer_id: number;
    author_id: number;
    approved_at: string | null;
    withdrawn_at: string | null;
    capacity: string;
    body: string;
    assets: string[];
};
type Archive = { id: number; kind: string; reference: string; year: string; revoked_at: string | null };
type Props = {
    actor: number;
    permissions: { manage: boolean; approve: boolean; issue: boolean };
    universities: { id: number; name: string; faculties: { id: number; name: string }[] }[];
    programs: { id: number; name: string; faculty_id: number }[];
    types: Page<Type>;
    type: Type | null;
    templates: Page<Template> | null;
    filters: { academic?: number; type?: number; status?: string; q?: string; kind?: string; archive?: string };
    entry: { id: number; name: string; matricule: string; year: string; types: { id: number; name: string }[] } | null;
    counts: Record<string, number>;
    requests: Page<DocumentRequest & { reason: string }>;
    documents: Page<DocumentRow>;
    archive_counts: Record<string, number>;
    audit: { id: number; actor_id: number; action: string; reason: string | null; created_at: string }[];
    result_archives: Page<Archive> | null;
};

const prefix = 'dashboard.admin.official-documents.';
const kinds = {
    enrollment: 'Attestation d’inscription',
    schooling: 'Certificat de scolarité',
    success: 'Attestation de réussite',
    diploma: 'Diplôme',
    card: 'Carte étudiante',
};
const kindOptions = Object.entries(kinds).map(([value, label]) => ({ value, label }));
const field = (name: string, label: string, type?: string, required = false): Field => ({ name, label, type, required });

export default function Administration({
    actor,
    permissions,
    universities,
    programs,
    types,
    type,
    templates,
    filters,
    entry,
    counts,
    requests,
    documents,
    archive_counts,
    audit,
    result_archives,
}: Props) {
    const [modal, setModal] = useState<FormSpec>();
    const [message, setMessage] = useState('');
    function action(
        title: string,
        endpoint: string,
        params: Record<string, number> = {},
        values: FormSpec['values'] = {},
        fields: Field[] = [documentReason],
        description = 'Cette action est journalisée.',
    ) {
        setModal({ title, action: route(prefix + endpoint, { ...filters, ...params }), description, values, fields, requireSuccessFlash: true });
    }
    function start(entryId: number, typeId: number, title: string, operation = 'initial', previous: number | null = null) {
        action(
            title,
            'submit',
            { entry: entryId },
            { type_id: typeId, action: operation, previous_id: previous, operation_key: crypto.randomUUID() },
        );
    }
    function transition(ticket: DocumentRequest, operation: string, label: string) {
        action(
            label,
            'transition',
            { ticket: ticket.id },
            { action: operation, revision: ticket.document_revision },
            ticket.kind === 'diploma' && operation === 'approve'
                ? [documentReason, field('mandate', 'Mandat de délivrance', 'textarea', true)]
                : [documentReason],
        );
    }
    return (
        <Dashboard hideAppsNavigation>
            <Head title="Documents officiels" />
            <main className="official-admin">
                <header className="official-heading">
                    <h1>Documents officiels</h1>
                    <nav aria-label="Rubriques des documents officiels">
                        <a href="#catalogue">
                            <BookOpen />
                            Catalogue
                        </a>
                        <a href="#demandes">
                            <Inbox />
                            Demandes
                        </a>
                        <a href="#archives">
                            <ArchiveIcon />
                            Archives et délivrance
                        </a>
                    </nav>
                </header>
                {message && (
                    <p className="official-notice" role="status">
                        {message}
                    </p>
                )}
                <dl className="official-stats">
                    <div>
                        <dt>
                            <ClipboardList />
                            Demandes au total
                        </dt>
                        <dd>{Object.values(counts).reduce((sum, value) => sum + Number(value), 0)}</dd>
                    </div>
                    <div>
                        <dt>
                            <Inbox />
                            Demandes reçues à contrôler
                        </dt>
                        <dd>{counts.open ?? 0}</dd>
                    </div>
                    <div>
                        <dt>
                            <FileCheck2 />
                            Documents à remettre
                        </dt>
                        <dd>{archive_counts.delivery ?? 0}</dd>
                    </div>
                </dl>
                <form
                    className="official-panel official-filters"
                    aria-labelledby="doc-filters"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        if (type && form.get('kind') === type.kind) form.set('type', String(type.id));
                        router.get(
                            route(prefix + 'index'),
                            Object.fromEntries([...form].filter(([, value]) => value !== '').map(([name, value]) => [name, String(value)])),
                        );
                    }}
                >
                    <h2 id="doc-filters">
                        <Filter />
                        Filtres
                    </h2>
                    <label>
                        Inscription (ID)
                        <input name="academic" type="number" placeholder="N° d’inscription" min="1" defaultValue={filters.academic} />
                    </label>
                    <label>
                        Matricule de la demande
                        <input name="q" type="search" maxLength={100} placeholder="Rechercher un matricule" defaultValue={filters.q} />
                    </label>
                    <label>
                        Famille
                        <select name="kind" defaultValue={filters.kind || ''}>
                            <option value="">Toutes</option>
                            {kindOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Statut de la demande
                        <select name="status" defaultValue={filters.status || ''}>
                            <option value="">Tous</option>
                            {['open', 'reviewed', 'correction', 'approved', 'refused', 'issued'].map((status) => (
                                <option key={status} value={status}>
                                    {documentLabels[status]} ({counts[status] ?? 0})
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className="official-filter-actions">
                        <button className="admin-primary" type="submit">
                            <Filter />
                            Filtrer
                        </button>
                        <Link className="admin-secondary" href={route(prefix + 'index')}>
                            <RotateCcw />
                            Réinitialiser
                        </Link>
                    </div>
                </form>

                <section id="catalogue" className="official-panel">
                    <h2>
                        <BookOpen />
                        Catalogue
                    </h2>
                    {permissions.manage && (
                        <button
                            className="admin-primary"
                            type="button"
                            onClick={() =>
                                action('Ajouter un type documentaire', 'type', {}, {}, [
                                    {
                                        ...field('university_id', 'Établissement', 'select', true),
                                        clears: ['faculty_id', 'program_id'],
                                        options: universities.map(({ id, name }) => ({ value: id, label: name })),
                                    },
                                    {
                                        ...field('faculty_id', 'Faculté', 'select', true),
                                        clears: 'program_id',
                                        optionsFor: (values) =>
                                            universities
                                                .find(({ id }) => id === Number(values.university_id))
                                                ?.faculties.map(({ id, name }) => ({ value: id, label: name })) ?? [],
                                    },
                                    { ...field('kind', 'Famille', 'select', true), options: kindOptions },
                                    field('code', 'Code', 'text', true),
                                    field('name', 'Libellé', 'text', true),
                                    field('student_request', 'Demandes étudiantes', 'checkbox'),
                                    field('download', 'Téléchargement étudiant', 'checkbox'),
                                    field('print', 'Impression autorisée', 'checkbox'),
                                    field('copies', 'Duplicata ou rectification', 'checkbox'),
                                    field('financial_gate', 'Appliquer la règle de délivrance financière', 'checkbox'),
                                    field('valid_days', 'Validité en jours', 'number'),
                                    field('decisions', 'Codes de décision autorisés pour la réussite ou le diplôme'),
                                    field('minimum_credits', 'Crédits requis en centièmes', 'number'),
                                    {
                                        ...field('program_id', 'Programme', 'select'),
                                        optionsFor: (values) =>
                                            universities
                                                .find(({ id }) => id === Number(values.university_id))
                                                ?.faculties.some(({ id }) => id === Number(values.faculty_id))
                                                ? programs
                                                      .filter(({ faculty_id }) => faculty_id === Number(values.faculty_id))
                                                      .map(({ id, name }) => ({ value: id, label: name }))
                                                : [],
                                        help: 'Obligatoire pour un diplôme. Les programmes historiques restent disponibles.',
                                    },
                                    field('regulation', 'Référence réglementaire'),
                                    field('retention', 'Règle d’archivage institutionnelle'),
                                    documentReason,
                                ])
                            }
                        >
                            Ajouter un type
                        </button>
                    )}
                    {types.data.length === 0 && <p className="official-empty">Aucun type de document pour ces filtres.</p>}
                    <ul className="official-catalog">
                        {types.data.map((item) => (
                            <li key={item.id}>
                                <Link
                                    href={route(prefix + 'index', { ...filters, type: item.id })}
                                    aria-current={item.id === type?.id ? 'true' : undefined}
                                >
                                    <FileText aria-hidden="true" />
                                    <span>
                                        <strong>{item.name}</strong>
                                        <small>
                                            {item.code} · {item.active ? 'Actif' : 'Inactif'}
                                        </small>
                                    </span>
                                    <span className="official-model-link">
                                        Modèles <ChevronRight />
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                    <Pagination value={types} />
                    {type && (
                        <>
                            <h3 className="font-semibold">Modèles · {type.name}</h3>
                            <div className="flex flex-wrap gap-2">
                                {permissions.approve && (
                                    <button
                                        className="admin-secondary"
                                        type="button"
                                        onClick={() =>
                                            action(
                                                type.active ? 'Désactiver le type' : 'Activer le type',
                                                'activate',
                                                { type: type.id },
                                                { active: !type.active },
                                            )
                                        }
                                    >
                                        {type.active ? 'Désactiver' : 'Activer'}
                                    </button>
                                )}
                                {permissions.manage && (
                                    <button
                                        className="admin-secondary"
                                        type="button"
                                        onClick={() =>
                                            action(
                                                'Créer une version',
                                                'template',
                                                { type: type.id },
                                                {},
                                                [
                                                    field('title', 'Titre', 'text', true),
                                                    field('body', 'Texte et variables', 'textarea', true),
                                                    field('signer_id', 'Compte du signataire (ID)', 'number', true),
                                                    field('capacity', 'Qualité du signataire', 'text', true),
                                                    ...(type.kind === 'card'
                                                        ? [
                                                              { ...field('width_mm', 'Largeur (mm)', 'number', true), value: 85.6 },
                                                              { ...field('height_mm', 'Hauteur (mm)', 'number', true), value: 53.98 },
                                                              { ...field('margin_mm', 'Marge (mm)', 'number', true), value: 3 },
                                                          ]
                                                        : []),
                                                    { ...field('color', 'Couleur', 'color'), value: '#203852' },
                                                    ...(type.kind === 'card'
                                                        ? []
                                                        : [
                                                              field('logo', 'Logo PNG', 'file'),
                                                              field('signature', 'Signature visuelle PNG', 'file'),
                                                              field('stamp', 'Cachet visuel PNG', 'file'),
                                                          ]),
                                                    documentReason,
                                                ],
                                                'Variables disponibles avec la syntaxe {{ student }}. Utilisez matricule, institution, faculty, level, program, year, number et issued_on. Pour les résultats, decision, credits, session et degree sont aussi disponibles.',
                                            )
                                        }
                                    >
                                        Nouvelle version
                                    </button>
                                )}
                            </div>
                            {templates?.data.map((template) => (
                                <details key={template.id} className="border-t py-2">
                                    <summary>
                                        Version {template.version} · {template.title} ·{' '}
                                        {template.withdrawn_at ? 'Retirée' : template.approved_at ? 'Approuvée' : 'À approuver'}
                                    </summary>
                                    <p className="whitespace-pre-wrap">{template.body}</p>
                                    <p>
                                        {template.capacity} · compte {template.signer_id}
                                    </p>
                                    <ul className="flex flex-wrap gap-3">
                                        {template.assets.map((asset) => (
                                            <li key={asset}>
                                                <a href={route(prefix + 'template-asset', { template: template.id, asset })}>
                                                    Contrôler le fichier · {asset}
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                    {permissions.approve &&
                                        !template.withdrawn_at &&
                                        (template.approved_at || (template.signer_id === actor && template.author_id !== actor)) && (
                                            <button
                                                className="admin-secondary"
                                                type="button"
                                                onClick={() =>
                                                    action(
                                                        template.approved_at ? 'Retirer la version' : 'Approuver la version',
                                                        'template-state',
                                                        { template: template.id },
                                                        { action: template.approved_at ? 'withdraw' : 'approve' },
                                                    )
                                                }
                                            >
                                                {template.approved_at ? 'Retirer' : 'Approuver'}
                                            </button>
                                        )}
                                </details>
                            ))}
                            {templates?.data.length === 0 && <p className="official-empty">Aucun modèle pour ce type de document.</p>}
                            {templates && <Pagination value={templates} />}
                        </>
                    )}
                </section>
                <section id="demandes" className="official-panel">
                    <h2>
                        <Inbox />
                        Demandes
                    </h2>
                    {entry && (
                        <p>
                            {entry.name} · {entry.matricule} · {entry.year}
                        </p>
                    )}
                    {entry &&
                        permissions.manage &&
                        entry.types.map((item) => (
                            <button className="admin-secondary" type="button" key={item.id} onClick={() => start(entry.id, item.id, item.name)}>
                                Ouvrir · {item.name}
                            </button>
                        ))}
                    {requests.data.length === 0 && <p className="official-empty">Aucune demande pour ces filtres.</p>}
                    {requests.data.map((ticket) => (
                        <article key={ticket.id} className="space-y-2 border-t py-3">
                            <div className="official-record-heading">
                                <h3>{ticket.subject}</h3>
                                <span className="official-state">{documentLabels[ticket.status]}</span>
                                <Link href={route(prefix + 'index', { ...filters, academic: ticket.academic_enrollment_id })}>
                                    Inscription {ticket.academic_enrollment_id} <ArrowRight />
                                </Link>
                            </div>
                            <p className="whitespace-pre-wrap">{ticket.reason}</p>
                            {ticket.response && <p>{ticket.response}</p>}
                            <div className="flex flex-wrap gap-2">
                                {['reviewed', 'approved'].includes(ticket.status) && (ticket.kind !== 'diploma' || ticket.status === 'approved') && (
                                    <a className="admin-secondary" href={route(prefix + 'preview', { ticket: ticket.id })}>
                                        Aperçu provisoire
                                    </a>
                                )}
                                {permissions.manage && ticket.status === 'open' && (
                                    <button
                                        className="admin-secondary"
                                        type="button"
                                        onClick={() => transition(ticket, 'review', 'Consigner le contrôle')}
                                    >
                                        Contrôler
                                    </button>
                                )}
                                {permissions.manage && ['open', 'reviewed'].includes(ticket.status) && (
                                    <button
                                        className="admin-secondary"
                                        type="button"
                                        onClick={() => transition(ticket, 'correct', 'Demander une correction')}
                                    >
                                        Demander une correction
                                    </button>
                                )}
                                {permissions.manage && ['open', 'reviewed', 'correction', 'approved'].includes(ticket.status) && (
                                    <button
                                        className="admin-secondary"
                                        type="button"
                                        onClick={() => transition(ticket, 'refuse', 'Refuser la demande')}
                                    >
                                        Refuser
                                    </button>
                                )}
                                {permissions.manage && ticket.status === 'correction' && (
                                    <button
                                        className="admin-secondary"
                                        type="button"
                                        onClick={() => transition(ticket, 'resubmit', 'Consigner le complément')}
                                    >
                                        Consigner le complément
                                    </button>
                                )}
                                {permissions.manage && ticket.status === 'approved' && (
                                    <button
                                        className="admin-secondary"
                                        type="button"
                                        onClick={() => transition(ticket, 'recheck', 'Ouvrir un nouveau contrôle')}
                                    >
                                        Recontrôler
                                    </button>
                                )}
                                {permissions.approve && ticket.status === 'reviewed' && ticket.signer_id === actor && (
                                    <button
                                        className="admin-secondary"
                                        type="button"
                                        onClick={() => transition(ticket, 'approve', 'Approuver la demande')}
                                    >
                                        Approuver
                                    </button>
                                )}
                                {permissions.issue && ticket.status === 'approved' && (
                                    <button
                                        className="admin-primary"
                                        type="button"
                                        onClick={() =>
                                            action(
                                                'Émettre le PDF officiel',
                                                'issue',
                                                { ticket: ticket.id },
                                                { revision: ticket.document_revision },
                                                [],
                                            )
                                        }
                                    >
                                        Émettre
                                    </button>
                                )}
                            </div>
                        </article>
                    ))}
                    <Pagination value={requests} />
                </section>
                <section id="archives" className="official-panel">
                    <h2>
                        <ArchiveIcon />
                        Archives et délivrance
                    </h2>
                    <div className="official-archive-filters">
                        <Link
                            className="admin-secondary"
                            preserveScroll
                            aria-current={!filters.archive ? 'page' : undefined}
                            href={route(prefix + 'index', { ...filters, archive: undefined })}
                        >
                            Toutes les archives
                        </Link>
                        {Object.entries({
                            print: 'Cartes à imprimer',
                            delivery: 'À remettre',
                            issued: 'Émis',
                            revoked: 'Révoqués',
                            replaced: 'Remplacés',
                        }).map(([archive, label]) => (
                            <Link
                                key={archive}
                                className="admin-secondary"
                                preserveScroll
                                aria-current={filters.archive === archive ? 'page' : undefined}
                                href={route(prefix + 'index', { ...filters, archive })}
                            >
                                {label} · {archive_counts[archive]}
                            </Link>
                        ))}
                    </div>
                    {documents.data.length === 0 && <p className="official-empty">Aucun document émis pour ces filtres.</p>}
                    {documents.data.map((document) => (
                        <article key={document.id} className="space-y-2 border-t py-3">
                            <p>
                                <strong>{document.name}</strong> · {document.number} · {documentLabels[document.validity]} · Inscription{' '}
                                {document.academic_enrollment_id}
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <a className="admin-secondary" href={document.verify}>
                                    Vérifier
                                </a>
                                <a className="admin-secondary" href={route(prefix + 'download', { document: document.id })}>
                                    PDF archivé
                                </a>
                                {permissions.manage && document.status !== 'replaced' && document.copies && (
                                    <>
                                        {document.kind !== 'card' && document.status === 'issued' && (
                                            <button
                                                className="admin-secondary"
                                                type="button"
                                                onClick={() =>
                                                    start(
                                                        document.academic_enrollment_id,
                                                        document.official_document_type_id,
                                                        'Ouvrir un duplicata',
                                                        'duplicate',
                                                        document.id,
                                                    )
                                                }
                                            >
                                                Duplicata
                                            </button>
                                        )}
                                        <button
                                            className="admin-secondary"
                                            type="button"
                                            onClick={() =>
                                                start(
                                                    document.academic_enrollment_id,
                                                    document.official_document_type_id,
                                                    'Ouvrir un remplacement',
                                                    'replace',
                                                    document.id,
                                                )
                                            }
                                        >
                                            Remplacer
                                        </button>
                                    </>
                                )}
                                {permissions.issue && document.status === 'issued' && (
                                    <>
                                        {document.printable && !document.printed_at && document.validity !== 'expired' && (
                                            <button
                                                className="admin-secondary"
                                                type="button"
                                                onClick={() =>
                                                    action('Confirmer l’impression', 'lifecycle', { document: document.id }, { action: 'print' })
                                                }
                                            >
                                                Confirmer l’impression
                                            </button>
                                        )}
                                        {!document.delivered_at &&
                                            document.validity !== 'expired' &&
                                            (document.kind !== 'card' || document.printed_at) && (
                                                <button
                                                    className="admin-secondary"
                                                    type="button"
                                                    onClick={() =>
                                                        action('Confirmer la remise', 'lifecycle', { document: document.id }, { action: 'deliver' })
                                                    }
                                                >
                                                    Confirmer la remise
                                                </button>
                                            )}
                                        <button
                                            className="admin-secondary"
                                            type="button"
                                            onClick={() =>
                                                action('Révoquer la référence', 'lifecycle', { document: document.id }, { action: 'revoke' })
                                            }
                                        >
                                            Révoquer
                                        </button>
                                    </>
                                )}
                            </div>
                        </article>
                    ))}
                    <Pagination value={documents} />
                </section>
                {result_archives && (
                    <section className="official-panel">
                        <h2>
                            <ArchiveIcon />
                            Archives de résultats
                        </h2>
                        {result_archives.data.length === 0 && <p className="official-empty">Aucune archive de résultats pour ces filtres.</p>}
                        {result_archives.data.map((archive) => (
                            <p className="flex flex-wrap gap-2" key={archive.id}>
                                {({ report: 'Bulletin', transcript: 'Relevé', minutes: 'Procès-verbal' } as Record<string, string>)[archive.kind] ??
                                    archive.kind}{' '}
                                · {archive.year} {archive.revoked_at && '· Révoqué'}
                                <a href={route('official-documents.verify', { reference: archive.reference })}>Vérifier</a>
                                {permissions.issue && !archive.revoked_at && (
                                    <button
                                        className="admin-secondary"
                                        type="button"
                                        onClick={() => action('Révoquer cette archive de résultats', 'revoke-result', { archive: archive.id })}
                                    >
                                        Révoquer
                                    </button>
                                )}
                            </p>
                        ))}
                        <Pagination value={result_archives} />
                    </section>
                )}
                {audit.length > 0 && (
                    <section className="official-panel">
                        <h2 className="text-lg font-semibold">Historique du dossier</h2>
                        <ul className="space-y-2">
                            {audit.map((event) => (
                                <li key={event.id}>
                                    <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleDateString('fr-CD')}</time> · Compte{' '}
                                    {event.actor_id} · {event.action.replace(/^official_document_/, '').replaceAll('_', ' ')}
                                    {event.reason && <p>{event.reason}</p>}
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
                {modal && (
                    <AcademicForm
                        spec={modal}
                        onClose={() => setModal(undefined)}
                        onSuccess={(text) => {
                            setMessage(text);
                            setModal(undefined);
                        }}
                    />
                )}
            </main>
        </Dashboard>
    );
}

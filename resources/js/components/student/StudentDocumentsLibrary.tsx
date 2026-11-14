import Pagination from '@/components/admin/Pagination';
import { formatDate } from '@/lib/studentEnrollment';
import AcademicForm, { type FormSpec } from '@/pages/dashboard/studentAcademic/AcademicForm';
import { Link, usePage } from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowRight,
    ClipboardList,
    Copy,
    Download,
    Ellipsis,
    ExternalLink,
    Eye,
    FileCheck2,
    FileText,
    FolderOpen,
    GraduationCap,
    Plus,
    ReceiptText,
    ShieldCheck,
    Stamp,
} from 'lucide-react';
import { useState } from 'react';
import '../../../css/student-documents.css';
import { studentHref } from './navigation';
import { completeDocumentForm, documentLabels, requestDocumentForm, type DocumentCenter, type Page } from './OfficialDocumentCenter';
import { money, type Academic } from './types';

const categories = {
    all: { label: 'Tous', icon: FolderOpen, empty: 'Vos pièces validées, vos documents et vos reçus seront disponibles ici.' },
    admissions: { label: 'Pièces d’inscription', icon: FileCheck2, empty: 'Aucune pièce d’inscription validée dans vos dossiers.' },
    official: { label: 'Documents administratifs', icon: FileText, empty: 'Aucun document administratif délivré à ce jour.' },
    receipts: { label: 'Reçus', icon: ReceiptText, empty: 'Aucun reçu de versement disponible à ce jour.' },
    academic: { label: 'Documents académiques', icon: GraduationCap, empty: 'Aucun bulletin, document de cours ou travail transmis à afficher.' },
};

type Category = keyof typeof categories;
type LibraryItem = {
    id: string | number;
    title: string;
    category: Exclude<Category, 'all'>;
    subtitle?: string | null;
    date?: string | null;
    year?: string | null;
    url?: string | null;
    download_url?: string | null;
    preview_url?: string | null;
    verify_url?: string | null;
    status?: string | null;
    reference?: string | null;
    body?: string | null;
    reason?: string | null;
    amount_cents?: number | null;
    currency?: string | null;
    mime?: string | null;
    size_bytes?: number | null;
    official?: { id: number; academic_id: number; type_id: number; kind: string; status: string; copies: boolean; duplicate: boolean };
};

export type DocumentLibrary = { filter: Category; items: Page<LibraryItem> };

const categoryKeys = Object.keys(categories) as Category[];
const fileStatuses: Record<string, string> = {
    ...documentLabels,
    accepted: 'Pièce validée',
    delivered: 'Remis',
    confirmed: 'Versement confirmé',
    cancelled: 'Annulé',
    refunded: 'Remboursé',
};

const knownFormats: Record<string, string> = { 'application/pdf': 'PDF', 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WebP' };
const fileSize = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

const documentServices = {
    enrollment: {
        title: 'Attestation d’inscription',
        description: 'Confirmer votre inscription administrative.',
        procedure: 'enrollment-certificate',
        icon: FileCheck2,
    },
    schooling: {
        title: 'Certificat de scolarité',
        description: 'Attester votre scolarité pour l’année en cours.',
        procedure: 'schooling-certificate',
        icon: Stamp,
    },
    success: {
        title: 'Attestation de réussite',
        description: 'Justifier une décision académique officielle.',
        procedure: 'success-certificate',
        icon: GraduationCap,
    },
    duplicate: {
        title: 'Duplicata de document',
        description: 'Demander une nouvelle édition d’un document délivré.',
        procedure: 'document-duplicate',
        icon: Copy,
    },
} as const;
const staffDocumentServices = {
    attendance: {
        title: 'Attestation de fréquentation',
        description: 'Attester la période durant laquelle vous avez suivi les cours.',
        procedure: 'attendance-certificate',
        icon: Stamp,
    },
    transcript: { title: 'Relevé de notes', description: 'Demander un relevé au service académique.', procedure: 'transcript', icon: FileText },
} as const;
type DocumentService = keyof typeof documentServices;
const serviceOrder = ['enrollment', 'attendance', 'success', 'transcript', 'schooling', 'duplicate'] as const;

function documentServicesUrl(documentUrl: string, filter: Category, view: 'all' | DocumentService) {
    const category = filter === 'all' ? '' : `&category=${filter}`;
    return `${documentUrl}${category}&request=${view}#student-document-services`;
}

function sizeLabel(bytes?: number | null) {
    if (!bytes || bytes < 0) return null;
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${fileSize.format(bytes / 1024)} Ko`;
    return `${fileSize.format(bytes / (1024 * 1024))} Mo`;
}

function closeMenu(button: HTMLButtonElement) {
    const menu = button.closest('details');
    menu?.querySelector('summary')?.focus();
    if (menu) menu.open = false;
}

function DocumentServicePanel({
    center,
    academic,
    filter,
    service,
    onRequest,
}: {
    center?: DocumentCenter | null;
    academic: Academic;
    filter: Category;
    service: 'all' | DocumentService;
    onRequest: (type: { id: number; name: string }, previous?: number) => void;
}) {
    const documentUrl = studentHref('documents', academic.id);
    const servicesUrl = `${studentHref('services', academic.id)}&category=documents`;
    const selected = service === 'all' ? null : documentServices[service];
    const choices = center?.types.filter(({ kind }) => kind === service) ?? [];
    const available = new Set(center?.available_types.map(({ id }) => id) ?? []);
    const duplicates = center?.duplicate_options ?? [];
    const needsStaff = selected && center?.can_request && (service === 'duplicate' ? duplicates.length === 0 : choices.length === 0);
    const procedureUrl = (procedure: string) => `${studentHref('services', academic.id)}&procedure=${procedure}`;
    const requestsUrl = studentHref('requests', academic.id);

    return (
        <section
            id="student-document-services"
            className="student-documents-card student-document-services"
            aria-labelledby="student-document-services-heading"
        >
            <header className="student-document-services-heading">
                <span className="student-documents-folder">
                    <Stamp size={23} aria-hidden="true" />
                </span>
                <div>
                    <h2 id="student-document-services-heading">{selected?.title ?? 'Demander un document'}</h2>
                    <p>{selected?.description ?? 'Choisissez le document à demander au service de la scolarité.'}</p>
                </div>
            </header>
            {center && !center.can_request && (
                <p className="student-documents-feedback">
                    {center.request_reason || 'Les demandes documentaires sont indisponibles pour cette inscription.'}
                </p>
            )}
            {service === 'all' ? (
                <div className="student-document-services-grid">
                    {serviceOrder.map((key) => {
                        const isStaff = key === 'attendance' || key === 'transcript';
                        const { title, description, procedure, icon: Icon } = isStaff ? staffDocumentServices[key] : documentServices[key];
                        return (
                            <Link
                                href={isStaff ? procedureUrl(procedure) : documentServicesUrl(documentUrl, filter, key)}
                                key={key}
                                className="student-document-service-option"
                            >
                                <Icon size={20} aria-hidden="true" />
                                <span>
                                    <strong>{title}</strong>
                                    <small>{description}</small>
                                </span>
                                <ArrowRight size={17} aria-hidden="true" />
                            </Link>
                        );
                    })}
                </div>
            ) : service === 'duplicate' ? (
                duplicates.length ? (
                    <ul className="student-document-service-choices" role="list">
                        {duplicates.map((item) => (
                            <li key={item.id}>
                                <span>
                                    <strong>{item.name}</strong>
                                    <small>{item.number}</small>
                                </span>
                                {item.pending ? (
                                    <Link className="student-documents-request" href={requestsUrl}>
                                        Suivre ma demande
                                    </Link>
                                ) : (
                                    <button
                                        className="student-documents-request"
                                        type="button"
                                        onClick={() => onRequest({ id: item.type_id, name: item.name }, item.id)}
                                    >
                                        Demander le duplicata
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                ) : center?.can_request ? (
                    <p className="student-documents-feedback">Aucun document de cette inscription ne propose de duplicata ici.</p>
                ) : null
            ) : choices.length ? (
                <ul className="student-document-service-choices" role="list">
                    {choices.map((type) => (
                        <li key={type.id}>
                            <span>
                                <strong>{type.name}</strong>
                                {type.unavailable_reason && <small>{type.unavailable_reason}</small>}
                            </span>
                            {type.pending ? (
                                <Link className="student-documents-request" href={requestsUrl}>
                                    Suivre ma demande
                                </Link>
                            ) : available.has(type.id) && !type.unavailable_reason ? (
                                <button className="student-documents-request" type="button" onClick={() => onRequest(type)}>
                                    Faire la demande
                                </button>
                            ) : (
                                !available.has(type.id) &&
                                !type.unavailable_reason && (
                                    <Link className="student-documents-request" href={`${documentUrl}&category=official`}>
                                        Voir mes documents
                                    </Link>
                                )
                            )}
                        </li>
                    ))}
                </ul>
            ) : (
                center?.can_request && (
                    <p className="student-documents-feedback">Ce document est traité par le service de la scolarité pour cette inscription.</p>
                )
            )}
            <footer className="student-document-services-links">
                {selected && (
                    <Link href={documentServicesUrl(documentUrl, filter, 'all')}>
                        <ArrowLeft size={16} aria-hidden="true" /> Choisir un document
                    </Link>
                )}
                <Link href={needsStaff ? procedureUrl(selected.procedure) : servicesUrl}>
                    {needsStaff ? 'Contacter la scolarité' : 'Démarches de scolarité'} <ArrowRight size={16} aria-hidden="true" />
                </Link>
            </footer>
        </section>
    );
}

function LibraryRow({ item, onRequest }: { item: LibraryItem; onRequest: (item: LibraryItem, action: 'duplicate' | 'replace') => void }) {
    const { icon: Icon, label } = categories[item.category];
    const format = item.mime ? knownFormats[item.mime] : null;
    const metadata = [item.subtitle, item.reference, item.year, item.date ? formatDate(item.date) : null, format, sizeLabel(item.size_bytes)]
        .filter((value, index, values) => value && values.indexOf(value) === index)
        .join(' · ');
    const copies = item.official?.copies && item.official.status !== 'replaced';
    const status = item.status ? fileStatuses[item.status] : undefined;
    const openLabel = item.category === 'receipts' ? 'Voir le reçu' : item.reason ? 'Consulter les frais' : 'Ouvrir';

    return (
        <li className="student-documents-row">
            <span className="student-documents-file student-library-icon" data-category={item.category}>
                <Icon size={21} aria-hidden="true" />
            </span>
            <div className="student-documents-row-copy">
                <strong>{item.title}</strong>
                <small>{metadata || label}</small>
                {item.amount_cents != null && item.currency && (
                    <span className="student-library-amount">{money(item.amount_cents, item.currency)}</span>
                )}
                {status && (
                    <span className="student-documents-status" data-status={item.status}>
                        {status}
                    </span>
                )}
                {item.reason && <p>{item.reason}</p>}
                {item.body && (
                    <details className="student-library-text">
                        <summary>Lire le contenu</summary>
                        <p>{item.body}</p>
                    </details>
                )}
            </div>
            <div className="student-documents-row-actions">
                {item.preview_url && item.preview_url !== item.url && (
                    <a className="student-documents-icon-action" href={item.preview_url} aria-label={`Voir · ${item.title}`} title="Voir">
                        <Eye size={18} aria-hidden="true" />
                    </a>
                )}
                {item.download_url && (
                    <a
                        className="student-documents-icon-action"
                        href={item.download_url}
                        aria-label={`Télécharger · ${item.title}`}
                        title="Télécharger"
                    >
                        <Download size={18} aria-hidden="true" />
                    </a>
                )}
                {item.url && item.url !== item.download_url && (
                    <a className="student-documents-icon-action" href={item.url} aria-label={`${openLabel} · ${item.title}`} title={openLabel}>
                        <ExternalLink size={18} aria-hidden="true" />
                    </a>
                )}
                {(item.verify_url || copies) && (
                    <details className="student-documents-more" name="student-library-actions">
                        <summary className="student-documents-icon-action" aria-label={`Actions · ${item.title}`} title="Plus d’actions">
                            <Ellipsis size={19} aria-hidden="true" />
                        </summary>
                        <div className="student-documents-more-panel">
                            {item.verify_url && (
                                <a href={item.verify_url}>
                                    <ShieldCheck size={16} aria-hidden="true" /> Vérifier le document
                                </a>
                            )}
                            {copies && item.official?.duplicate && (
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        closeMenu(event.currentTarget);
                                        onRequest(item, 'duplicate');
                                    }}
                                >
                                    Demander un duplicata
                                </button>
                            )}
                            {copies && (
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        closeMenu(event.currentTarget);
                                        onRequest(item, 'replace');
                                    }}
                                >
                                    Demander une rectification
                                </button>
                            )}
                        </div>
                    </details>
                )}
            </div>
        </li>
    );
}

export default function StudentDocumentsLibrary({
    academic,
    library,
    center,
}: {
    academic: Academic;
    library?: DocumentLibrary | null;
    center?: DocumentCenter | null;
}) {
    const [modal, setModal] = useState<FormSpec>();
    const [message, setMessage] = useState('');
    const { url } = usePage();
    const filter = library?.filter ?? 'all';
    const items = library?.items;
    const total = items?.total ?? items?.data.length ?? 0;
    const documentUrl = studentHref('documents', academic.id);
    const requests = center?.requests;
    const requested = new URLSearchParams(url.split('?')[1]?.split('#')[0]).get('request');
    const service = requested === 'all' || (requested && Object.hasOwn(documentServices, requested)) ? (requested as 'all' | DocumentService) : null;
    const actionContext = (enrollmentId: number) => ({
        academic: enrollmentId,
        library_academic: academic.id,
        category: filter,
        ...(service ? { request: service } : {}),
    });
    const requestCopy = (item: LibraryItem, action: 'duplicate' | 'replace') => {
        if (!item.official) return;
        setModal(
            requestDocumentForm(actionContext(item.official.academic_id), { id: item.official.type_id, name: item.title }, action, item.official.id),
        );
    };

    return (
        <div className="student-documents-page">
            <header className="student-documents-header">
                <Link
                    href={service ? `${studentHref('services', academic.id)}&category=documents` : studentHref('profile', academic.id)}
                    aria-label={service ? 'Retour à la scolarité' : 'Retour à mon profil'}
                >
                    <ArrowLeft size={22} aria-hidden="true" />
                </Link>
                <h1>Mes documents</h1>
            </header>
            {service && (
                <DocumentServicePanel
                    academic={academic}
                    center={center}
                    filter={filter}
                    service={service}
                    onRequest={(type, previous) =>
                        setModal(requestDocumentForm(actionContext(academic.id), type, previous ? 'duplicate' : 'initial', previous))
                    }
                />
            )}
            <section className="student-documents-card student-documents-center student-library" aria-labelledby="student-library-heading">
                <header className="student-documents-center-heading">
                    <span className="student-documents-folder">
                        <FolderOpen size={23} aria-hidden="true" />
                    </span>
                    <div>
                        <h2 id="student-library-heading">Mes fichiers</h2>
                        <p>
                            {total} {total === 1 ? 'document' : 'documents'}
                        </p>
                    </div>
                    {!service && (
                        <Link
                            className="student-documents-request student-documents-new"
                            href={documentServicesUrl(documentUrl, filter, 'all')}
                            aria-label="Demander un document"
                        >
                            <Plus size={18} aria-hidden="true" /> Demander
                        </Link>
                    )}
                </header>
                {message && (
                    <p className="student-documents-feedback" role="status">
                        {message}
                    </p>
                )}
                <nav className="student-library-filters" aria-label="Filtrer mes documents">
                    {categoryKeys.map((key) => {
                        const { icon: Icon, label } = categories[key];
                        return (
                            <Link
                                key={key}
                                href={key === 'all' ? documentUrl : `${documentUrl}&category=${key}`}
                                aria-current={key === filter ? 'page' : undefined}
                            >
                                <Icon size={16} aria-hidden="true" /> {label}
                            </Link>
                        );
                    })}
                </nav>
                {items?.data.length ? (
                    <ul className="student-documents-list student-documents-issued" aria-label={categories[filter].label}>
                        {items.data.map((item) => (
                            <LibraryRow key={item.id} item={item} onRequest={requestCopy} />
                        ))}
                    </ul>
                ) : (
                    <div className="student-library-empty">
                        <FolderOpen size={26} aria-hidden="true" />
                        <p>{categories[filter].empty}</p>
                    </div>
                )}
                <Pagination value={items} preserveScroll={false} />
            </section>
            {(filter === 'all' || filter === 'official') && Boolean(requests?.data.length) && (
                <section className="student-documents-card" aria-labelledby="student-document-requests-heading">
                    <h2 id="student-document-requests-heading">Suivi des demandes</h2>
                    <ul className="student-documents-list">
                        {requests?.data.map((ticket) => (
                            <li key={ticket.id} className="student-documents-row">
                                <span className="student-documents-file student-documents-file--result">
                                    <ClipboardList size={21} aria-hidden="true" />
                                </span>
                                <div className="student-documents-row-copy">
                                    <strong>{ticket.subject}</strong>
                                    {ticket.year && <small>{ticket.year}</small>}
                                    <span className="student-documents-status" data-status={ticket.status}>
                                        {documentLabels[ticket.status] ?? ticket.status}
                                    </span>
                                    {ticket.response && <p>{ticket.response}</p>}
                                </div>
                                {ticket.status === 'correction' && ticket.resubmit_allowed && (
                                    <button
                                        className="student-documents-request"
                                        type="button"
                                        onClick={() => setModal(completeDocumentForm(actionContext(ticket.academic_enrollment_id), ticket))}
                                    >
                                        Compléter
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                    <Pagination value={requests} />
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
        </div>
    );
}

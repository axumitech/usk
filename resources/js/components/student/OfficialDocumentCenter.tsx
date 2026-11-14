import Pagination from '@/components/admin/Pagination';
import AcademicForm, { type FormSpec } from '@/pages/dashboard/studentAcademic/AcademicForm';
import { useState } from 'react';

export type Page<T> = { data: T[]; links: { url: string | null; label: string; active: boolean }[]; total?: number };
export type DocumentRow = {
    id: number;
    academic_enrollment_id: number;
    official_document_type_id: number;
    number: string;
    name: string;
    kind: string;
    status: string;
    validity: string;
    verify: string;
    printable: boolean;
    copies: boolean;
    issued_at?: string | null;
    printed_at: string | null;
    delivered_at: string | null;
    download?: string | null;
};
export type DocumentRequest = {
    id: number;
    academic_enrollment_id: number;
    subject: string;
    kind: string;
    status: string;
    response: string | null;
    year?: string | null;
    document_revision: number;
    signer_id: number | null;
    resubmit_allowed: boolean;
};
export type DocumentCenter = {
    can_request: boolean;
    request_reason?: string | null;
    types: DocumentType[];
    available_types: DocumentType[];
    duplicate_options?: { id: number; type_id: number; name: string; number: string; pending: boolean }[];
    requests: Page<DocumentRequest>;
    documents?: Page<DocumentRow>;
};
export type DocumentType = { id: number; name: string; kind: string; copies: boolean; unavailable_reason?: string | null; pending?: boolean };

export const documentLabels: Record<string, string> = {
    open: 'Reçue',
    reviewed: 'Contrôlée',
    correction: 'À compléter',
    approved: 'Approuvée',
    refused: 'Refusée',
    issued: 'Émis',
    valid: 'Valide',
    expired: 'Expiré',
    pending: 'En attente de remise',
    revoked: 'Révoqué',
    replaced: 'Remplacé',
    unknown: 'Inconnu',
};
export const documentReason = { name: 'reason', label: 'Motif', type: 'textarea', required: true };

type StudentDocumentActionContext = { academic: number; library_academic?: number; category?: string; request?: string };

export function requestDocumentForm(
    context: StudentDocumentActionContext,
    type: { id: number; name: string },
    action: 'initial' | 'duplicate' | 'replace',
    previous?: number,
): FormSpec {
    return {
        title: action === 'duplicate' ? `Duplicata · ${type.name}` : type.name,
        description: action === 'initial' ? 'Décrivez votre demande.' : 'Indiquez la raison de la nouvelle édition.',
        action: route('dashboard.student.official-documents.submit', context),
        fields: [documentReason],
        values: { type_id: type.id, action, previous_id: previous ?? null, operation_key: crypto.randomUUID() },
        submitLabel: 'Envoyer',
    };
}

export function completeDocumentForm(context: StudentDocumentActionContext, ticket: DocumentRequest): FormSpec {
    return {
        title: 'Compléter la demande',
        description: 'Répondez au service documentaire.',
        action: route('dashboard.student.official-documents.transition', { ...context, ticket: ticket.id }),
        fields: [documentReason],
        values: { action: 'resubmit', revision: ticket.document_revision },
    };
}

export default function OfficialDocumentCenter({ data, academic }: { data: DocumentCenter; academic: number }) {
    const [modal, setModal] = useState<FormSpec>();
    const [message, setMessage] = useState('');
    const { available_types: availableTypes, documents } = data;

    return (
        <section className="student-panel space-y-4">
            <h2>Mes documents officiels</h2>
            {message && <p role="status">{message}</p>}
            {!data.can_request && <p>La règle de délivrance de cette inscription ne permet pas les nouvelles demandes.</p>}
            {availableTypes.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {availableTypes.map((type) => (
                        <button
                            key={type.id}
                            className="admin-secondary"
                            type="button"
                            onClick={() => setModal(requestDocumentForm({ academic }, type, 'initial'))}
                        >
                            Demander · {type.name}
                        </button>
                    ))}
                </div>
            )}
            {documents && documents.data.length > 0 && (
                <>
                    <h3>Documents émis</h3>
                    <ul className="space-y-2">
                        {documents.data.map((document) => {
                            const type = data.types.find((item) => item.id === document.official_document_type_id);
                            return (
                                <li key={document.id} className="flex flex-wrap items-center gap-2">
                                    <strong>{document.name}</strong> · {document.number} · {documentLabels[document.validity]}
                                    <a href={document.verify}>Vérifier</a>
                                    {document.download && <a href={document.download}>Télécharger le PDF</a>}
                                    {type?.copies && document.status !== 'replaced' && (
                                        <>
                                            {document.status === 'issued' && type.kind !== 'card' && (
                                                <button
                                                    className="admin-secondary"
                                                    type="button"
                                                    onClick={() => setModal(requestDocumentForm({ academic }, type, 'duplicate', document.id))}
                                                >
                                                    Demander un duplicata
                                                </button>
                                            )}
                                            <button
                                                className="admin-secondary"
                                                type="button"
                                                onClick={() => setModal(requestDocumentForm({ academic }, type, 'replace', document.id))}
                                            >
                                                Demander {type.kind === 'card' ? 'un remplacement' : 'une rectification'}
                                            </button>
                                        </>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
            <Pagination value={documents} />
            {data.requests.data.length > 0 && (
                <>
                    <h3>Suivi des demandes</h3>
                    <ul className="space-y-2">
                        {data.requests.data.map((ticket) => (
                            <li key={ticket.id}>
                                <div className="student-documents-row-copy">
                                    <strong>{ticket.subject}</strong>{' '}
                                    <span data-status={ticket.status}>{documentLabels[ticket.status] ?? ticket.status}</span>
                                    {ticket.response && <p>{ticket.response}</p>}
                                </div>
                                {ticket.status === 'correction' && ticket.resubmit_allowed && (
                                    <button
                                        className="admin-secondary"
                                        type="button"
                                        onClick={() => setModal(completeDocumentForm({ academic }, ticket))}
                                    >
                                        Compléter
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                </>
            )}
            <Pagination value={data.requests} />
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
        </section>
    );
}

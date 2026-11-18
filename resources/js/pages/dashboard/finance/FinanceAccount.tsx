import AdminModal from '@/components/admin/AdminModal';
import FeedbackToast from '@/components/admin/FeedbackToast';
import Pagination from '@/components/admin/Pagination';
import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import FirstInstallmentDetails, { EnrollmentActivationStatus } from '@/components/student/FirstInstallmentDetails';
import PaymentProofHistory, { paymentProofStatus, proofPaymentLabel, proofPaymentStatus } from '@/components/student/PaymentProofHistory';
import { labels, money, type FirstInstallment, type StudentPaymentProof } from '@/components/student/types';
import type { Page } from '@inertiajs/core';
import { Head, Link, useForm, usePage } from '@inertiajs/react';
import { ArrowLeft, ArrowRight, CalendarDays, ClipboardCheck, Download, FileCheck2, Landmark, ShieldCheck, Wallet } from 'lucide-react';
import { useState } from 'react';
import '../../../../css/dashboard/finance-account.css';
import AcademicForm, { type Field, type FormSpec } from '../studentAcademic/AcademicForm';
import FinanceAccountOverview, { type AccountStatement } from './FinanceAccountOverview';

type Payment = {
    id: number;
    reference: string;
    amount_cents: number;
    currency: string;
    kind: string;
    method: string;
    status: string;
    confirmed_at: string | null;
    recorded_at: string | null;
    can_confirm: boolean;
    requires_distinct_receipt_verification?: boolean;
    note: string | null;
};
type Tariff = {
    id: number;
    title: string;
    version: number;
    currency: string;
    category: string;
    status: string;
};
export type Entry = { id: number; name: string; matricule: string | null; year: string; faculty: string; level: string; program: string | null };
type Refund = {
    id: number;
    student_payment_id: number;
    amount_cents: number;
    status: string;
    reason: string;
    execution_reference: string | null;
    executed_at: string | null;
};
type PaymentProof = StudentPaymentProof & {
    review_url: string | null;
    payment_id: number | null;
    decision_reason?: string | null;
    requires_distinct_receipt_verification?: boolean;
};
type FinancePaymentFlash = { accountId: number; message: string };
type Paginated<T> = { data: T[]; links: { url: string | null; label: string; active: boolean }[]; total?: number };
type Props = {
    selected: Entry;
    statement: AccountStatement;
    filters: { academic?: number; [key: string]: string | number | boolean | undefined };
    accountBackUrl: string;
    accountBackLabel: string;
    enrollmentConfirmation: {
        status: string;
        canConfirm: boolean;
        blocker: string | null;
        context: string;
        first_installment?: FirstInstallment | null;
        first_installment_review_required?: boolean;
    };
    pendingPaymentCount: number;
    paymentProofs?: PaymentProof[];
    paymentProofReviewReasons?: Record<'approve' | 'reject', Record<string, string>>;
    dualControl: boolean;
    methods: string[];
    obligations: { id: number; title: string; kind: string; amount_cents: number; due_at: string | null }[];
    adjustments: Paginated<{
        id: number;
        type: string;
        fee_kind: string;
        amount_cents: number | null;
        funding_source: string;
        reason: string;
        is_active: boolean;
    }> | null;
    payments: (Paginated<Payment> & { current_page: number; first_page_url: string }) | null;
    refunds: Paginated<Refund> | null;
    tariffs: Paginated<Tariff>;
};
const reason: Field = { name: 'reason', label: 'Justification', required: true, type: 'textarea', minLength: 10, help: 'Au moins 10 caractères.' };
const tariffCategory = (category: string) => ({ national: 'Étudiants nationaux', foreign: 'Étudiants étrangers' })[category] ?? category;
const paymentMethod = (value: string) => ({ cash: 'Espèces', bank_transfer: 'Virement bancaire', other: 'Autre' })[value] ?? value;
const paymentDate = new Intl.DateTimeFormat('fr-CD', { dateStyle: 'medium', timeZone: 'Africa/Kinshasa' });
const proofStatuses: Record<ReturnType<typeof paymentProofStatus>, string> = {
    pending: 'En vérification',
    accepted: 'Justificatif accepté',
    rejected: 'Justificatif refusé',
};
const financeReturnFields = new Set([
    'q',
    'year',
    'faculty',
    'program',
    'level',
    'from_confirmations',
    'confirmation_q',
    'confirmation_page',
    'from_proofs',
    'page',
    'payments_page',
    'refunds_page',
    'adjustments_page',
]);
const distinctReceiptField = (applicable = false): Field => ({
    name: 'distinct_receipt_verified',
    type: 'checkbox',
    label: 'J’ai vérifié qu’il s’agit d’un reçu distinct',
    help: 'Un autre versement confirmé présente les mêmes caractéristiques. Comparez les reçus avant de poursuivre.',
    required: true,
    visibleFor: (_values, errors) => applicable || Boolean(errors.distinct_receipt_verified),
});
const statusLabel = (value: string) =>
    labels[value] ||
    ({
        pending: 'En vérification',
        requested: 'Demandé',
        approved: 'Autorisé',
        executed: 'Décaissement exécuté',
        draft: 'Brouillon',
        match: 'Correspondance exacte',
        mismatch: 'Écart',
        duplicate: 'Doublon',
        unmatched: 'Sans correspondance autorisée',
        unallocated: 'Non affecté',
    }[value] ??
        value);
export default function FinanceAccount(props: Props) {
    const [spec, setSpec] = useState<FormSpec | null>(null);
    const [allocating, setAllocating] = useState<Payment | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [dismissedPaymentFlash, setDismissedPaymentFlash] = useState<FinancePaymentFlash | null>(null);
    const paymentFlash = usePage().flash?.financePayment as FinancePaymentFlash | undefined;
    const feedback = paymentFlash?.accountId === props.selected.id && paymentFlash !== dismissedPaymentFlash ? paymentFlash.message : notice;
    const enrollment = props.enrollmentConfirmation;
    const pendingEnrollment = enrollment.status === 'pending_confirmation';
    const feeLabel = (kind: string) => props.statement.kind_titles[kind] ?? kind.replaceAll('_', ' ');
    const activeTariffs = props.tariffs.data.filter((tariff) => tariff.status === 'active');
    const paymentProofs = props.paymentProofs ?? [];
    const financeReturn = {
        ...Object.fromEntries(Object.entries(props.filters).filter(([key, value]) => financeReturnFields.has(key) && value !== undefined)),
        finance_return: true,
    };
    const acceptsAccountResponse = (page: Page) => {
        if (page.component !== 'dashboard/finance/Index' || (page.props.selected as Entry | null)?.id !== props.selected.id) {
            return false;
        }

        const expected = new URL(route('dashboard.admin.finance.index', {}, false), window.location.href);
        const actual = new URL(page.url, window.location.href);

        return actual.origin === expected.origin && actual.pathname === expected.pathname
            && actual.searchParams.get('academic') === String(props.selected.id);
    };
    const paymentsLabel = props.pendingPaymentCount > 0 ? `À vérifier (${props.pendingPaymentCount})` : 'Voir les versements';
    const paymentsPageUrl = props.payments && props.payments.current_page > 1 ? props.payments.first_page_url + '#paiements' : null;
    const show = (
        title: string,
        action: string,
        fields: Field[],
        values: FormSpec['values'] = {},
        description = 'Les valeurs officielles sont contrôlées côté serveur et l’opération est auditée.',
    ) => setSpec({
        title,
        action,
        fields,
        values: { ...financeReturn, ...values },
        description,
        submitLabel: 'Enregistrer après contrôle',
        requireSuccessFlash: true,
        acceptsResponse: acceptsAccountResponse,
    });
    const feeKinds = [...new Set(props.obligations.map(({ kind }) => kind))].filter((kind) => kind !== 'unallocated');
    const paymentFeeOptions = feeKinds.map((kind) => {
        const balance = props.statement.kinds[kind];
        const title = feeLabel(kind);

        return {
            value: kind,
            label: balance
                ? `${title} · ${balance.balance_cents > 0 ? `${money(balance.balance_cents, balance.currency)} restant à payer` : 'Soldé'}`
                : title,
        };
    });
    const kindField: Field = {
        name: 'fee_kind',
        label: 'Frais concernés',
        type: 'select',
        required: true,
        options: feeKinds.map((kind) => ({ value: kind, label: feeLabel(kind) })),
    };
    const actionReason = (status: string): Field[] => [
        reason,
        ...(status === 'executed'
            ? [
                  {
                      name: 'method',
                      label: 'Méthode du décaissement exécuté',
                      type: 'select',
                      required: true,
                      options: props.methods.map((value) => ({ value, label: value })),
                  },
                  { name: 'execution_reference', label: 'Référence du décaissement confirmé', required: true },
              ]
            : []),
    ];
    function recordPayment(kind?: string, amountCents?: number) {
        setSpec({
            title: 'Saisir un versement',
            description: `${props.selected.name} · ${props.selected.year} · ${props.statement.balance.currency}. Le solde est mis à jour après confirmation.`,
            action: route('dashboard.admin.student-academic.payments', props.selected.id),
            submitLabel: 'Enregistrer le versement',
            requireSuccessFlash: true,
            acceptsResponse: acceptsAccountResponse,
            values: { ...financeReturn, operation_id: crypto.randomUUID() },
            fields: [
                {
                    name: 'kind',
                    label: 'Frais concernés',
                    type: 'select',
                    required: true,
                    value: kind ?? (feeKinds.length === 1 ? feeKinds[0] : feeKinds.length === 0 ? 'unallocated' : ''),
                    options: [...paymentFeeOptions, { value: 'unallocated', label: 'Versement général à affecter après confirmation' }],
                    help: 'Le versement couvre d’abord les échéances les plus anciennes du poste choisi.',
                },
                {
                    name: 'amount',
                    label: `Montant reçu (${props.statement.balance.currency})`,
                    type: 'number',
                    required: true,
                    value: amountCents === undefined ? '' : (amountCents / 100).toFixed(2),
                    help: 'Saisissez le montant effectivement reçu.',
                },
                {
                    name: 'method',
                    label: 'Mode de paiement',
                    type: 'select',
                    required: true,
                    options: props.methods.map((value) => ({ value, label: paymentMethod(value) })),
                },
                { name: 'reference', label: 'Référence unique du versement', required: true },
                { name: 'note', label: 'Pièce ou justification du versement', type: 'textarea', required: true },
            ],
        });
    }

    function confirmEnrollment() {
        setSpec({
            title: 'Confirmer l’inscription',
            description: `${props.selected.name} · ${props.selected.year}`,
            action: route('dashboard.admin.finance.confirmations.store', { ...props.filters, academic: props.selected.id }),
            submitLabel: 'Confirmer l’inscription',
            requireSuccessFlash: true,
            acceptsResponse: acceptsAccountResponse,
            fields: [{ ...reason, label: 'Motif de confirmation' }],
            values: { return_to_account: true, operation_key: crypto.randomUUID(), expected_context: enrollment.context },
        });
    }

    function updatePaymentStatus(payment: Payment, status: 'confirmed' | 'cancelled') {
        const title = status === 'confirmed' ? 'Confirmer le versement' : 'Annuler l’écriture comptable';
        setSpec({
            title,
            description: `${props.selected.name} · ${feeLabel(payment.kind)} · ${money(payment.amount_cents, payment.currency)} · ${payment.reference} · ${paymentMethod(payment.method)}`,
            action: route('dashboard.admin.student-academic.payments.status', payment.id),
            submitLabel: title,
            fields: [
                { ...reason, label: status === 'confirmed' ? 'Motif après contrôle de la réception du versement' : 'Motif de l’annulation' },
                ...(status === 'confirmed' ? [distinctReceiptField(payment.requires_distinct_receipt_verification)] : []),
            ],
            values: { ...financeReturn, status },
            requireSuccessFlash: true,
            acceptsResponse: acceptsAccountResponse,
        });
    }

    function reviewProof(proof: PaymentProof, decision: 'approve' | 'reject') {
        if (!proof.review_url) return;

        const title = decision === 'approve' ? 'Valider le justificatif' : 'Refuser le justificatif';
        const reasons = props.paymentProofReviewReasons?.[decision] ?? {};
        setSpec({
            title,
            description: `${props.selected.name} · ${proof.kind_label} · ${money(proof.amount_cents, proof.currency)} · ${proof.reference}`,
            action: proof.review_url,
            submitLabel: title,
            requireSuccessFlash: true,
            acceptsResponse: acceptsAccountResponse,
            fields: [
                {
                    name: 'reason_code',
                    label: decision === 'approve' ? 'Motif après vérification du versement reçu' : 'Motif du refus communiqué à l’étudiant',
                    type: 'select',
                    required: true,
                    options: Object.entries(reasons).map(([value, label]) => ({ value, label })),
                    clears: 'reason',
                },
                {
                    ...reason,
                    label: 'Précisez le motif',
                    visibleFor: (values) => values.reason_code === 'other',
                    minLength: 10,
                    maxLength: 1000,
                    help: 'Entre 10 et 1 000 caractères.',
                },
                ...(decision === 'approve' ? [distinctReceiptField(proof.requires_distinct_receipt_verification)] : []),
            ],
            values: { ...financeReturn, decision },
        });
    }

    function applyTariff() {
        show('Émettre les obligations du barème', route('dashboard.admin.finance.bill', props.selected.id), [
            {
                name: 'tariff_id',
                label: 'Version active à appliquer',
                type: 'select',
                required: true,
                options: activeTariffs.map((tariff) => ({
                    value: tariff.id,
                    label: `${tariff.title} · V${tariff.version} · ${tariffCategory(tariff.category)} · ${tariff.currency}`,
                })),
            },
            reason,
        ]);
    }

    return (
        <Dashboard hideAppsNavigation>
            <Head title={`Compte financier · ${props.selected.name}`} />
            {feedback && (
                <FeedbackToast
                    feedback={{ id: 0, message: feedback, tone: 'success' }}
                    onDismiss={() => {
                        setDismissedPaymentFlash(paymentFlash ?? null);
                        setNotice(null);
                    }}
                />
            )}
            {spec && (
                <AcademicForm
                    spec={spec}
                    onClose={() => setSpec(null)}
                    onSuccess={(message) => {
                        setSpec(null);
                        setNotice(message);
                    }}
                />
            )}
            {allocating && (
                <Allocation
                    payment={allocating}
                    obligations={props.obligations}
                    returnContext={financeReturn}
                    acceptsResponse={acceptsAccountResponse}
                    close={() => setAllocating(null)}
                    onSuccess={(message) => {
                        setAllocating(null);
                        setNotice(message);
                    }}
                />
            )}
            <div className="student-portal academic-administration finance-workspace finance-account-workspace">
                <Link
                    className="finance-focused-back"
                    href={props.filters.from_confirmations || props.filters.from_proofs ? props.accountBackUrl : props.accountBackUrl + '#comptes'}
                >
                    <ArrowLeft size={17} aria-hidden="true" /> {props.accountBackLabel}
                </Link>
                <header className="finance-hero finance-focused-hero">
                    <Landmark className="finance-hero-watermark" size={200} strokeWidth={0.65} aria-hidden="true" />
                    <div className="finance-hero-copy">
                        <p className="finance-focused-kicker">Compte financier étudiant</p>
                        <h1>{props.selected.name}</h1>
                        <p>
                            {[...new Set([props.selected.matricule, props.selected.faculty, props.selected.program, props.selected.level])]
                                .filter(Boolean)
                                .join(' · ')}
                        </p>
                        <div className="finance-hero-context">
                            <span>
                                <CalendarDays size={16} aria-hidden="true" /> {props.selected.year}
                            </span>
                            <span>{statusLabel(enrollment.status)}</span>
                        </div>
                    </div>
                    <div className="finance-export-actions">
                        <button className="finance-export" type="button" onClick={() => recordPayment()}>
                            <Wallet size={18} aria-hidden="true" /> Saisir un versement
                        </button>
                        {props.pendingPaymentCount > 0 && paymentsPageUrl ? (
                            <Link className="finance-export finance-export-csv" href={paymentsPageUrl}>
                                {paymentsLabel} <ArrowRight size={15} aria-hidden="true" />
                            </Link>
                        ) : (
                            <a className="finance-export finance-export-csv" href="#paiements">
                                {paymentsLabel} <ArrowRight size={15} aria-hidden="true" />
                            </a>
                        )}
                        {paymentProofs.length > 0 && (
                            <a className="finance-export finance-export-csv" href="#justificatifs">
                                <FileCheck2 size={17} aria-hidden="true" /> Justificatifs
                            </a>
                        )}
                    </div>
                </header>
                <FinanceAccountOverview statement={props.statement} onRecordPayment={recordPayment} />
                {!props.statement.balance.assessed && (
                    <div className="portal-panel finance-operational-panel finance-unassessed-action">
                        <p>
                            {activeTariffs.length
                                ? 'Vérifiez la catégorie tarifaire et l’historique de l’inscription avant toute facturation manuelle.'
                                : 'Aucun barème actif applicable. Activez le barème de scolarité correspondant pour établir automatiquement les tranches et le solde.'}
                        </p>
                        {activeTariffs.length > 0 ? (
                            <button className="portal-primary" type="button" onClick={applyTariff}>
                                Facturer un barème actif
                            </button>
                        ) : (
                            <Link className="admin-secondary" href={route('dashboard.admin.finance.tariffs.index')}>
                                Ouvrir les barèmes <ArrowRight size={15} aria-hidden="true" />
                            </Link>
                        )}
                    </div>
                )}
                {paymentProofs.length > 0 && <AccountPaymentProofs proofs={paymentProofs} onReview={reviewProof} paymentsPageUrl={paymentsPageUrl} />}
                {(pendingEnrollment || enrollment.first_installment) && (
                    <section
                        className="portal-panel finance-operational-panel finance-enrollment-decision"
                        aria-labelledby="finance-confirmation-title"
                    >
                        <div className="grow">
                            <h2 id="finance-confirmation-title">
                                {pendingEnrollment
                                    ? enrollment.first_installment?.activation?.automatic
                                        ? 'Activation automatique de l’inscription'
                                        : 'Confirmation de l’inscription'
                                    : 'Suivi de l’inscription'}
                            </h2>
                            {enrollment.first_installment?.activation?.automatic && (pendingEnrollment || enrollment.status === 'confirmed') ? (
                                <EnrollmentActivationStatus installment={enrollment.first_installment} status={enrollment.status} />
                            ) : (
                                <p>
                                    {pendingEnrollment
                                        ? (enrollment.blocker ??
                                          (enrollment.canConfirm
                                              ? 'Le dossier est prêt à être confirmé.'
                                              : 'Seul un agent habilité à gérer les inscriptions peut confirmer ce dossier.'))
                                        : `Inscription ${(labels[enrollment.status] ?? enrollment.status).toLowerCase()}`}
                                </p>
                            )}
                            {enrollment.first_installment && (
                                <div className="mt-3">
                                    <h3 className="mb-2 font-semibold">Première tranche des frais académiques</h3>
                                    <FirstInstallmentDetails installment={enrollment.first_installment} />
                                </div>
                            )}
                            {enrollment.first_installment_review_required && (
                                <p role="status">La couverture de la première tranche nécessite un réexamen administratif.</p>
                            )}
                        </div>
                        {pendingEnrollment &&
                            !enrollment.first_installment?.activation?.automatic &&
                            enrollment.canConfirm &&
                            !enrollment.blocker && (
                                <button type="button" className="portal-primary" onClick={confirmEnrollment}>
                                    <ClipboardCheck size={17} aria-hidden="true" /> Confirmer l’inscription
                                </button>
                            )}
                    </section>
                )}
                <section
                    id="paiements"
                    className="portal-panel finance-operational-panel finance-focused-payments"
                    aria-labelledby="finance-payments-title"
                >
                    <header className="finance-section-heading">
                        <div>
                            <h2 id="finance-payments-title">Versements</h2>
                            <p>
                                {props.pendingPaymentCount > 0
                                    ? `${props.pendingPaymentCount} en attente de vérification`
                                    : 'Aucun versement en attente de vérification'}
                            </p>
                        </div>
                        <button type="button" className="admin-secondary" onClick={() => recordPayment()}>
                            Saisir un versement
                        </button>
                    </header>
                    {props.dualControl && (
                        <p className="finance-control">
                            <ShieldCheck size={16} aria-hidden="true" /> La confirmation exige un agent distinct de l’auteur de la saisie.
                        </p>
                    )}
                    {props.payments?.data.length ? (
                        <div className="academic-table-scroll">
                            <table className="academic-table finance-payment-table">
                                <thead>
                                    <tr>
                                        <th>Versement</th>
                                        <th>Montant</th>
                                        <th>Statut</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody data-dashboard-panel="payments_page">
                                    {props.payments.data.map((payment) => (
                                        <tr key={payment.id}>
                                            <td>
                                                <strong>{payment.reference}</strong>
                                                <small>
                                                    {feeLabel(payment.kind)} · {paymentMethod(payment.method)}
                                                </small>
                                                {payment.recorded_at && <small>Saisi le {paymentDate.format(new Date(payment.recorded_at))}</small>}
                                                {payment.note && (
                                                    <details className="finance-payment-proof">
                                                        <summary>Justificatif de saisie</summary>
                                                        <p>{payment.note}</p>
                                                    </details>
                                                )}
                                            </td>
                                            <td className="finance-payment-amount">{money(payment.amount_cents, payment.currency)}</td>
                                            <td>
                                                <span className="finance-payment-status" data-status={payment.status}>
                                                    {payment.status === 'pending'
                                                        ? 'En vérification'
                                                        : payment.status === 'confirmed'
                                                          ? 'Confirmé'
                                                          : statusLabel(payment.status)}
                                                </span>
                                                {payment.status === 'confirmed' && payment.confirmed_at && (
                                                    <small>Le {paymentDate.format(new Date(payment.confirmed_at))}</small>
                                                )}
                                            </td>
                                            <td>
                                                <div className="finance-payment-actions">
                                                    {payment.can_confirm && (
                                                        <button
                                                            type="button"
                                                            className="portal-primary"
                                                            onClick={() => updatePaymentStatus(payment, 'confirmed')}
                                                        >
                                                            Confirmer le versement
                                                        </button>
                                                    )}
                                                    {payment.status === 'pending' && !payment.can_confirm && (
                                                        <small>À vérifier par un autre agent</small>
                                                    )}
                                                    {payment.confirmed_at && (
                                                        <a
                                                            href={route('dashboard.admin.finance.receipt', payment.id)}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                        >
                                                            Consulter le reçu
                                                        </a>
                                                    )}
                                                    {payment.status === 'confirmed' && payment.kind === 'unallocated' && (
                                                        <button type="button" className="academic-link-button" onClick={() => setAllocating(payment)}>
                                                            Affecter aux obligations
                                                        </button>
                                                    )}
                                                    {['pending', 'confirmed'].includes(payment.status) && (
                                                        <details className="finance-payment-more">
                                                            <summary>Autres actions</summary>
                                                            <div>
                                                                <button
                                                                    type="button"
                                                                    className="academic-link-button"
                                                                    onClick={() => updatePaymentStatus(payment, 'cancelled')}
                                                                >
                                                                    Annuler l’écriture
                                                                </button>
                                                                {payment.status === 'confirmed' && (
                                                                    <button
                                                                        type="button"
                                                                        className="academic-link-button"
                                                                        onClick={() =>
                                                                            show(
                                                                                'Demander un remboursement',
                                                                                route('dashboard.admin.finance.refund', payment.id),
                                                                                [
                                                                                    { name: 'amount', label: 'Montant demandé', required: true },
                                                                                    reason,
                                                                                ],
                                                                                { operation_key: crypto.randomUUID() },
                                                                                'Une autorisation et une référence d’exécution sont nécessaires au décaissement.',
                                                                            )
                                                                        }
                                                                    >
                                                                        Demander un remboursement
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </details>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p>Aucun versement enregistré pour ce compte.</p>
                    )}
                    <Pagination value={props.payments} preserveScroll preserveState />
                </section>
                <details
                    className="portal-panel finance-operational-panel finance-account-options"
                    open={!props.statement.balance.assessed || undefined}
                >
                    <summary>Barème, aides et remboursements</summary>
                    <div className="student-dossier-links">
                        <button className="admin-secondary" disabled={!activeTariffs.length} type="button" onClick={applyTariff}>
                            Facturer un barème actif
                        </button>

                        <button
                            className="admin-secondary"
                            disabled={!feeKinds.length}
                            onClick={() =>
                                show(
                                    'Bourse, réduction ou exonération',
                                    route('dashboard.admin.student-academic.adjustments', props.selected.id),
                                    [
                                        kindField,
                                        {
                                            name: 'type',
                                            label: 'Décision',
                                            type: 'select',
                                            required: true,
                                            options: [
                                                { value: 'scholarship', label: 'Bourse' },
                                                { value: 'reduction', label: 'Réduction' },
                                                { value: 'exemption', label: 'Exonération' },
                                            ],
                                        },
                                        {
                                            name: 'funding_source',
                                            label: 'Financement',
                                            type: 'select',
                                            value: 'institution',
                                            options: [
                                                { value: 'institution', label: 'Institution — réduction des frais dus' },
                                                { value: 'third_party', label: 'Tiers — financement attendu, non encaissé' },
                                            ],
                                        },
                                        { name: 'amount', label: 'Montant fixe (laisser vide pour pourcentage / exonération)' },
                                        { name: 'percentage', label: 'Pourcentage (à la place du montant fixe)' },
                                        { name: 'starts_at', label: 'Début', type: 'date' },
                                        { name: 'expires_at', label: 'Fin', type: 'date' },
                                        { name: 'stackable', label: 'Cumul expressément autorisé avec les aides compatibles', type: 'checkbox' },
                                        reason,
                                    ],
                                    { operation_key: crypto.randomUUID() },
                                )
                            }
                        >
                            Accorder une aide
                        </button>
                        <button
                            className="admin-secondary"
                            disabled={!feeKinds.length}
                            onClick={() =>
                                show(
                                    'Échéancier / moratoire approuvé',
                                    route('dashboard.admin.student-academic.adjustments', props.selected.id),
                                    [
                                        kindField,
                                        {
                                            name: 'schedule',
                                            label: 'Échéances couvrant exactement les frais nets',
                                            type: 'schedule',
                                            required: true,
                                        },
                                        reason,
                                    ],
                                    { type: 'plan', currency: props.statement.balance.currency, operation_key: crypto.randomUUID() },
                                )
                            }
                        >
                            Réaménager les échéances
                        </button>
                    </div>
                    <h3>Aides et décisions financières</h3>
                    {props.adjustments?.data.map((a) => (
                        <article key={a.id}>
                            <p>
                                {a.type} · {a.fee_kind} ·{' '}
                                {a.funding_source === 'third_party' ? 'Financement attendu d’un tiers' : 'Décision de l’institution'} ·{' '}
                                {a.amount_cents !== null ? money(a.amount_cents, props.statement.balance.currency) : 'Voir échéancier / périmètre'} ·{' '}
                                {a.is_active ? 'Active (selon dates)' : 'Révoquée ou remplacée'}
                            </p>
                            <p>{a.reason}</p>
                            {a.is_active && (
                                <button
                                    className="academic-link-button"
                                    onClick={() =>
                                        show(
                                            'Révoquer la décision en conservant son historique',
                                            route('dashboard.admin.student-academic.adjustments.revoke', a.id),
                                            [reason],
                                        )
                                    }
                                >
                                    Révoquer avec justification
                                </button>
                            )}
                        </article>
                    ))}
                    <Pagination value={props.adjustments} preserveScroll preserveState />
                    <h3>Autorisations et décaissements</h3>
                    {props.refunds?.data.map((refund) => (
                        <article key={refund.id}>
                            <p>
                                Paiement #{refund.student_payment_id} · {money(refund.amount_cents, props.statement.balance.currency)} ·{' '}
                                {statusLabel(refund.status)}
                            </p>
                            <p>{refund.reason}</p>
                            {refund.execution_reference && <p>Exécution : {refund.execution_reference}</p>}
                            {['requested', 'approved'].includes(refund.status) && (
                                <div className="student-dossier-links">
                                    <button
                                        className="admin-secondary"
                                        onClick={() =>
                                            show(
                                                refund.status === 'requested'
                                                    ? 'Autoriser le remboursement'
                                                    : 'Attester le décaissement réellement exécuté',
                                                route('dashboard.admin.finance.refunds.status', refund.id),
                                                actionReason(refund.status === 'requested' ? 'approved' : 'executed'),
                                                { status: refund.status === 'requested' ? 'approved' : 'executed' },
                                                'Cette action engage votre validation et est auditée. Ne confirmez une exécution qu’après contrôle du décaissement.',
                                            )
                                        }
                                    >
                                        {refund.status === 'requested' ? 'Autoriser' : 'Confirmer le décaissement exécuté'}
                                    </button>
                                    <button
                                        className="admin-secondary"
                                        onClick={() =>
                                            show(
                                                'Annuler la demande de remboursement',
                                                route('dashboard.admin.finance.refunds.status', refund.id),
                                                [reason],
                                                { status: 'cancelled' },
                                            )
                                        }
                                    >
                                        Annuler la demande
                                    </button>
                                </div>
                            )}
                        </article>
                    ))}
                    <Pagination value={props.refunds} preserveScroll preserveState />
                </details>
                <Link
                    className="finance-account-link"
                    href={route('dashboard.admin.student-academic.show', { academic: props.selected.id, section: 'Finances' })}
                >
                    Dossier étudiant 360° <ArrowRight size={15} aria-hidden="true" />
                </Link>
            </div>
        </Dashboard>
    );
}
function AccountPaymentProofs({
    proofs,
    onReview,
    paymentsPageUrl,
}: {
    proofs: PaymentProof[];
    onReview: (proof: PaymentProof, decision: 'approve' | 'reject') => void;
    paymentsPageUrl: string | null;
}) {
    return (
        <section id="justificatifs" className="portal-panel finance-operational-panel finance-proof-review" aria-labelledby="finance-proofs-title">
            <header className="finance-section-heading">
                <div>
                    <h2 id="finance-proofs-title">
                        <FileCheck2 size={20} aria-hidden="true" /> Justificatifs de paiement
                    </h2>
                    <p>Vérifiez la pièce et la réception du versement avant de valider.</p>
                </div>
            </header>
            <ul className="finance-proof-list">
                {proofs.map((proof) => {
                    const proofStatus = paymentProofStatus(proof);
                    const accountingStatus = proofPaymentStatus(proof);
                    const reviewNote = proof.decision_reason ?? proof.review_note;

                    return (
                        <li className="finance-proof-entry" id={`justificatif-${proof.id}`} key={proof.id}>
                            <div className="finance-proof-facts">
                                <p className="finance-proof-category">{proof.kind_label}</p>
                                <h3>{money(proof.amount_cents, proof.currency)}</h3>
                                <p className="finance-proof-meta">
                                    {paymentMethod(proof.method)} · {proof.reference}
                                </p>
                                <p className="finance-proof-meta">
                                    Déposé le <time dateTime={proof.submitted_at}>{paymentDate.format(new Date(proof.submitted_at))}</time>
                                </p>
                                {reviewNote && <p className="finance-proof-review-note">{reviewNote}</p>}
                                <PaymentProofHistory proof={proof} />
                            </div>
                            <div className="finance-proof-controls">
                                <span className="finance-payment-status" data-status={proofStatus === 'accepted' ? 'confirmed' : proofStatus}>
                                    {proofStatuses[proofStatus]}
                                </span>
                                {accountingStatus && (
                                    <span className="finance-payment-status" data-status={accountingStatus}>
                                        {proofPaymentLabel(proof, accountingStatus)}
                                    </span>
                                )}
                                <div className="finance-proof-actions">
                                    {proof.download_url && (
                                        <a
                                            className="admin-secondary"
                                            href={proof.download_url}
                                            aria-label={`Télécharger la pièce ${proof.reference}`}
                                        >
                                            <Download size={16} aria-hidden="true" /> Télécharger la pièce
                                        </a>
                                    )}
                                    {proof.review_url && (
                                        <>
                                            <button
                                                className="admin-secondary"
                                                type="button"
                                                onClick={() => onReview(proof, 'reject')}
                                                aria-label={`Refuser le justificatif ${proof.reference}`}
                                            >
                                                Refuser
                                            </button>
                                            <button
                                                className="portal-primary"
                                                type="button"
                                                onClick={() => onReview(proof, 'approve')}
                                                aria-label={`Valider le justificatif ${proof.reference}`}
                                            >
                                                Valider
                                            </button>
                                        </>
                                    )}
                                    {accountingStatus === 'pending' &&
                                        (paymentsPageUrl ? (
                                            <Link className="finance-account-link" href={paymentsPageUrl}>
                                                Voir les versements <ArrowRight size={15} aria-hidden="true" />
                                            </Link>
                                        ) : (
                                            <a className="finance-account-link" href="#paiements">
                                                Voir les versements <ArrowRight size={15} aria-hidden="true" />
                                            </a>
                                        ))}
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

function Allocation({
    payment,
    obligations,
    returnContext,
    acceptsResponse,
    close,
    onSuccess,
}: {
    payment: Payment;
    obligations: Props['obligations'];
    returnContext: Record<string, string | number | boolean | null>;
    acceptsResponse: (page: Page) => boolean;
    close: () => void;
    onSuccess: (message: string) => void;
}) {
    const form = useForm({ amounts: Object.fromEntries(obligations.map((o) => [String(o.id), ''])), reason: '' });
    const [responseError, setResponseError] = useState<string | null>(null);
    return (
        <AdminModal
            title="Affecter le versement confirmé"
            description={`${payment.reference} · ${money(payment.amount_cents, payment.currency)}`}
            formId="finance-allocation"
            submitLabel="Affecter après contrôle"
            busy={form.processing}
            errors={form.errors}
            onClose={close}
        >
            <form
                id="finance-allocation"
                className="portal-form"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (form.processing) return;
                    setResponseError(null);
                    form.transform((data) => ({
                        ...returnContext,
                        reason: data.reason,
                        allocations: Object.entries(data.amounts)
                            .filter(([, amount]) => amount !== '')
                            .map(([id, amount]) => ({ obligation_id: Number(id), amount })),
                    }));
                    form.post(route('dashboard.admin.finance.allocate', payment.id), {
                        preserveScroll: true,
                        onSuccess: (page) => {
                            const message = (page.props.flash as { success?: string } | undefined)?.success;
                            if (message && acceptsResponse(page)) {
                                onSuccess(message);
                            } else {
                                setResponseError('L’affectation n’a pas été confirmée. Consultez le compte avant de réessayer.');
                            }
                        },
                    });
                }}
            >
                {obligations.map((o) => (
                    <label key={o.id}>
                        {o.title} ({o.kind})
                        <input
                            inputMode="decimal"
                            value={form.data.amounts[o.id]}
                            onChange={(e) => form.setData('amounts', { ...form.data.amounts, [o.id]: e.target.value })}
                        />
                    </label>
                ))}
                <label>
                    Justification
                    <textarea required minLength={10} value={form.data.reason} onChange={(e) => form.setData('reason', e.target.value)} />
                </label>
                {responseError && <p role="alert">{responseError}</p>}
            </form>
        </AdminModal>
    );
}

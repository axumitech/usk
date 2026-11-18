import Pagination from '@/components/admin/Pagination';
import { formatDate } from '@/lib/studentEnrollment';
import { defaultUploadLimits, documentAccept, proofUploadError, proofUploadHelp } from '@/lib/uploadLimits';
import { Link, useForm } from '@inertiajs/react';
import * as Dialog from '@radix-ui/react-dialog';
import {
    ArrowLeft,
    ArrowRight,
    Building2,
    CalendarDays,
    Check,
    ChevronRight,
    CircleAlert,
    Clock3,
    Download,
    FileCheck2,
    HandCoins,
    ListChecks,
    MessageCircle,
    ReceiptText,
    Upload,
    Wallet,
    X,
} from 'lucide-react';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import '../../../css/student-finance.css';
import FirstInstallmentDetails, { EnrollmentActivationStatus } from './FirstInstallmentDetails';
import { studentHref } from './navigation';
import {
    labels,
    money,
    type Balance,
    type FinanceDueLine,
    type FinanceObligation,
    type PortalProps,
    type StudentPayment,
    type StudentPaymentProofs,
} from './types';

const balanceStates: Record<string, [string, string]> = {
    unassessed: ['À établir', 'neutral'],
    unpaid: ['À régler', 'warning'],
    partial: ['Règlement partiel', 'info'],
    overdue: ['Échéance dépassée', 'danger'],
    cleared: ['Solde réglé', 'success'],
    exempted: ['Exonération', 'success'],
};
const feeStates: Record<FinanceDueLine['status'], [string, string]> = {
    paid: ['Réglé', 'success'],
    exempted: ['Exonéré', 'success'],
    overdue: ['En retard', 'danger'],
    partial: ['Partiellement réglé', 'info'],
    upcoming: ['À régler', 'warning'],
};
const paymentStates: Record<string, [string, string]> = {
    confirmed: ['Confirmé', 'success'],
    pending: ['En vérification', 'warning'],
    cancelled: ['Annulé', 'danger'],
    refunded: ['Remboursé', 'neutral'],
};
const proofStates: Record<StudentPaymentProofs['submissions'][number]['status'], [string, string]> = {
    pending: ['En vérification', 'warning'],
    confirmed: ['Confirmé', 'success'],
    rejected: ['Refusé', 'danger'],
};
const methods: Record<string, string> = {
    cash: 'Espèces',
    bank_transfer: 'Virement',
    mobile_money: 'Mobile Money',
    card: 'Carte',
    cheque: 'Chèque',
    other: 'Autre mode',
};

function Status({ state }: { state: [string, string] }) {
    return (
        <span className="sf-status" data-tone={state[1]}>
            {state[0]}
        </span>
    );
}

function PaymentGuide({ academic, canSubmit }: { academic: number; canSubmit: boolean }) {
    return (
        <Dialog.Root>
            <Dialog.Trigger asChild>
                <button type="button" className="sf-guide-trigger">
                    <ReceiptText size={19} aria-hidden="true" />
                    Comment faire enregistrer mon paiement ?
                    <ChevronRight size={17} aria-hidden="true" />
                </button>
            </Dialog.Trigger>
            <Dialog.Portal>
                <Dialog.Overlay className="sf-guide-overlay" />
                <Dialog.Content className="sf-guide">
                    <Dialog.Close className="sf-guide-close" aria-label="Fermer">
                        <X size={21} aria-hidden="true" />
                    </Dialog.Close>
                    <span className="sf-icon" aria-hidden="true">
                        <Building2 size={24} />
                    </span>
                    <Dialog.Title>Faire enregistrer un paiement</Dialog.Title>
                    <Dialog.Description>Effectuez le versement selon les modalités communiquées par l’université.</Dialog.Description>
                    <ol>
                        <li>
                            <div>
                                <strong>Effectuez votre versement</strong>
                                <p>Suivez les modalités communiquées par le service financier de l’université.</p>
                            </div>
                        </li>
                        <li>
                            <div>
                                <strong>{canSubmit ? 'Envoyez votre justificatif' : 'Présentez le justificatif au service financier'}</strong>
                                <p>
                                    {canSubmit
                                        ? 'Joignez le document depuis votre compte financier et indiquez la référence du versement.'
                                        : 'Présentez le document reçu lors du versement avec votre matricule.'}
                                </p>
                            </div>
                        </li>
                        <li>
                            <div>
                                <strong>Retrouvez la confirmation ici</strong>
                                <p>
                                    Après vérification par la comptabilité, le versement confirmé apparaît dans votre historique, avec son reçu s’il
                                    est disponible.
                                </p>
                            </div>
                        </li>
                    </ol>
                    <Dialog.Close asChild>
                        {canSubmit ? (
                            <a className="sf-guide-contact" href="#finance-payment-proofs">
                                Déposer un justificatif <ArrowRight size={17} aria-hidden="true" />
                            </a>
                        ) : (
                            <Link className="sf-guide-contact" href={`${studentHref('services', academic)}&category=finance`}>
                                Ouvrir les démarches financières <ArrowRight size={17} aria-hidden="true" />
                            </Link>
                        )}
                    </Dialog.Close>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

function PanelHeading({ title, description, icon: Icon }: { title: string; description?: string; icon: typeof Wallet }) {
    return (
        <header className="sf-panel-heading">
            <span className="sf-icon">
                <Icon size={21} aria-hidden="true" />
            </span>
            <div>
                <h2>{title}</h2>
                {description && <p>{description}</p>}
            </div>
        </header>
    );
}

function Empty({ children }: { children: ReactNode }) {
    return <p className="sf-empty">{children}</p>;
}

function PaymentList({ payments, currency }: { payments: StudentPayment[]; currency: string }) {
    return (
        <ul className="sf-list sf-payments">
            {payments.map((payment) => {
                const state = paymentStates[payment.status] ?? [labels[payment.status] ?? payment.status, 'neutral'];
                const Icon = payment.status === 'confirmed' ? Check : payment.status === 'pending' ? Clock3 : ReceiptText;
                const refund = payment.refunded_cents ?? 0;
                return (
                    <li key={payment.id} className="sf-line sf-payment">
                        <span className="sf-line-icon" data-tone={state[1]}>
                            <Icon size={17} aria-hidden="true" />
                        </span>
                        <div className="sf-line-label">
                            <strong>{payment.kind_title || payment.reference}</strong>
                            {payment.kind_title && <small>Réf. {payment.reference}</small>}
                            <small>
                                {formatDate(payment.confirmed_at ?? payment.created_at)} · {methods[payment.method] ?? 'Autre mode'}
                            </small>
                            {refund > 0 && <small>Remboursement : {money(refund, payment.currency ?? currency)}</small>}
                        </div>
                        <div className="sf-line-value">
                            <strong>{money(payment.amount_cents, payment.currency ?? currency)}</strong>
                            <Status state={state} />
                            {payment.receipt_url && (
                                <a
                                    href={payment.receipt_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Voir le reçu ${payment.reference} (nouvel onglet)`}
                                >
                                    <Download size={15} aria-hidden="true" /> Reçu
                                </a>
                            )}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

function Installment({ line, obligation, currency }: { line: FinanceDueLine; obligation?: FinanceObligation; currency: string }) {
    const state = feeStates[line.status] ?? feeStates.upcoming;
    const Icon = line.status === 'paid' || line.status === 'exempted' ? Check : line.status === 'overdue' ? CircleAlert : Clock3;
    const unit = line.currency ?? currency;
    const waived = obligation?.waived_cents ?? 0;
    const paid = obligation?.paid_cents ?? Math.max(0, line.amount_cents - line.remaining_cents);
    return (
        <li className="sf-installment" data-status={line.status}>
            <div className="sf-installment-header">
                <span className="sf-line-icon" data-tone={state[1]}>
                    <Icon size={17} aria-hidden="true" />
                </span>
                <div>
                    <h4>{line.title}</h4>
                    <p>
                        {obligation?.rescheduled ? (
                            'Date remplacée par l’échéancier approuvé'
                        ) : line.due_at ? (
                            <>
                                Date limite <time dateTime={line.due_at}>{formatDate(line.due_at)}</time>
                            </>
                        ) : line.kind === 'tuition' ? (
                            'Date limite à fixer'
                        ) : (
                            'Sans date limite'
                        )}
                    </p>
                </div>
                <Status state={state} />
            </div>
            <dl className="sf-installment-amounts">
                <div>
                    <dt>Montant prévu</dt>
                    <dd>{money(line.amount_cents, unit)}</dd>
                </div>
                {waived > 0 && (
                    <div>
                        <dt>Aides déduites</dt>
                        <dd>{money(waived, unit)}</dd>
                    </div>
                )}
                <div>
                    <dt>Réglé</dt>
                    <dd>{money(paid, unit)}</dd>
                </div>
                <div className="sf-installment-due">
                    <dt>Reste à payer</dt>
                    <dd>{money(line.remaining_cents, unit)}</dd>
                </div>
            </dl>
        </li>
    );
}

function InstallmentSchedule({
    schedule,
    obligations,
    currency,
    annual,
}: {
    schedule: FinanceDueLine[];
    obligations: FinanceObligation[];
    currency: string;
    annual?: { details: PortalProps['finance_details']; feesUrl: string };
}) {
    const amountsById = new Map(obligations.map((obligation) => [obligation.id, obligation]));
    const groups = new Map<string, FinanceDueLine[]>();
    for (const line of schedule.length ? schedule : obligations) {
        const kind = groups.get(line.kind) ?? [];
        kind.push(line);
        groups.set(line.kind, kind);
    }
    const feeGroups = [...groups].sort(([a], [b]) => Number(b === 'tuition') - Number(a === 'tuition'));
    const title = annual ? 'Détail des frais par type' : 'Échéancier de paiement';
    return (
        <section id="finance-schedule" className="sf-panel sf-installment-panel" aria-label={title}>
            <PanelHeading
                title={title}
                description={
                    annual
                        ? 'Retrouvez ce qu’il reste à payer pour chaque type de frais et les dates limites lorsqu’elles sont fixées.'
                        : 'Les frais à régler et leurs dates limites lorsqu’elles sont fixées.'
                }
                icon={CalendarDays}
            />
            {feeGroups.length === 0 && (
                <Empty>
                    {annual
                        ? 'Aucun frais n’a encore été affecté à cette inscription.'
                        : 'Les tranches apparaîtront après la facturation de vos frais par le service financier.'}
                </Empty>
            )}
            {feeGroups.map(([kind, lines]) => {
                const original = obligations.filter((line) => line.kind === kind && line.rescheduled);
                const kindTitle = annual?.details?.kind_titles?.[kind] ?? lines[0].kind_title ?? lines[0].title;
                const kindBalance = annual?.details?.kinds?.[kind];
                return (
                    <section className="sf-installment-group" key={kind}>
                        {kindBalance ? (
                            <header className="sf-annual-group">
                                <div className="sf-annual-group-heading">
                                    <h3>{kindTitle}</h3>
                                    {annual?.details?.can_submit_proof && kindBalance.balance_cents > 0 && (
                                        <Link
                                            className="sf-annual-proof"
                                            href={`${annual.feesUrl}&kind=${encodeURIComponent(kind)}#finance-payment-proofs`}
                                            aria-label={`Déposer un justificatif pour : ${kindTitle}`}
                                        >
                                            <Upload size={16} aria-hidden="true" /> Déposer un justificatif
                                        </Link>
                                    )}
                                </div>
                                <dl className="sf-annual-kind-totals">
                                    <div>
                                        <dt>À régler après aides</dt>
                                        <dd>{money(kindBalance.due_cents, kindBalance.currency)}</dd>
                                    </div>
                                    <div>
                                        <dt>Réglé</dt>
                                        <dd>{money(coveredAmount(kindBalance), kindBalance.currency)}</dd>
                                    </div>
                                    <div>
                                        <dt>Reste à payer</dt>
                                        <dd>{money(kindBalance.balance_cents, kindBalance.currency)}</dd>
                                    </div>
                                </dl>
                            </header>
                        ) : (
                            <h3>{kindTitle}</h3>
                        )}
                        <ol className="sf-installment-list">
                            {lines.map((line, index) => (
                                <Installment
                                    key={line.id}
                                    line={typeof line.id === 'string' ? { ...line, title: `Échéance approuvée ${index + 1}` } : line}
                                    obligation={typeof line.id === 'number' ? amountsById.get(line.id) : undefined}
                                    currency={currency}
                                />
                            ))}
                        </ol>
                        {original.length > 0 && (
                            <details className="sf-original-installments">
                                <summary>Voir les tranches initiales</summary>
                                <ol className="sf-installment-list">
                                    {original.map((line) => (
                                        <Installment key={line.id} line={line} obligation={line} currency={currency} />
                                    ))}
                                </ol>
                            </details>
                        )}
                    </section>
                );
            })}
        </section>
    );
}

function coveredAmount(balance: Balance) {
    return Math.max(0, balance.due_cents - balance.balance_cents);
}

function EnrollmentPaymentSummary({ props }: { props: PortalProps }) {
    const installment = props.first_installment;
    if (!installment) return null;

    const { enrollment_status: status } = props.academic;
    const statusLabel = status === 'pending_confirmation' ? 'en attente de confirmation' : (labels[status] ?? status).toLowerCase();
    const proofUnderReview = props.payment_proofs?.submissions.some((submission) => submission.status === 'pending');

    return (
        <section id="finance-first-installment" className="sf-panel scroll-mt-24" aria-label="Première tranche et inscription">
            <PanelHeading title="Première tranche des frais académiques" description={`Inscription ${statusLabel}`} icon={Wallet} />
            <EnrollmentActivationStatus installment={installment} status={status} admitted={props.academic.application_status === 'validated'} />
            <FirstInstallmentDetails installment={installment} />
            {proofUnderReview && <p>Un justificatif de versement est en cours de vérification par la comptabilité.</p>}
            {status === 'pending_confirmation' && !installment.activation?.automatic && installment.status === 'covered' && (
                <p>La première tranche est couverte. Le service des inscriptions doit encore confirmer votre inscription.</p>
            )}
            {props.first_installment_review_required && (
                <p className="portal-alert" role="status">
                    La couverture de la première tranche doit être réexaminée. Contactez le service financier pour connaître la suite.
                </p>
            )}
        </section>
    );
}

function AnnualFees({ props, feesUrl }: { props: PortalProps; feesUrl: string }) {
    const { academic, balance, finance_details: details, finance_schedule: schedule = [] } = props;
    const obligations = details?.obligations ?? [];
    const covered = coveredAmount(balance);
    const status = balance.financial_clearance_status === 'partial' && covered === 0 ? 'unpaid' : balance.financial_clearance_status;
    const indicator = balanceStates[status] ?? balanceStates.unassessed;
    return (
        <div className="sf-page sf-annual-page">
            <header className="sf-subpage-header">
                <Link href={feesUrl}>
                    <ArrowLeft size={17} aria-hidden="true" /> Finances
                </Link>
                <h1>Frais de l’année</h1>
                <p>
                    Année académique {academic.year} · {academic.level}
                </p>
            </header>
            <div className="sf-summary">
                <section className="sf-hero" aria-labelledby="finance-annual-balance">
                    <div className="sf-hero-art" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                        <span>
                            <ReceiptText size={47} strokeWidth={1.2} />
                        </span>
                    </div>
                    <div className="sf-hero-top">
                        <h2 id="finance-annual-balance">Reste à payer</h2>
                        <Status state={indicator} />
                    </div>
                    <p className="sf-balance" aria-live="polite">
                        {balance.assessed ? money(balance.balance_cents, balance.currency) : 'À établir'}
                    </p>
                    <p className="sf-hero-note">
                        {balance.assessed
                            ? 'Solde des frais affectés à cette inscription après les versements confirmés.'
                            : 'Votre total sera disponible dès que des frais seront affectés à cette inscription.'}
                    </p>
                </section>
                <section className="sf-panel sf-annual-breakdown">
                    <PanelHeading title="Bilan de l’année" icon={ListChecks} />
                    <dl className="sf-progress-totals">
                        <div>
                            <dt>Frais affectés</dt>
                            <dd>{balance.assessed ? money(balance.total_cents, balance.currency) : '—'}</dd>
                        </div>
                        <div>
                            <dt>Remises et aides</dt>
                            <dd>{balance.assessed ? money(balance.waived_cents, balance.currency) : '—'}</dd>
                        </div>
                        <div>
                            <dt>À régler après aides</dt>
                            <dd>{balance.assessed ? money(balance.due_cents, balance.currency) : '—'}</dd>
                        </div>
                        <div>
                            <dt>Réglé</dt>
                            <dd>{balance.assessed ? money(covered, balance.currency) : '—'}</dd>
                        </div>
                    </dl>
                </section>
            </div>
            <EnrollmentPaymentSummary props={props} />
            {!props.first_installment && balance.assessed && !obligations.some((line) => line.kind === 'tuition') && (
                <div className="sf-notices">
                    <p>
                        <CircleAlert size={18} aria-hidden="true" />
                        <span>Le solde couvre les frais déjà facturés. Les tranches de frais académiques restent à établir.</span>
                    </p>
                </div>
            )}
            {balance.pending_cents > 0 && (
                <div className="sf-notices">
                    <p>
                        <Clock3 size={18} aria-hidden="true" />
                        <span>
                            <strong>{money(balance.pending_cents, balance.currency)}</strong> en attente de confirmation par la comptabilité.
                        </span>
                    </p>
                </div>
            )}
            <InstallmentSchedule schedule={schedule} obligations={obligations} currency={balance.currency} annual={{ details, feesUrl }} />
        </div>
    );
}

function ProofForm({ proofs, currency, submitUrl }: { proofs: StudentPaymentProofs; currency: string; submitUrl: string }) {
    const defaultKind = proofs.kinds.find((kind) => kind.id === proofs.selected_kind)?.id ?? (proofs.kinds.length === 1 ? proofs.kinds[0].id : '');
    const form = useForm({ kind: defaultKind, amount: '', method: '', reference: '', proof: null as File | null });
    const file = useRef<HTMLInputElement>(null);
    const [sent, setSent] = useState(false);
    const limits = { document_kb: proofs.max_kb, image_kb: Math.min(proofs.max_kb, defaultUploadLimits.image_kb) };
    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (form.processing) return;
        setSent(false);
        const error = form.data.proof && proofUploadError(form.data.proof, limits);
        if (error) {
            form.setError('proof', error);
            return;
        }
        form.post(submitUrl, {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: () => {
                form.reset();
                if (file.current) file.current.value = '';
                setSent(true);
            },
        });
    }
    return (
        <form className="sf-proof-form" onSubmit={submit}>
            <fieldset disabled={form.processing} aria-busy={form.processing}>
                <div className="sf-proof-fields">
                    <label className="sf-proof-kind">
                        Frais concernés
                        <select
                            value={form.data.kind}
                            onChange={(event) => form.setData('kind', event.target.value)}
                            aria-invalid={Boolean(form.errors.kind) || undefined}
                            required
                        >
                            <option value="">Sélectionner les frais</option>
                            {proofs.kinds.map((kind) => (
                                <option value={kind.id} key={kind.id}>
                                    {typeof kind.balance_cents === 'number'
                                        ? `${kind.label} · Reste : ${money(kind.balance_cents, kind.currency ?? currency)}`
                                        : kind.label}
                                </option>
                            ))}
                        </select>
                        <small>Choisissez le type de frais indiqué sur votre preuve de versement.</small>
                    </label>
                    <label>
                        Montant réellement versé ({currency})
                        <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            inputMode="decimal"
                            value={form.data.amount}
                            onChange={(event) => form.setData('amount', event.target.value)}
                            aria-invalid={Boolean(form.errors.amount) || undefined}
                            required
                        />
                    </label>
                    <label>
                        Mode de paiement
                        <select
                            value={form.data.method}
                            onChange={(event) => form.setData('method', event.target.value)}
                            aria-invalid={Boolean(form.errors.method) || undefined}
                            required
                        >
                            <option value="">Sélectionner le mode</option>
                            {proofs.methods.map((method) => (
                                <option value={method} key={method}>
                                    {methods[method] ?? method}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Référence du versement
                        <input
                            type="text"
                            autoComplete="off"
                            maxLength={180}
                            value={form.data.reference}
                            onChange={(event) => form.setData('reference', event.target.value)}
                            aria-invalid={Boolean(form.errors.reference) || undefined}
                            required
                        />
                    </label>
                    <label className="sf-proof-file">
                        <span>
                            <Upload size={18} aria-hidden="true" /> Joindre le justificatif
                        </span>
                        <input
                            type="file"
                            accept={documentAccept}
                            ref={file}
                            onChange={(event) => {
                                form.setData('proof', event.target.files?.[0] ?? null);
                                form.clearErrors('proof');
                                setSent(false);
                            }}
                            aria-invalid={Boolean(form.errors.proof) || undefined}
                            required
                        />
                        <small>{proofUploadHelp(limits)}</small>
                    </label>
                </div>
                {Object.values(form.errors).length > 0 && (
                    <ul className="sf-proof-errors" role="alert">
                        {Object.entries(form.errors).map(([field, message]) => (
                            <li key={field}>{message}</li>
                        ))}
                    </ul>
                )}
                <button className="sf-proof-submit" type="submit">
                    {form.processing ? 'Envoi du justificatif…' : 'Envoyer le justificatif'}
                    <ArrowRight size={17} aria-hidden="true" />
                </button>
            </fieldset>
            {sent && (
                <p className="sf-proof-success" role="status">
                    Justificatif envoyé au service financier.
                </p>
            )}
        </form>
    );
}

function PaymentProofs({ proofs, currency }: { proofs: StudentPaymentProofs; currency: string }) {
    return (
        <section id="finance-payment-proofs" className="sf-panel sf-proof-panel" aria-label="Justificatifs de paiement">
            <PanelHeading
                title="Justificatifs de paiement"
                description={
                    proofs.submit_url
                        ? 'Transmettez votre preuve de versement. Votre solde est mis à jour après la confirmation par la comptabilité.'
                        : 'Suivez les justificatifs transmis pour cette inscription.'
                }
                icon={Upload}
            />
            {proofs.submit_url && <ProofForm proofs={proofs} currency={currency} submitUrl={proofs.submit_url} />}
            {proofs.submissions.length > 0 && (
                <div className="sf-proof-history">
                    <h3>Derniers justificatifs envoyés</h3>
                    <ul className="sf-list">
                        {proofs.submissions.map((submission) => {
                            const state = proofStates[submission.status];
                            const Icon = submission.status === 'confirmed' ? Check : submission.status === 'rejected' ? CircleAlert : Clock3;
                            return (
                                <li key={submission.id} className="sf-line">
                                    <span className="sf-line-icon" data-tone={state[1]}>
                                        <Icon size={17} aria-hidden="true" />
                                    </span>
                                    <div className="sf-line-label">
                                        <strong>{submission.kind_label}</strong>
                                        <small>
                                            Réf. {submission.reference} · {methods[submission.method] ?? submission.method}
                                        </small>
                                        <small>Envoyé le {formatDate(submission.submitted_at)}</small>
                                        {submission.review_note && <small>Note du service financier · {submission.review_note}</small>}
                                    </div>
                                    <div className="sf-line-value">
                                        <strong>{money(submission.amount_cents, submission.currency)}</strong>
                                        <Status state={state} />
                                        {submission.download_url && (
                                            <a href={submission.download_url} aria-label={`Télécharger le justificatif ${submission.reference}`}>
                                                <Download size={15} aria-hidden="true" /> Justificatif
                                            </a>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </section>
    );
}

export default function StudentFinance(props: PortalProps) {
    const { academic, balance, finance_details: details, finance_schedule: schedule = [], adjustments = [] } = props;
    const feesUrl = studentHref('fees', academic.id);
    const history = details?.history_url ?? studentHref('transactions', academic.id);
    const receipts = details?.receipts_url ?? `${history}&view=receipts`;
    if (props.section === 'annual-fees') return <AnnualFees props={props} feesUrl={feesUrl} />;
    if (props.section === 'transactions') {
        const receiptsOnly = props.finance_view === 'receipts';
        const payments = props.payments ?? [];
        return (
            <div className="sf-page sf-transaction-page">
                <header className="sf-subpage-header">
                    <Link href={feesUrl}>
                        <ArrowLeft size={17} aria-hidden="true" /> Finances
                    </Link>
                    <h1>{receiptsOnly ? 'Reçus et attestations' : 'Historique des paiements'}</h1>
                    <p>
                        {academic.year} · {academic.level}
                    </p>
                </header>
                <nav className="sf-segments" aria-label="Versements et reçus">
                    <Link href={history} aria-current={!receiptsOnly ? 'page' : undefined}>
                        Tous les versements
                    </Link>
                    <Link href={receipts} aria-current={receiptsOnly ? 'page' : undefined}>
                        Reçus
                    </Link>
                </nav>
                <section className="sf-panel">
                    <PanelHeading title={receiptsOnly ? 'Reçus de versement' : 'Versements enregistrés'} icon={receiptsOnly ? FileCheck2 : Clock3} />
                    {payments.length ? (
                        <PaymentList payments={payments} currency={balance.currency} />
                    ) : (
                        <Empty>
                            {receiptsOnly
                                ? 'Vos reçus apparaîtront après confirmation de vos versements par la comptabilité.'
                                : 'Aucun versement enregistré pour cette inscription.'}
                        </Empty>
                    )}
                    <Pagination value={props.payments_pagination} />
                </section>
                {receiptsOnly && (
                    <Link className="sf-text-link" href={studentHref('documents', academic.id)}>
                        Consulter mes documents officiels <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                )}
            </div>
        );
    }

    const proofs = props.payment_proofs;
    const canSubmit = Boolean(proofs?.submit_url);
    const hasProofPanel = proofs && (canSubmit || proofs.submissions.length > 0);
    const dueLines = schedule.length ? schedule : (details?.obligations ?? []);
    const next = dueLines.find((line) => line.remaining_cents > 0);
    const covered = coveredAmount(balance);
    const balanceStatus = balance.financial_clearance_status === 'partial' && covered === 0 ? 'unpaid' : balance.financial_clearance_status;
    const state = balanceStates[balanceStatus] ?? balanceStates.unassessed;
    const percent = balance.due_cents > 0 ? (balance.balance_cents === 0 ? 100 : Math.min(99, Math.round((covered / balance.due_cents) * 100))) : 0;
    const progressVisible = balance.assessed && balance.due_cents > 0;
    const pending = balance.pending_cents > 0;
    const tuitionUnbilled = !props.first_installment && balance.assessed && details && !details.obligations.some((line) => line.kind === 'tuition');
    const recent = details?.recent_payments ?? [];
    const hasReceipt = Boolean(details?.receipt_payments?.length);
    const actions = [
        {
            label: 'Frais de l’année',
            note: 'Toutes les tranches et les autres frais',
            icon: ListChecks,
            href: studentHref('annual-fees', academic.id),
        },
        { label: 'Historique des paiements', note: 'Versements saisis par la comptabilité', icon: Clock3, href: history },
        {
            label: 'Reçus et attestations',
            note: hasReceipt ? 'Consulter vos justificatifs' : 'Après confirmation de vos versements',
            icon: FileCheck2,
            href: receipts,
        },
        {
            label: 'Démarches financières',
            note: 'Échelonnement, paiement non reconnu ou réclamation',
            icon: MessageCircle,
            href: `${studentHref('services', academic.id)}&category=finance`,
        },
    ];
    return (
        <div className="sf-page">
            <header className="sf-heading">
                <span className="sf-kicker">
                    <Wallet size={15} aria-hidden="true" /> Espace étudiant
                </span>
                <h1>Finances</h1>
                <p>
                    Année académique {academic.year} <span aria-hidden="true">·</span> {academic.level}
                </p>
                {(academic.fee_category === 'national' || academic.fee_category === 'foreign') && (
                    <p>Catégorie tarifaire · {academic.fee_category === 'national' ? 'Étudiants nationaux' : 'Étudiants étrangers'}</p>
                )}
            </header>
            <div className="sf-summary">
                <section className="sf-hero" aria-labelledby="finance-balance">
                    <div className="sf-hero-art" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                        <span>
                            <Wallet size={47} strokeWidth={1.2} />
                        </span>
                    </div>
                    <div className="sf-hero-top">
                        <h2 id="finance-balance">Reste à payer</h2>
                        <Status state={state} />
                    </div>
                    <p className="sf-balance" aria-live="polite">
                        {balance.assessed ? money(balance.balance_cents, balance.currency) : 'À établir'}
                    </p>
                    <p className="sf-hero-note">
                        {balance.assessed
                            ? 'Solde de votre inscription après les versements confirmés'
                            : 'Le montant et les dates de vos tranches apparaîtront dès qu’un barème applicable à votre inscription pourra être facturé.'}
                    </p>
                    <div className="sf-hero-actions">
                        {canSubmit && (
                            <a className="sf-proof-cta" href="#finance-payment-proofs">
                                <Upload size={18} aria-hidden="true" /> Déposer un justificatif
                            </a>
                        )}
                        <PaymentGuide academic={academic.id} canSubmit={canSubmit} />
                    </div>
                </section>
                <section className="sf-panel sf-progress" aria-label="Avancement des règlements">
                    <div className="sf-progress-main">
                        <div className="sf-ring" aria-hidden="true">
                            <svg viewBox="0 0 100 100">
                                <circle className="sf-ring-track" cx="50" cy="50" r="43" />
                                {progressVisible && percent > 0 && (
                                    <circle className="sf-ring-fill" cx="50" cy="50" r="43" pathLength="100" strokeDasharray={`${percent} 100`} />
                                )}
                            </svg>
                            <strong>{progressVisible ? `${percent} %` : '—'}</strong>
                        </div>
                        <div>
                            <h2>Frais réglés</h2>
                            {progressVisible ? (
                                <p>
                                    <strong>{money(covered, balance.currency)}</strong>
                                    <span>sur {money(balance.due_cents, balance.currency)} à régler</span>
                                    <span className="sr-only"> · {percent} %</span>
                                </p>
                            ) : (
                                <p>{balance.assessed ? 'Aucun montant exigible.' : 'Disponible après affectation des frais.'}</p>
                            )}
                        </div>
                    </div>
                    <dl className="sf-progress-totals">
                        <div>
                            <dt>Frais affectés</dt>
                            <dd>{balance.assessed ? money(balance.total_cents, balance.currency) : '—'}</dd>
                        </div>
                        <div>
                            <dt>Remises et aides</dt>
                            <dd>{balance.assessed ? money(balance.waived_cents, balance.currency) : '—'}</dd>
                        </div>
                    </dl>
                    {next && (
                        <a className="sf-next" href="#finance-schedule" data-overdue={next.status === 'overdue'}>
                            <CalendarDays size={20} aria-hidden="true" />
                            <span>
                                <strong>
                                    {next.status === 'overdue'
                                        ? 'Échéance en retard'
                                        : next.due_at || next.kind === 'tuition'
                                          ? 'Prochaine tranche à régler'
                                          : 'Montant à régler'}
                                </strong>
                                <small>
                                    {next.due_at ? formatDate(next.due_at) : next.kind === 'tuition' ? 'Date limite à fixer' : 'Sans date limite'}
                                </small>
                            </span>
                            <strong>{money(next.remaining_cents, next.currency ?? balance.currency)}</strong>
                        </a>
                    )}
                </section>
            </div>
            <EnrollmentPaymentSummary props={props} />
            {(tuitionUnbilled || pending || balance.credit_cents > 0 || balance.overdue_cents > 0) && (
                <div className="sf-notices">
                    {tuitionUnbilled && (
                        <p>
                            <CircleAlert size={18} aria-hidden="true" />
                            <span>Le solde couvre les frais déjà facturés. Les tranches de frais académiques restent à établir.</span>
                        </p>
                    )}
                    {balance.overdue_cents > 0 && (
                        <p data-tone="danger">
                            <CircleAlert size={18} aria-hidden="true" />
                            <span>
                                <strong>{money(balance.overdue_cents, balance.currency)}</strong> en retard sur l’échéancier.
                            </span>
                        </p>
                    )}
                    {pending && (
                        <p>
                            <Clock3 size={18} aria-hidden="true" />
                            <span>
                                <strong>{money(balance.pending_cents, balance.currency)}</strong> en attente de confirmation par la comptabilité.
                            </span>
                        </p>
                    )}
                    {balance.credit_cents > 0 && (
                        <p>
                            <HandCoins size={18} aria-hidden="true" />
                            <span>
                                <strong>{money(balance.credit_cents, balance.currency)}</strong> en crédit sur le compte, sans réduction automatique
                                des autres frais.
                            </span>
                        </p>
                    )}
                </div>
            )}
            <nav className="sf-actions" aria-label="Rubriques financières">
                {actions.map(({ label, note, icon: Icon, href }) => (
                    <Link key={label} href={href}>
                        <span className="sf-icon">
                            <Icon size={21} aria-hidden="true" />
                        </span>
                        <span>
                            <strong>{label}</strong>
                            <small>{note}</small>
                        </span>
                        <ChevronRight size={18} aria-hidden="true" />
                    </Link>
                ))}
            </nav>
            <InstallmentSchedule schedule={schedule} obligations={details?.obligations ?? []} currency={balance.currency} />
            {hasProofPanel && <PaymentProofs key={academic.id} proofs={proofs} currency={balance.currency} />}
            <div className="sf-detail-grid">
                <section className="sf-panel sf-activity" aria-label="Derniers paiements">
                    <PanelHeading title="Derniers paiements" icon={ReceiptText} />
                    {recent.length ? (
                        <PaymentList payments={recent} currency={balance.currency} />
                    ) : (
                        <Empty>Les versements saisis par la comptabilité apparaîtront ici.</Empty>
                    )}
                    <Link className="sf-text-link" href={history}>
                        Voir tout l’historique <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                </section>
                {adjustments.length > 0 && (
                    <section className="sf-panel sf-activity" aria-label="Aides et aménagements">
                        <PanelHeading title="Aides et aménagements" icon={HandCoins} />
                        <ul className="sf-list">
                            {adjustments.map((adjustment) => (
                                <li key={adjustment.id} className="sf-line sf-adjustment">
                                    <div className="sf-line-label">
                                        <strong>
                                            {labels[adjustment.type] ?? (adjustment.type === 'reduction' ? 'Réduction' : adjustment.type)}
                                        </strong>
                                        {adjustment.funding_source === 'third_party' && (
                                            <small>Financement attendu d’un tiers, en attente de versement.</small>
                                        )}
                                        {adjustment.expires_at && <small>Valable jusqu’au {formatDate(adjustment.expires_at)}</small>}
                                    </div>
                                    {adjustment.amount_cents !== null && <strong>{money(adjustment.amount_cents, balance.currency)}</strong>}
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
            </div>
        </div>
    );
}

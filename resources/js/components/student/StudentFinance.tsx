import Pagination from '@/components/admin/Pagination';
import { formatDate } from '@/lib/studentEnrollment';
import { Link } from '@inertiajs/react';
import * as Dialog from '@radix-ui/react-dialog';
import {
    ArrowDown,
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
    GraduationCap,
    HandCoins,
    ListChecks,
    MessageCircle,
    ReceiptText,
    Wallet,
    X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import '../../../css/student-finance.css';
import { studentHref } from './navigation';
import { labels, money, type FinanceDueLine, type FinanceObligation, type PortalProps, type StudentPayment } from './types';

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

function PaymentGuide({ academic }: { academic: number }) {
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
                    <Dialog.Description>Pour le moment, les versements se font hors de l’application.</Dialog.Description>
                    <ol>
                        <li>
                            <div>
                                <strong>Effectuez votre versement</strong>
                                <p>Suivez les modalités communiquées par le service financier de l’université.</p>
                            </div>
                        </li>
                        <li>
                            <div>
                                <strong>Présentez votre preuve à l’administration</strong>
                                <p>Apportez le justificatif du versement et indiquez votre matricule.</p>
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
                        <Link className="sf-guide-contact" href={`${studentHref('services', academic)}&category=finance`}>
                            Ouvrir les démarches financières <ArrowRight size={17} aria-hidden="true" />
                        </Link>
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

function FeeLine({ line, showScheduled = false, currency }: { line: FinanceDueLine | FinanceObligation; showScheduled?: boolean; currency: string }) {
    const state = feeStates[line.status] ?? feeStates.upcoming;
    const Icon = line.status === 'paid' || line.status === 'exempted' ? Check : line.status === 'overdue' ? CircleAlert : Clock3;
    const unit = line.currency ?? currency;
    return (
        <li className="sf-line">
            <span className="sf-line-icon" data-tone={state[1]}>
                <Icon size={17} aria-hidden="true" />
            </span>
            <div className="sf-line-label">
                <strong>{line.title}</strong>
                <small>
                    {'rescheduled' in line && line.rescheduled
                        ? 'Voir l’échéancier approuvé'
                        : line.due_at
                          ? `Échéance : ${formatDate(line.due_at)}`
                          : 'Échéance non fixée'}
                </small>
                {showScheduled && line.kind_title && line.kind_title !== line.title && <small>{line.kind_title}</small>}
                {'paid_cents' in line && line.paid_cents > 0 && line.remaining_cents > 0 && <small>Réglé : {money(line.paid_cents, unit)}</small>}
                {'waived_cents' in line && line.waived_cents > 0 && <small>Remise : {money(line.waived_cents, unit)}</small>}
            </div>
            <div className="sf-line-value">
                <strong>{money(showScheduled ? line.remaining_cents : line.amount_cents, unit)}</strong>
                <Status state={state} />
                {showScheduled
                    ? line.remaining_cents !== line.amount_cents && <small>Sur {money(line.amount_cents, unit)}</small>
                    : line.remaining_cents > 0 &&
                      line.remaining_cents !== line.amount_cents && <small>Reste : {money(line.remaining_cents, unit)}</small>}
            </div>
        </li>
    );
}

function Details({ obligations, balance, academic }: Pick<PortalProps, 'academic' | 'balance'> & { obligations: FinanceObligation[] }) {
    return (
        <section id="finance-fees" className="sf-panel sf-details" aria-label="Détails des frais">
            <PanelHeading title="Détails des frais" description={academic.level} icon={GraduationCap} />
            {obligations.length ? (
                <>
                    <ul className="sf-list">
                        {obligations.map((line) => (
                            <FeeLine key={line.id} line={line} currency={balance.currency} />
                        ))}
                    </ul>
                    <div className="sf-fees-total">
                        <span>Total des frais affectés</span>
                        <strong>{money(balance.total_cents, balance.currency)}</strong>
                    </div>
                </>
            ) : (
                <Empty>Les frais s’afficheront ici dès que le service financier les aura affectés à votre inscription.</Empty>
            )}
        </section>
    );
}

export default function StudentFinance(props: PortalProps) {
    const { academic, balance, finance_details: details, finance_schedule: schedule = [], adjustments = [] } = props;
    const feesUrl = studentHref('fees', academic.id);
    const history = details?.history_url ?? studentHref('transactions', academic.id);
    const receipts = details?.receipts_url ?? `${history}&view=receipts`;
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

    const covered = Math.max(0, balance.due_cents - balance.balance_cents);
    const balanceStatus = balance.financial_clearance_status === 'partial' && covered === 0 ? 'unpaid' : balance.financial_clearance_status;
    const state = balanceStates[balanceStatus] ?? balanceStates.unassessed;
    const percent = balance.due_cents > 0 ? (balance.balance_cents === 0 ? 100 : Math.min(99, Math.round((covered / balance.due_cents) * 100))) : 0;
    const progressVisible = balance.assessed && balance.due_cents > 0;
    const pending = balance.pending_cents > 0;
    const recent = details?.recent_payments ?? [];
    const hasReceipt = Boolean(details?.receipt_payments.length);
    const actions = [
        { label: 'Détails des frais', note: 'Frais affectés à votre inscription', icon: ListChecks, hash: '#finance-fees' },
        { label: 'Échéancier de paiement', note: 'Dates et montants restants', icon: CalendarDays, hash: '#finance-schedule' },
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
                        <h2 id="finance-balance">Solde à payer</h2>
                        <Status state={state} />
                    </div>
                    <p className="sf-balance" aria-live="polite">
                        {balance.assessed ? money(balance.balance_cents, balance.currency) : 'À établir'}
                    </p>
                    <p className="sf-hero-note">
                        {balance.assessed ? 'Situation financière de votre inscription' : 'Le service financier n’a pas encore affecté vos frais.'}
                    </p>
                    <PaymentGuide academic={academic.id} />
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
                </section>
            </div>
            {(pending || balance.credit_cents > 0 || balance.overdue_cents > 0) && (
                <div className="sf-notices">
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
                {actions.map(({ label, note, icon: Icon, href, hash }) => {
                    const content = (
                        <>
                            <span className="sf-icon">
                                <Icon size={21} aria-hidden="true" />
                            </span>
                            <span>
                                <strong>{label}</strong>
                                <small>{note}</small>
                            </span>
                            {hash ? <ArrowDown size={17} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
                        </>
                    );
                    return href ? (
                        <Link key={label} href={href}>
                            {content}
                        </Link>
                    ) : (
                        <a key={label} href={hash}>
                            {content}
                        </a>
                    );
                })}
            </nav>
            <div className="sf-detail-grid">
                <Details obligations={details?.obligations ?? []} balance={balance} academic={academic} />
                <section id="finance-schedule" className="sf-panel" aria-label="Échéancier de paiement">
                    <PanelHeading title="Échéancier de paiement" description="Dates et soldes par échéance" icon={CalendarDays} />
                    {schedule.length ? (
                        <ul className="sf-list">
                            {schedule.map((line) => (
                                <FeeLine key={line.id} line={line} showScheduled currency={balance.currency} />
                            ))}
                        </ul>
                    ) : (
                        <Empty>Aucune échéance enregistrée pour cette inscription.</Empty>
                    )}
                </section>
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

import { labels, money, type Balance, type FinanceDueLine, type FinanceObligation } from '@/components/student/types';
import { formatDate } from '@/lib/studentEnrollment';
import { ArrowDownRight, CalendarDays, CircleAlert, CircleCheck, Coins, HandCoins, Landmark, ListChecks, ReceiptText } from 'lucide-react';
import '../../../../css/dashboard/finance-account-overview.css';

export type AccountStatement = {
    balance: Balance;
    kinds: Record<string, Balance>;
    schedules: Record<string, FinanceDueLine[]>;
    obligations: FinanceObligation[];
    kind_titles: Record<string, string>;
};

type PaymentAction = (kind: string, amountCents: number) => void;

const statuses: Record<FinanceDueLine['status'], string> = {
    paid: 'Soldée',
    exempted: 'Exonérée',
    overdue: 'En retard',
    partial: 'Partiellement couverte',
    upcoming: 'À régler',
};

function dueOrder(a: FinanceDueLine, b: FinanceDueLine) {
    const overdue = Number(b.status === 'overdue') - Number(a.status === 'overdue');
    return overdue || (a.due_at ?? '9999-12-31').localeCompare(b.due_at ?? '9999-12-31');
}

function dateLabel({ due_at: date, kind }: FinanceDueLine) {
    return date ? formatDate(date) : kind === 'tuition' ? 'Échéance non fixée' : 'Sans date limite';
}

function FinancialSummary({ balance, next }: { balance: Balance; next: FinanceDueLine | undefined }) {
    const { currency } = balance;
    const covered = balance.due_cents - balance.balance_cents;
    const overview = [
        { title: 'Total facturé', value: balance.total_cents, icon: Landmark },
        { title: 'Aides déduites', value: balance.waived_cents, icon: HandCoins },
        { title: 'Versements confirmés', value: balance.paid_cents, icon: CircleCheck },
        { title: 'Versements en vérification', value: balance.pending_cents, icon: ReceiptText },
    ];

    return (
        <>
            <div className="finance-summary-grid">
                <article className="finance-summary-balance">
                    <Coins className="finance-summary-mark" size={150} strokeWidth={0.75} aria-hidden="true" />
                    <div className="finance-summary-kicker">
                        <h2>Reste à payer</h2>
                        {balance.assessed && <span>{labels[balance.financial_clearance_status] ?? 'Compte facturé'}</span>}
                    </div>
                    <p className="finance-summary-amount">{balance.assessed ? money(balance.balance_cents, currency) : 'À établir'}</p>
                    {balance.assessed ? (
                        <>
                            <p>Sur {money(balance.due_cents, currency)} à régler après les aides</p>
                            {balance.due_cents > 0 && (
                                <div className="finance-coverage">
                                    <progress aria-label="Frais couverts" max={balance.due_cents} value={covered} />
                                    <span>{money(covered, currency)} couverts</span>
                                </div>
                            )}
                        </>
                    ) : (
                        <p>Les tranches et le solde apparaissent une fois les frais établis pour cette inscription.</p>
                    )}
                </article>
                <article className="finance-summary-next" data-overdue={next?.status === 'overdue'}>
                    <span className="finance-summary-next-icon">
                        {next?.status === 'overdue' ? (
                            <CircleAlert size={24} aria-hidden="true" />
                        ) : balance.assessed && !next ? (
                            <CircleCheck size={24} aria-hidden="true" />
                        ) : (
                            <CalendarDays size={24} aria-hidden="true" />
                        )}
                    </span>
                    <div>
                        <h2>
                            {next?.status === 'overdue'
                                ? 'Échéance en retard'
                                : next?.due_at || !next
                                  ? 'Prochaine échéance'
                                  : 'Prochain montant à régler'}
                        </h2>
                        {next ? (
                            <>
                                <p className="finance-next-amount">{money(next.remaining_cents, next.currency)}</p>
                                <p>{next.title}</p>
                                <p>{dateLabel(next)}</p>
                                {balance.overdue_cents > next.remaining_cents && (
                                    <p className="finance-next-overdue">Total en retard · {money(balance.overdue_cents, currency)}</p>
                                )}
                            </>
                        ) : (
                            <p className="finance-next-empty">
                                {balance.assessed ? 'Toutes les échéances sont couvertes.' : 'Les échéances s’afficheront après la facturation.'}
                            </p>
                        )}
                    </div>
                </article>
            </div>
            <dl className="finance-summary-metrics">
                {overview.map(({ title, value, icon: Icon }) => (
                    <div key={title}>
                        <dt>
                            <Icon size={17} aria-hidden="true" /> {title}
                        </dt>
                        <dd>{money(value, currency)}</dd>
                    </div>
                ))}
            </dl>
            {balance.credit_cents > 0 && (
                <p className="finance-summary-credit">
                    Crédit ou versements à affecter <strong>{money(balance.credit_cents, currency)}</strong>
                </p>
            )}
        </>
    );
}

function InstallmentRow({
    line,
    obligation,
    onRecordPayment,
}: {
    line: FinanceDueLine;
    obligation?: FinanceObligation;
    onRecordPayment?: PaymentAction;
}) {
    const waived = obligation?.waived_cents ?? 0;
    const paid = obligation?.paid_cents ?? line.amount_cents - line.remaining_cents;
    return (
        <li className="finance-installment" data-status={line.status}>
            <div className="finance-installment-heading">
                <div>
                    <h4>{line.title}</h4>
                    <p>{obligation?.rescheduled ? 'Date remplacée par l’échéancier approuvé' : dateLabel(line)}</p>
                </div>
                <span className="finance-installment-status">{statuses[line.status]}</span>
            </div>
            <dl className="finance-installment-amounts">
                <div>
                    <dt>Montant prévu</dt>
                    <dd>{money(line.amount_cents, line.currency)}</dd>
                </div>
                {waived > 0 && (
                    <>
                        <div>
                            <dt>Aide déduite</dt>
                            <dd>{money(waived, line.currency)}</dd>
                        </div>
                        <div>
                            <dt>Dû après aide</dt>
                            <dd>{money(line.amount_cents - waived, line.currency)}</dd>
                        </div>
                    </>
                )}
                <div>
                    <dt>Réglé</dt>
                    <dd>{money(paid, line.currency)}</dd>
                </div>
                <div className="finance-installment-remaining">
                    <dt>Reste à payer</dt>
                    <dd>{money(line.remaining_cents, line.currency)}</dd>
                </div>
            </dl>
            {onRecordPayment && (
                <button
                    className="finance-installment-payment"
                    type="button"
                    onClick={() => onRecordPayment(line.kind, line.remaining_cents)}
                    aria-label={`Saisir un versement pour ${line.kind_title ?? line.title}`}
                >
                    Saisir un versement <ArrowDownRight size={16} aria-hidden="true" />
                </button>
            )}
        </li>
    );
}

export default function FinanceAccountOverview({ statement, onRecordPayment }: { statement: AccountStatement; onRecordPayment: PaymentAction }) {
    const { balance, kinds, obligations, schedules, kind_titles: titles } = statement;
    const originalRows = new Map(obligations.map((row) => [row.id, row]));
    const groups = Object.entries(schedules)
        .filter(([, rows]) => rows.length > 0)
        .sort(([a], [b]) => Number(b === 'tuition') - Number(a === 'tuition'));
    const next = groups
        .flatMap(([, rows]) => rows)
        .filter((row) => row.remaining_cents > 0)
        .sort(dueOrder)[0];
    return (
        <div className="finance-account-overview" id="finance-summary">
            <FinancialSummary balance={balance} next={next} />
            <section id="echeances" className="finance-installments" aria-labelledby="finance-installments-title">
                <div className="finance-installments-heading">
                    <span>
                        <ListChecks size={23} aria-hidden="true" />
                    </span>
                    <div>
                        <h2 id="finance-installments-title">Échéancier détaillé</h2>
                        {next && <p>Un versement couvre d’abord les échéances dues les plus anciennes des frais sélectionnés.</p>}
                    </div>
                </div>
                {groups.length === 0 ? (
                    <p className="finance-installments-empty">Aucun frais n’a encore été facturé pour cette inscription.</p>
                ) : (
                    groups.map(([kind, rows]) => {
                        const firstOutstanding = rows.find((row) => row.remaining_cents > 0);
                        const rescheduled = rows.some((row) => typeof row.id === 'string');
                        const original = rescheduled ? obligations.filter((row) => row.kind === kind) : [];
                        return (
                            <section key={kind} className="finance-installment-group" aria-label={titles[kind] ?? rows[0].title}>
                                <div className="finance-installment-group-title">
                                    <div>
                                        <h3>{titles[kind] ?? rows[0].title}</h3>
                                        {rescheduled && <p>Échéancier réaménagé</p>}
                                    </div>
                                    {kinds[kind] && <span>Reste {money(kinds[kind].balance_cents, kinds[kind].currency)}</span>}
                                </div>
                                <ol className="finance-installment-list">
                                    {rows.map((line, index) => (
                                        <InstallmentRow
                                            key={line.id}
                                            line={rescheduled ? { ...line, title: `Échéance approuvée ${index + 1}` } : line}
                                            obligation={typeof line.id === 'number' ? originalRows.get(line.id) : undefined}
                                            onRecordPayment={line.id === firstOutstanding?.id ? onRecordPayment : undefined}
                                        />
                                    ))}
                                </ol>
                                {original.length > 0 && (
                                    <details className="finance-installment-original">
                                        <summary>Voir les tranches facturées à l’origine</summary>
                                        <ol className="finance-installment-list">
                                            {original.map((line) => (
                                                <InstallmentRow key={line.id} line={line} obligation={line} />
                                            ))}
                                        </ol>
                                    </details>
                                )}
                            </section>
                        );
                    })
                )}
            </section>
        </div>
    );
}

import { formatDate } from '@/lib/studentEnrollment';
import { money, type FirstInstallment } from './types';

export default function FirstInstallmentDetails({ installment }: { installment: FirstInstallment }) {
    if (installment.status === 'absent') {
        return <p>Le service financier doit encore établir la première tranche.</p>;
    }
    if (installment.status === 'invalid') {
        return <p>Le service financier doit vérifier le barème de la première tranche.</p>;
    }

    const amount = (cents: number | null) => (cents === null ? '—' : money(cents, installment.currency));

    return (
        <>
            {installment.due_at && (
                <p>
                    Date limite <time dateTime={installment.due_at}>{formatDate(installment.due_at)}</time>
                </p>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                <div>
                    <dt className="text-sm">Montant attendu</dt>
                    <dd className="font-semibold">{amount(installment.amount_cents)}</dd>
                </div>
                <div>
                    <dt className="text-sm">Versements validés sur cette tranche</dt>
                    <dd className="font-semibold">{amount(installment.paid_cents)}</dd>
                </div>
                <div>
                    <dt className="text-sm">Remises et aides approuvées</dt>
                    <dd className="font-semibold">{amount(installment.waived_cents)}</dd>
                </div>
                <div>
                    <dt className="text-sm">Reste dû sur cette tranche</dt>
                    <dd className="font-semibold">{amount(installment.remaining_cents)}</dd>
                </div>
            </dl>
        </>
    );
}

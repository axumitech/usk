import { money, type StudentPaymentProof } from './types';

const events = {
    proof_submitted: 'Justificatif déposé',
    proof_accepted: 'Justificatif accepté',
    proof_rejected: 'Justificatif refusé',
    payment_recorded: 'Versement enregistré',
    payment_confirmed: 'Versement confirmé',
    payment_cancelled: 'Versement annulé',
    refund_executed: 'Remboursement exécuté',
};
const accountingLabels = {
    pending: 'Versement à confirmer',
    confirmed: 'Versement confirmé',
    cancelled: 'Versement annulé',
    refunded: 'Versement remboursé',
};
const dateAndTime = new Intl.DateTimeFormat('fr-CD', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Kinshasa' });

export function paymentProofStatus(proof: StudentPaymentProof & { payment_id?: number | null }) {
    if (proof.proof_status) return proof.proof_status;
    if (proof.status === 'confirmed' || (proof.status === 'pending' && proof.payment_id)) return 'accepted';
    return proof.status;
}

export function proofPaymentStatus(proof: StudentPaymentProof & { payment_id?: number | null }) {
    if (proof.payment_status !== undefined) return proof.payment_status;
    if (proof.status === 'confirmed') return 'confirmed';
    if (proof.status === 'pending' && proof.payment_id) return 'pending';
    return null;
}

export function proofPaymentLabel(proof: StudentPaymentProof, status: NonNullable<StudentPaymentProof['payment_status']>) {
    if (status === 'refunded' && !proof.history?.some(({ event }) => event === 'refund_executed')) return 'Contrepassation historique';
    return accountingLabels[status];
}

export default function PaymentProofHistory({ proof }: { proof: StudentPaymentProof }) {
    if (!proof.history || proof.history.length <= 1) return null;

    return (
        <details>
            <summary>Historique des opérations</summary>
            <ol>
                {proof.history.map(({ event, at, amount_cents }, index) => (
                    <li key={`${event}-${at}-${index}`}>
                        {events[event]}
                        {amount_cents !== undefined && ` · ${money(amount_cents, proof.currency)}`}
                        {at && (
                            <>
                                {' · '}
                                <time dateTime={at}>{dateAndTime.format(new Date(at))}</time>
                            </>
                        )}
                    </li>
                ))}
            </ol>
        </details>
    );
}

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
    const activation = installment.activation;

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
            {activation && (
                <>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                        <div>
                            <dt className="text-sm">Seuil d’activation initiale</dt>
                            <dd className="font-semibold">{activation.percentage === null ? 'À configurer' : `${activation.percentage} %`}</dd>
                        </div>
                        <div>
                            <dt className="text-sm">Montant validé nécessaire pour l’activation</dt>
                            <dd className="font-semibold">{amount(activation.required_cents)}</dd>
                        </div>
                        <div>
                            <dt className="text-sm">Reste à valider pour l’activation</dt>
                            <dd className="font-semibold">{amount(activation.remaining_cents)}</dd>
                        </div>
                    </dl>
                    <p>Le seuil tient compte des aides approuvées. Seuls les versements validés et affectés à cette tranche comptent pour l’activation.</p>
                </>
            )}
        </>
    );
}

export function EnrollmentActivationStatus({
    installment,
    status,
    admitted = false,
}: {
    installment: FirstInstallment;
    status: string;
    admitted?: boolean;
}) {
    const activation = installment.activation;
    if (!activation?.automatic) return admitted ? <p>Admission acceptée.</p> : null;

    return (
        <>
            {admitted && <p>Admission acceptée.</p>}
            {status === 'confirmed' ? (
                <p>Inscription confirmée. Le solde financier restant demeure dû selon votre échéancier.</p>
            ) : status === 'pending_confirmation' ? (
                <>
                    <p>Activation initiale en attente.</p>
                    {activation.blocker ? (
                        <>
                            <p>{activation.blocker}</p>
                            <p>
                                {activation.action_required || (installment.status === 'absent' || installment.status === 'invalid' || activation.percentage === null
                                    ? 'Contactez le service financier pour régulariser cette condition.'
                                    : (activation.remaining_cents ?? 0) > 0
                                      ? 'Faites vérifier vos versements et leur affectation à la première tranche par le service financier.'
                                      : 'Contactez le service des inscriptions ou le service financier pour régulariser votre dossier.')}
                            </p>
                        </>
                    ) : (
                        <p>Le seuil est atteint. La confirmation automatique est en cours de vérification.</p>
                    )}
                </>
            ) : null}
        </>
    );
}

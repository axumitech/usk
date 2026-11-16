@php
    $state = $receipt['state'];
    $statusLabel = match ($state) {
        'paid' => 'Payé',
        'partially_refunded' => 'Partiellement remboursé',
        'refunded' => 'Remboursé',
        default => 'Reçu invalidé',
    };
    $currency = $receipt['currency'];
    $formatAmount = static fn (int $cents): string => number_format($cents / 100, 2, ',', "\u{202F}");
@endphp
<!doctype html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <meta name="referrer" content="no-referrer">
    <title>Reçu de paiement · {{ $receipt['reference'] }}</title>
    @include('student.receipt-styles')
</head>
<body>
    <div class="receipt-layout">
        <nav class="receipt-toolbar" aria-label="Actions du reçu">
            <a href="{{ $backUrl }}"><span aria-hidden="true">←</span> Retour aux paiements</a>
            <button type="button" onclick="window.print()">Imprimer / Enregistrer en PDF</button>
        </nav>

        <main class="receipt-sheet" data-state="{{ $state }}">
            <header class="receipt-masthead">
                <div class="receipt-identity">
                    <img src="{{ asset('assets/usk/logo.png') }}" width="72" height="72" alt="">
                    <div>
                        <strong>{{ $receipt['institution'] }}</strong>
                        <p>Comptabilité universitaire</p>
                    </div>
                </div>
                <div class="receipt-reference">
                    <span>Référence de paiement</span>
                    <strong>{{ $receipt['reference'] }}</strong>
                </div>
            </header>

            <div class="receipt-heading">
                <div>
                    <h1>Reçu de paiement</h1>
                    <p>{{ $receipt['kind_title'] }}</p>
                </div>
                <strong class="receipt-status">
                    <span class="receipt-status-mark" aria-hidden="true">{{ $state === 'paid' ? '' : '!' }}</span>
                    {{ $statusLabel }}
                </strong>
            </div>

            <section class="receipt-payment" aria-label="Versement">
                <div class="receipt-total">
                    <span>{{ $state === 'paid' ? 'Montant payé' : 'Montant du versement initial' }}</span>
                    <p><strong>{{ $formatAmount($receipt['amount_cents']) }}</strong> <span>{{ $currency }}</span></p>
                </div>
                <dl class="receipt-payment-meta">
                    <div>
                        <dt>Mode de paiement</dt>
                        <dd>{{ $receipt['method'] }}</dd>
                    </div>
                    <div>
                        <dt>Confirmation comptable · Kinshasa</dt>
                        <dd>{{ $receipt['confirmed_at'] }}</dd>
                    </div>
                </dl>
            </section>

            @if ($receipt['refunded_cents'] > 0)
                <dl class="receipt-refund">
                    <div>
                        <dt>Remboursement exécuté</dt>
                        <dd>{{ $formatAmount($receipt['refunded_cents']) }} {{ $currency }}</dd>
                    </div>
                    @if ($state !== 'invalid')
                        <div>
                            <dt>Montant net après remboursement</dt>
                            <dd>{{ $formatAmount($receipt['net_cents']) }} {{ $currency }}</dd>
                        </div>
                    @endif
                </dl>
            @endif

            @if ($state === 'invalid')
                <p class="receipt-warning">L’écriture a été annulée ou contrepassée.</p>
            @endif

            <div class="receipt-details">
                <section aria-labelledby="receipt-student">
                    <h2 id="receipt-student">Étudiant</h2>
                    <dl>
                        <div>
                            <dt>Nom complet</dt>
                            <dd>{{ $receipt['name'] }}</dd>
                        </div>
                        <div>
                            <dt>Matricule</dt>
                            <dd>{{ $receipt['matricule'] }}</dd>
                        </div>
                    </dl>
                </section>
                <section aria-labelledby="receipt-enrollment">
                    <h2 id="receipt-enrollment">Inscription</h2>
                    <dl>
                        <div>
                            <dt>Faculté et niveau</dt>
                            <dd>{{ $receipt['faculty'] }} · {{ $receipt['level'] }}</dd>
                        </div>
                        <div>
                            <dt>Année académique</dt>
                            <dd>{{ $receipt['year'] }}</dd>
                        </div>
                    </dl>
                </section>
            </div>

            <footer>
                <section class="receipt-verification" aria-labelledby="receipt-verify">
                    <div>
                        <h2 id="receipt-verify">Vérification du reçu</h2>
                        <p>Scannez le QR code pour consulter l’état de ce reçu dans le registre universitaire.</p>
                        <a href="{{ $receipt['verification_url'] }}" rel="noreferrer">Vérifier en ligne <span aria-hidden="true">↗</span></a>
                        <dl>
                            <dt>Identifiant de vérification</dt>
                            <dd><code>{{ $receipt['uuid'] }}</code></dd>
                        </dl>
                    </div>
                    <img class="receipt-qr" src="{{ $receipt['qr_image'] }}" width="128" height="128" alt="QR code de vérification du reçu">
                </section>
                <div class="receipt-footer-note">
                    <p>Ce reçu atteste uniquement du versement référencé ci-dessus.</p>
                    <span>Kinshasa · RDC</span>
                </div>
            </footer>
        </main>
    </div>
</body>
</html>

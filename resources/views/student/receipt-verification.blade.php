@php
    $states = [
        'valid' => ['label' => 'Valide', 'mark' => '✓', 'description' => 'Le versement est confirmé dans le registre comptable.'],
        'partially_refunded' => ['label' => 'Partiellement remboursé', 'mark' => '!', 'description' => 'Un remboursement partiel a été enregistré pour ce versement.'],
        'invalid' => ['label' => 'Invalidé', 'mark' => '×', 'description' => 'Ce reçu a été invalidé dans le registre comptable.'],
    ];
    $status = $states[$verification['state']] ?? $states['invalid'];
@endphp
<!doctype html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <meta name="referrer" content="no-referrer">
    <title>Vérification du reçu · Université Simon Kimbangu</title>
    <style>
        *, *::before, *::after { box-sizing: border-box; }

        body {
            margin: 0;
            padding: clamp(.9rem, 5vw, 3rem);
            background: #f6f4eb;
            color: #18342c;
            font: 1rem/1.55 system-ui, sans-serif;
        }

        main {
            width: min(100%, 35rem);
            margin: clamp(0rem, 4vh, 2rem) auto;
            overflow: hidden;
            border: 1px solid #dddeda;
            border-radius: 1.15rem;
            background: #fff;
            box-shadow: 0 16px 50px #10433412;
        }

        .issuer {
            display: flex;
            align-items: center;
            gap: .85rem;
            padding: 1.1rem clamp(1rem, 5vw, 2rem);
            background: #104334;
            color: #fff;
        }

        .issuer img {
            flex: 0 0 auto;
            width: 3.1rem;
            height: 3.1rem;
            padding: .22rem;
            border-radius: .6rem;
            background: #fff;
            object-fit: contain;
        }

        .issuer strong { display: block; line-height: 1.3; }
        .issuer span { color: #e1efe7; font-size: .83rem; }
        .content { padding: clamp(1rem, 5vw, 2rem); }

        h1 {
            margin: 0 0 1rem;
            font-size: clamp(1.48rem, 5.8vw, 2rem);
            letter-spacing: -.035em;
            line-height: 1.18;
        }

        .status {
            --status-ink: #215b43;
            --status-bg: #eaf4ed;
            --status-line: #c9e3d2;
            display: flex;
            align-items: flex-start;
            gap: .75rem;
            padding: .85rem;
            border: 1px solid var(--status-line);
            border-radius: .75rem;
            background: var(--status-bg);
            color: var(--status-ink);
        }

        .status[data-state='partially_refunded'] {
            --status-ink: #6f460a;
            --status-bg: #faf0dc;
            --status-line: #efd6a6;
        }

        .status[data-state='invalid'] {
            --status-ink: #8b3834;
            --status-bg: #faeae9;
            --status-line: #edcdca;
        }

        .status-mark {
            display: grid;
            flex: 0 0 1.9rem;
            height: 1.9rem;
            place-items: center;
            border: 1px solid currentColor;
            border-radius: 50%;
            font-size: 1.12rem;
            font-weight: 720;
            line-height: 1;
        }

        .status strong { display: block; }
        .status p { margin: .15rem 0 0; font-size: .88rem; }
        dl { margin: 1rem 0; }
        dl > div { padding: .72rem 0; border-bottom: 1px solid #e4e7e1; }
        dt { color: #526961; font-size: .81rem; font-weight: 660; }
        dd { margin: .17rem 0 0; font-weight: 620; overflow-wrap: anywhere; }
        .reference { font: 500 .84rem/1.5 ui-monospace, monospace; }
        .note { margin: 0; color: #526961; font-size: .86rem; }
    </style>
</head>
<body>
<main>
    <header class="issuer">
        <img src="/assets/usk/logo.png" width="50" height="50" alt="">
        <div>
            <strong>Université Simon Kimbangu</strong>
            <span>Service des finances</span>
        </div>
    </header>
    <div class="content">
        <h1>Vérification du reçu</h1>
        <div class="status" data-state="{{ $verification['state'] }}">
            <span class="status-mark" aria-hidden="true">{{ $status['mark'] }}</span>
            <div>
                <strong>{{ $status['label'] }}</strong>
                <p>{{ $status['description'] }}</p>
            </div>
        </div>
        <dl>
            <div>
                <dt>Identifiant du reçu</dt>
                <dd class="reference">{{ $verification['receipt'] }}</dd>
            </div>
            <div>
                <dt>Date d’émission</dt>
                <dd><time datetime="{{ $verification['issued_at'] }}">{{ \Illuminate\Support\Carbon::parse($verification['issued_at'])->format('d/m/Y') }}</time></dd>
            </div>
        </dl>
        <p class="note">Comparez cet identifiant à celui du reçu présenté.</p>
    </div>
</main>
</body>
</html>

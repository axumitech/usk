<style>
    @font-face {
        font-family: 'DM Sans';
        src: url('{{ asset('assets/fonts/dm-sans-latin-400-normal.woff2') }}') format('woff2');
        font-weight: 400;
        font-display: swap;
    }

    @font-face {
        font-family: 'DM Sans';
        src: url('{{ asset('assets/fonts/dm-sans-latin-700-normal.woff2') }}') format('woff2');
        font-weight: 700;
        font-display: swap;
    }

    @font-face {
        font-family: 'Libre Caslon Display';
        src: url('{{ asset('assets/fonts/libre-caslon-display-latin-400-normal.woff2') }}') format('woff2');
        font-weight: 400;
        font-display: swap;
    }

    :root {
        color-scheme: light;
        --ink: #1a352b;
        --muted: #4e6459;
        --forest: #164937;
        --line: #dbe5da;
        --canvas: #f4f4eb;
        --status-ink: #15533c;
        --status-background: #e1f1e5;
        --status-line: #a9cdb4;
    }

    *,
    *::before,
    *::after {
        box-sizing: border-box;
    }

    body {
        margin: 0;
        background: radial-gradient(ellipse at 50% 0%, #e8efe0, transparent 36rem), var(--canvas);
        color: var(--ink);
        font: 15px/1.48 'DM Sans', system-ui, sans-serif;
    }

    h1, h2, p, dl, dd {
        margin: 0;
    }

    .receipt-layout {
        width: min(100% - 32px, 820px);
        margin: 22px auto 38px;
    }

    .receipt-toolbar {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        align-items: center;
        gap: 9px 16px;
        margin-bottom: 13px;
    }

    .receipt-toolbar a,
    .receipt-toolbar button {
        display: inline-flex;
        min-height: 41px;
        align-items: center;
        gap: 7px;
        padding: 8px 13px;
        border: 1px solid #bed0c2;
        border-radius: 8px;
        color: var(--forest);
        background: #fffef8;
        font: 700 0.82rem/1.25 'DM Sans', system-ui, sans-serif;
        text-decoration: none;
    }

    .receipt-toolbar button {
        border-color: var(--forest);
        background: var(--forest);
        color: #fff;
        cursor: pointer;
    }

    .receipt-toolbar a:hover {
        background: #e8f1e5;
    }

    .receipt-toolbar button:hover {
        background: #0e3729;
    }

    :is(a, button):focus-visible {
        outline: 2px solid var(--forest);
        outline-offset: 3px;
    }

    .receipt-sheet {
        min-width: 0;
        padding: clamp(22px, 4.6vw, 44px);
        border: 1px solid #d3dfd0;
        border-top: 5px solid var(--forest);
        border-radius: 13px;
        background: #fff;
        box-shadow: 0 15px 42px #163a2c14;
    }

    .receipt-sheet[data-state='partially_refunded'] {
        --status-ink: #704610;
        --status-background: #f8ecd4;
        --status-line: #dec18b;
    }

    .receipt-sheet:is([data-state='refunded'], [data-state='invalid']) {
        --status-ink: #822f33;
        --status-background: #f9ebea;
        --status-line: #d9aeae;
    }

    .receipt-masthead {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        align-items: center;
        gap: 18px 26px;
        padding-bottom: 20px;
        border-bottom: 1px solid var(--line);
    }

    .receipt-identity {
        display: flex;
        flex: 1 1 245px;
        min-width: 0;
        align-items: center;
        gap: 13px;
    }

    .receipt-identity img {
        width: 64px;
        height: 64px;
        flex: none;
        object-fit: contain;
    }

    .receipt-identity strong {
        display: block;
        color: var(--forest);
        font-size: 1.15rem;
        line-height: 1.2;
        overflow-wrap: anywhere;
    }

    .receipt-identity p {
        margin-top: 4px;
        color: var(--muted);
        font-size: 0.86rem;
    }

    .receipt-reference {
        max-width: 100%;
        min-width: 0;
        padding: 7px 0 7px 16px;
        border-inline-start: 1px solid var(--line);
        text-align: start;
    }

    .receipt-reference span,
    dt {
        display: block;
        color: var(--muted);
        font-size: 0.77rem;
    }

    .receipt-reference strong {
        display: block;
        margin-top: 4px;
        font-size: 0.92rem;
        font-variant-numeric: tabular-nums;
        overflow-wrap: anywhere;
    }

    .receipt-heading {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 13px 20px;
        margin: 24px 0 19px;
    }

    .receipt-heading h1 {
        font: 400 clamp(2.3rem, 5.5vw, 3.7rem)/0.98 'Libre Caslon Display', Georgia, serif;
        letter-spacing: -0.025em;
    }

    .receipt-heading p {
        margin-top: 8px;
        color: var(--muted);
        font-size: 0.95rem;
        font-weight: 700;
        overflow-wrap: anywhere;
    }

    .receipt-status {
        display: inline-flex;
        width: fit-content;
        min-height: 36px;
        align-items: center;
        gap: 7px;
        padding: 5px 12px 5px 8px;
        border: 1px solid var(--status-line);
        border-radius: 999px;
        background: var(--status-background);
        color: var(--status-ink);
        font-size: 0.88rem;
        line-height: 1.25;
    }

    .receipt-status-mark {
        display: grid;
        width: 20px;
        height: 20px;
        flex: none;
        place-items: center;
        border: 1px solid currentColor;
        border-radius: 50%;
        font-size: 0.77rem;
    }

    [data-state='paid'] .receipt-status-mark::before {
        width: 8px;
        height: 5px;
        margin-top: -2px;
        transform: rotate(-45deg);
        border-bottom: 2px solid currentColor;
        border-left: 2px solid currentColor;
        content: '';
    }

    .receipt-payment {
        display: grid;
        grid-template-columns: minmax(0, 1.28fr) minmax(0, 1fr);
        align-items: center;
        gap: 14px 22px;
        padding: 17px 22px;
        border: 1px solid #cfe0d2;
        border-radius: 12px;
        background: linear-gradient(111deg, #eaf3e9, #f7faf4);
    }

    [data-state]:not([data-state='paid']) .receipt-payment {
        border-color: var(--line);
        background: #f7f8f4;
    }

    .receipt-total > span {
        color: var(--forest);
        font-size: 0.86rem;
        font-weight: 700;
    }

    .receipt-total p {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 3px 9px;
        margin-top: 3px;
        color: var(--forest);
    }

    .receipt-total strong {
        font-size: clamp(2rem, 5.5vw, 3.15rem);
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.065em;
        line-height: 1.09;
        overflow-wrap: anywhere;
    }

    .receipt-total p span {
        font-size: 1rem;
        font-weight: 700;
    }

    .receipt-payment-meta {
        display: grid;
        gap: 8px;
        padding-inline-start: 18px;
        border-inline-start: 1px solid #cfe0d2;
    }

    dd {
        margin-top: 2px;
        font-size: 0.92rem;
        font-weight: 700;
        overflow-wrap: anywhere;
    }

    .receipt-refund,
    .receipt-warning {
        margin-top: 11px;
        padding: 11px 14px;
        border: 1px solid var(--status-line);
        border-radius: 8px;
        background: var(--status-background);
        color: var(--status-ink);
    }

    .receipt-refund {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 27px;
    }

    .receipt-refund dt {
        color: inherit;
    }

    .receipt-warning {
        font-size: 0.85rem;
    }

    .receipt-details {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin: 17px 0 19px;
    }

    .receipt-details section {
        min-width: 0;
        padding: 14px 16px;
        border: 1px solid var(--line);
        border-radius: 9px;
    }

    .receipt-sheet h2 {
        color: var(--forest);
        font-size: 0.98rem;
        line-height: 1.25;
    }

    .receipt-details dl {
        display: grid;
        gap: 7px;
        margin-top: 9px;
    }

    .receipt-verification {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 9px 22px;
        padding: 13px 16px;
        border: 1px dashed #b6cbb9;
        border-radius: 10px;
        background: #fafcf7;
    }

    .receipt-verification p {
        margin-top: 4px;
        color: var(--muted);
        font-size: 0.85rem;
    }

    .receipt-verification a {
        display: inline-flex;
        min-height: 30px;
        align-items: center;
        gap: 5px;
        color: var(--forest);
        font-size: 0.85rem;
        font-weight: 700;
        text-underline-offset: 3px;
    }

    .receipt-verification dl {
        margin-top: 3px;
    }

    .receipt-verification code {
        font: 0.76rem/1.3 ui-monospace, monospace;
    }

    .receipt-qr {
        display: block;
        width: 128px;
        height: 128px;
        background: #fff;
    }

    .receipt-footer-note {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 4px 12px;
        margin-top: 12px;
        color: var(--muted);
        font-size: 0.74rem;
    }

    @media screen and (max-width: 540px) {
        .receipt-layout {
            width: calc(100% - 20px);
            margin-top: 12px;
        }

        .receipt-sheet {
            padding: 17px;
        }

        .receipt-masthead {
            gap: 12px;
            padding-bottom: 16px;
        }

        .receipt-identity img {
            width: 52px;
            height: 52px;
        }

        .receipt-reference {
            padding: 0;
            border: 0;
        }

        .receipt-heading {
            margin-block: 19px 14px;
        }

        .receipt-payment,
        .receipt-details {
            grid-template-columns: minmax(0, 1fr);
        }

        .receipt-payment {
            padding: 14px 15px;
        }

        .receipt-payment-meta {
            padding: 10px 0 0;
            border: 0;
            border-top: 1px solid #cfe0d2;
        }

        .receipt-verification {
            gap: 8px 10px;
            padding: 11px;
        }

        .receipt-qr {
            width: 108px;
            height: 108px;
        }
    }

    @media screen and (max-width: 350px) {
        .receipt-verification {
            grid-template-columns: minmax(0, 1fr);
        }
    }

    @page {
        size: A4;
        margin: 14mm;
    }

    @media print {
        body,
        .receipt-sheet {
            background: #fff;
        }

        .receipt-layout {
            width: 100%;
            margin: 0;
        }

        .receipt-toolbar {
            display: none;
        }

        .receipt-sheet {
            padding: 6mm 0 0;
            border: 0;
            border-top: 1mm solid var(--forest);
            border-radius: 0;
            box-shadow: none;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
        }

        .receipt-heading h1 {
            font-size: 34pt;
        }

        .receipt-total strong {
            font-size: 27pt;
        }

        .receipt-qr {
            width: 34mm;
            height: 34mm;
        }

        .receipt-masthead,
        .receipt-heading,
        .receipt-payment,
        .receipt-refund,
        .receipt-details,
        .receipt-verification {
            break-inside: avoid;
        }
    }
</style>

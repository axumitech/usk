@php $pwa = request()->is('app/*'); @endphp
<!DOCTYPE html>
<html lang="{{ $pwa ? 'fr' : (isset($seo) ? $seo['lang'] : str_replace('_', '-', app()->getLocale())) }}">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1{{ $pwa ? ', viewport-fit=cover' : '' }}">
    @if($pwa) @include('pwa-head') @endif
    <link rel="icon" type="image/png" href="/assets/usk/logo.png">
    <meta name="theme-color" content="#073e32">
    <meta name="csrf-token" content="{{ csrf_token() }}">

    @if(isset($seo))
        @include('seo.head')
    @else
        <title inertia>Université Simon Kimbangu</title>
        <meta name="robots" content="noindex, nofollow, noarchive" inertia="robots">
    @endif

    @routes
    @viteReactRefresh
    @php
        $vite = app(\Illuminate\Foundation\Vite::class);
        $entry = 'resources/js/app.tsx';
        $pageEntry = "resources/js/pages/{$page['component']}.tsx";
        try {
            $assets = $vite([$entry, $pageEntry]);
        } catch (\Illuminate\Foundation\ViteException) {
            // A page can be loaded by Inertia without its own manifest entry.
            $assets = $vite([$entry]);
        }
    @endphp
    {{ $assets }}
    @if(!isset($seo)) @inertiaHead @endif
</head>

<body class="font-sans antialiased" @if($pwa) data-usk-pwa @endif>
    @if($pwa)
        <div id="usk-launch" role="status">
            <div>
                <img src="/pwa/icon-192.png" width="88" height="88" alt="">
                <strong>Université Simon Kimbangu</strong>
                <small id="usk-launch-status">Ouverture de votre espace…</small>
                <noscript><p>Activez JavaScript puis rechargez la page.</p></noscript>
            </div>
        </div>
    @endif
    @if(isset($seo))
        @php($publicSsr = app(\Inertia\Ssr\Gateway::class)->dispatch($page))
        @if($publicSsr)
            {!! str_replace('id="app"', 'id="app" data-ssr="true"', $publicSsr->body) !!}
        @else
            <div id="app" data-page="{{ json_encode($page) }}">@include('seo.fallback')</div>
        @endif
    @else
        @inertia
    @endif
</body>

</html>

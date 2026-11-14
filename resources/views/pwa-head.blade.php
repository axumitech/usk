<link rel="manifest" href="/pwa/manifest.webmanifest">
<link rel="apple-touch-icon" href="/pwa/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="USK">
<style>
    #usk-launch { position:fixed; inset:0; z-index:1000; display:grid; place-items:center; color:#073e32; background:#f1f7f4; text-align:center; font:1rem system-ui; padding:1rem; }
    html[data-usk-theme-loading] #usk-launch { background:#0d151d; color:#e9f6ef; }
    #usk-launch img { display:block; margin:0 auto 1rem; border-radius:1.35rem; }
    #usk-launch strong { display:block; font-size:1.15rem; }
    #usk-launch small { display:block; margin-top:.5rem; }
    @media (prefers-reduced-motion:no-preference) {
        #usk-launch > div { animation:usk-launch-in .28s ease-out both; }
        @keyframes usk-launch-in { from { opacity:.4; transform:translateY(5px); } }
    }
</style>
<script>
    (() => {
        let theme = 'system';
        try { theme = localStorage.getItem('usk-dashboard-theme') || 'system'; } catch {}
        if (theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.setAttribute('data-usk-theme-loading', '');
        }
        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            window.uskInstallPrompt = event;
        });
        window.addEventListener('appinstalled', () => { delete window.uskInstallPrompt; });
    })();
</script>

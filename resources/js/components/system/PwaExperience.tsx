import { router } from '@inertiajs/react';
import { Download, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import '../../../css/pwa.css';

type InstallPrompt = Event & { prompt: () => Promise<unknown> };
type PwaWindow = Window & { uskInstallPrompt?: InstallPrompt };
const displayMode = '(display-mode: standalone)';

export default function PwaExperience() {
    const [prompt, setPrompt] = useState<InstallPrompt>();
    const [standalone, setStandalone] = useState(false);
    const [offline, setOffline] = useState(false);
    const [worker, setWorker] = useState<ServiceWorker>();
    const [issue, setIssue] = useState<number>();
    const [applying, setApplying] = useState(false);
    const [apple, setApple] = useState(false);

    useEffect(() => {
        document.getElementById('usk-launch')?.remove();
        const appWindow = window as PwaWindow;
        const mode = window.matchMedia(displayMode);
        const nav = navigator as Navigator & { standalone?: boolean };
        const sync = () => {
            setPrompt(appWindow.uskInstallPrompt);
            setStandalone(mode.matches || nav.standalone === true);
            setOffline(!navigator.onLine);
        };
        const isIOS = /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
        setApple(isIOS && /Safari\//.test(nav.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(nav.userAgent));
        sync();
        for (const event of ['online', 'offline', 'beforeinstallprompt', 'appinstalled']) window.addEventListener(event, sync);
        mode.addEventListener('change', sync);

        const stopInvalid = router.on('invalid', (event) => {
            if (event.defaultPrevented) return;
            const code = event.detail.response.status;
            if (![401, 403, 419].includes(code)) return;
            event.preventDefault();
            setIssue(code);
        });
        const stopNavigate = router.on('navigate', () => setIssue(undefined));

        // Do not restore a private document snapshot from the browser's back/forward cache.
        const onPageHide = (event: PageTransitionEvent) => {
            if (event.persisted) document.body.style.visibility = 'hidden';
        };
        const onPageShow = (event: PageTransitionEvent) => {
            if (event.persisted) window.location.reload();
        };
        window.addEventListener('pagehide', onPageHide);
        window.addEventListener('pageshow', onPageShow);

        let registration: ServiceWorkerRegistration | undefined;
        let installing: ServiceWorker | null = null;
        let stopped = false;
        const syncWorker = () => {
            if (!stopped) setWorker(registration?.waiting ?? undefined);
        };
        const onUpdateFound = () => {
            installing?.removeEventListener('statechange', syncWorker);
            installing = registration?.installing ?? null;
            installing?.addEventListener('statechange', syncWorker);
            syncWorker();
        };
        const check = () => {
            if (document.visibilityState === 'visible' && navigator.onLine) void registration?.update().catch(() => {});
        };

        if ('serviceWorker' in navigator && window.isSecureContext && import.meta.env.PROD) {
            void navigator.serviceWorker
                .register('/app/sw.js', { scope: '/app/', updateViaCache: 'none' })
                .then((result) => {
                    if (stopped) return;
                    registration = result;
                    result.addEventListener('updatefound', onUpdateFound);
                    onUpdateFound();
                })
                .catch((error) => console.warn('USK : Service Worker indisponible', error));
            document.addEventListener('visibilitychange', check);
            window.addEventListener('online', check);
        }

        return () => {
            stopped = true;
            installing?.removeEventListener('statechange', syncWorker);
            registration?.removeEventListener('updatefound', onUpdateFound);
            document.removeEventListener('visibilitychange', check);
            window.removeEventListener('online', check);
            window.removeEventListener('pagehide', onPageHide);
            window.removeEventListener('pageshow', onPageShow);
            for (const event of ['online', 'offline', 'beforeinstallprompt', 'appinstalled']) window.removeEventListener(event, sync);
            mode.removeEventListener('change', sync);
            stopInvalid();
            stopNavigate();
        };
    }, []);

    async function install() {
        if (!prompt) return;
        delete (window as PwaWindow).uskInstallPrompt;
        setPrompt(undefined);
        await prompt.prompt().catch(() => {});
    }

    function update() {
        if (!worker || applying) return;
        if (!window.confirm('Le rechargement peut effacer les modifications non enregistrées sur cette page. Continuer ?')) return;
        setApplying(true);
        const onChange = () => {
            navigator.serviceWorker.removeEventListener('controllerchange', onChange);
            window.clearTimeout(timeout);
            window.location.reload();
        };
        const timeout = window.setTimeout(() => {
            navigator.serviceWorker.removeEventListener('controllerchange', onChange);
            setApplying(false);
        }, 8000);
        navigator.serviceWorker.addEventListener('controllerchange', onChange);
        worker.postMessage({ type: 'USK_ACTIVATE_UPDATE' });
    }

    return (
        <div className="usk-pwa-notices">
            {offline && <p role="status">Hors connexion. Les actions nécessitant le serveur sont indisponibles.</p>}
            {issue && (
                <div role="alert">
                    <p>
                        {issue === 403
                            ? 'Vous n’avez pas accès à cette page.'
                            : issue === 419
                              ? 'La session de ce formulaire a expiré. Copiez vos modifications avant de recharger.'
                              : 'Votre session a expiré.'}
                    </p>
                    {issue === 403 || issue === 401 ? (
                        <a
                            href={issue === 401 ? '/app/login' : '/app/'}
                            target={issue === 401 ? '_blank' : undefined}
                            rel={issue === 401 ? 'noopener' : undefined}
                        >
                            {issue === 401 ? 'Se reconnecter dans un autre onglet' : 'Retour à mon espace'}
                        </a>
                    ) : (
                        <button type="button" onClick={() => window.location.reload()}>
                            Recharger
                        </button>
                    )}
                    <button type="button" onClick={() => setIssue(undefined)}>
                        Fermer
                    </button>
                </div>
            )}
            {worker && (
                <div>
                    <p role="status">Une nouvelle version de l’application est disponible.</p>
                    <button type="button" disabled={applying || offline} onClick={update}>
                        <RefreshCw size={15} aria-hidden="true" /> {applying ? 'Mise à jour…' : 'Mettre à jour'}
                    </button>
                </div>
            )}
            {!standalone &&
                !worker &&
                !offline &&
                (prompt ? (
                    <button type="button" onClick={() => void install()}>
                        <Download size={15} aria-hidden="true" /> Installer l’application
                    </button>
                ) : (
                    apple && (
                        <details>
                            <summary>Installer l’application</summary>
                            <p>Dans Safari, ouvrez Partager, puis Sur l’écran d’accueil. Activez Ouvrir comme app web si l’option est proposée.</p>
                        </details>
                    )
                ))}
        </div>
    );
}

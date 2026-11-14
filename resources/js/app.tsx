import NavigationFeedback from '@/components/system/NavigationFeedback';
import NetworkFailureNotice from '@/components/system/NetworkFailureNotice';
import PwaExperience from '@/components/system/PwaExperience';
import '../css/app.css';

import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot, hydrateRoot } from 'react-dom/client';

const isPwa = typeof document !== 'undefined' && document.body.hasAttribute('data-usk-pwa');

const appName = 'Université Simon Kimbangu';

createInertiaApp({
    title: (title) => (title.includes(appName) ? title : `${title} — ${appName}`),
    resolve: (name) => resolvePageComponent(`./pages/${name}.tsx`, import.meta.glob('./pages/**/*.tsx')),
    setup({ el, App, props }) {
        const content = (
            <NavigationFeedback>
                <App {...props} />
                <NetworkFailureNotice />
                {isPwa && <PwaExperience />}
            </NavigationFeedback>
        );
        if (el.dataset.ssr === 'true') hydrateRoot(el, content);
        else createRoot(el).render(content);
    },
    progress: {
        color: '#24694e',
    },
}).catch((error: unknown) => {
    const status = document.getElementById('usk-launch-status');
    if (status) {
        status.textContent = 'L’application n’a pas pu démarrer. ';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.textContent = 'Réessayer';
        retry.addEventListener('click', () => window.location.reload());
        status.append(retry);
    }
    console.error(error);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const worker = await readFile(new URL('../../resources/pwa/sw.js', import.meta.url), 'utf8');
const offline = await readFile(new URL('../../public/pwa/offline.html', import.meta.url), 'utf8');

function installation(body) {
    const handlers = new Map();
    const stored = [];
    vm.runInNewContext(worker, {
        VERSION: 'recette',
        self: { addEventListener: (name, handler) => handlers.set(name, handler) },
        caches: {
            open: async () => ({
                put: async (path, response) => stored.push({ path, body: await response.text() }),
            }),
        },
        fetch: async () => new Response(body, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } }),
    });
    let installed;
    handlers.get('install')({ waitUntil: (result) => { installed = result; } });
    return { installed, stored };
}

test('Le Service Worker met en cache le document de secours', async () => {
    const { installed, stored } = installation(offline);
    await installed;
    assert.deepEqual(stored, [{ path: '/pwa/offline.html', body: offline }]);
});

test('Le Service Worker refuse une autre page HTML même si elle répond 200', async () => {
    const { installed, stored } = installation('<html><body>Accueil</body></html>');
    await assert.rejects(installed, /Offline page unavailable/);
    assert.deepEqual(stored, []);
});

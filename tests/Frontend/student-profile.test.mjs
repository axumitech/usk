import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import uploadLimits from './support/upload-limits.mjs';

const require = createRequire(import.meta.url);
async function load(component, overrides = {}) {
    const source = await readFile(new URL(`../../resources/js/components/student/${component}.tsx`, import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    });
    const module = { exports: {} };
    vm.runInNewContext(outputText, {
        module,
        exports: module.exports,
        require(name) {
            if (name === '@/lib/uploadLimits') return uploadLimits;
            if (name in overrides) return overrides[name];
            if (name.endsWith('.css')) return {};
            if (name === '@inertiajs/react') return { useForm: (data) => ({ data: data(), errors: {}, processing: false }), usePage: () => ({ props: {} }) };
            if (name === '@/lib/studentEnrollment') return { formatDate: () => '15 mai 2003' };
            if (name === '@/lib/scheduleDates') return { localDate: () => '2026-11-13' };
            if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
            return require(name);
        },
    });
    return module.exports.default;
}

const ProfileForm = await load('StudentProfileForm');

const props = {
    academic: { id: 7, matricule: 'MED0001', photo_url: '/photo-test' },
    profile: {
        values: { first_name: 'Marie', last_name: 'Test', email: 'marie@example.test', birth_date: '2003-05-15', gender: 'female' },
        provinces: ['Kinshasa', 'Kongo-Central'],
    },
    onFeedback: () => {},
};

const renderProfile = (overrides = {}) => renderToStaticMarkup(React.createElement(ProfileForm, { ...props, ...overrides }));

test('Le profil affiche les six groupes en consultation avec les valeurs renseignées', () => {
    const html = renderProfile();
    for (const label of ['Identité', 'Contact', 'Adresse et origine', 'Contact d’urgence', 'Diplôme d’accès', 'Photo de profil']) {
        assert.ok(html.includes(label));
    }
    assert.match(html, /MED0001/);
    assert.match(html, /15 mai 2003/);
    assert.match(html, /Féminin/);
    assert.match(html, /Non renseigné/);
    assert.match(html, /Modifier mes informations/);
    assert.doesNotMatch(html, /<form|<input|<select|<textarea/);
});

test('Le raccourci photo ouvre le formulaire complet et garde le matricule en lecture seule', () => {
    const html = renderProfile({
        initialEditSection: 'photo',
        profile: { ...props.profile, values: { ...props.profile.values, province: 'other', diploma_type: 'other' } },
    });
    assert.match(html, /<input[^>]*id="profile-code"[^>]*readOnly=""[^>]*value="MED0001"/);
    assert.doesNotMatch(html, /name="matricule"/);
    assert.match(html, /multipart\/form-data/);
    assert.match(html, /Enregistrer mon profil/);
    assert.match(html, /Précisez la province/);
    assert.match(html, /Précisez le diplôme/);
    assert.match(html, /Kinshasa/);
    assert.match(html, /Kongo-Central/);
    assert.match(html, /accept="image\/jpeg,image\/png,image\/webp"/);
});

test('Un raccourci vers la date de naissance ouvre le champ dans le formulaire de modification', () => {
    const html = renderProfile({ initialEditField: 'birth_date' });
    assert.match(html, /<form[^>]*aria-label="Modifier mes informations"/);
    assert.match(html, /<label for="profile-birth_date">Date de naissance<\/label>/);
    assert.match(html, /<input[^>]*id="profile-birth_date"[^>]*type="date"/);
});

const passthrough = ({ children }) => children;
const AlertBubble = await load('StudentAlertBubble', {
    '@inertiajs/react': { Link: (props) => React.createElement('a', props) },
    '@radix-ui/react-dialog': {
        Root: passthrough,
        Trigger: (props) => React.createElement('button', props),
        Portal: passthrough,
        Overlay: () => null,
        Content: (props) => React.createElement('div', props),
        Title: (props) => React.createElement('h2', props),
        Close: passthrough,
    },
    './navigation': {
        studentHref: (section, academic) => `/app/dashboard/student/${section}?academic=${academic}`,
        studentSectionAccess: () => ({ allowed: true, visible: true }),
    },
});

test('La bulle présente le nombre de champs manquants et leurs liens d’édition', () => {
    const html = renderToStaticMarkup(React.createElement(AlertBubble, {
        academic: { id: 7 },
        permissions: {},
        alerts: [],
        announcements: [],
        profile: {
            completed: 10,
            total: 12,
            missing: [
                { key: 'birth_date', label: 'Date de naissance', href: '/app/dashboard/student/profile?academic=7&view=personal&edit=birth_date' },
                { key: 'phone', label: 'Téléphone', href: '/app/dashboard/student/profile?academic=7&view=personal&edit=phone' },
            ],
        },
    }));
    assert.match(html, /data-severity="profile"/);
    assert.match(html, /2 informations à renseigner/);
    assert.match(html, /<progress value="10" max="12"/);
    assert.match(html, /edit=birth_date/);
    assert.match(html, /edit=phone/);

    const complete = renderToStaticMarkup(React.createElement(AlertBubble, {
        academic: { id: 7 }, alerts: [], announcements: [], permissions: {}, profile: { completed: 12, total: 12, missing: [] },
    }));
    assert.equal(complete, '');
});

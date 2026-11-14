import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../../resources/js/components/student/StudentProfileForm.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
});
const module = { exports: {} };
vm.runInNewContext(outputText, {
    module,
    exports: module.exports,
    require(name) {
        if (name.endsWith('.css')) return {};
        if (name === '@inertiajs/react') return { useForm: (data) => ({ data: data(), errors: {}, processing: false }) };
        if (name === '@/lib/studentEnrollment') return { formatDate: () => '15 mai 2003' };
        if (name === '@/lib/scheduleDates') return { localDate: () => '2026-11-13' };
        if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
        return require(name);
    },
});

const props = {
    academic: { id: 7, matricule: 'MED0001', photo_url: '/photo-test' },
    profile: {
        values: { first_name: 'Marie', last_name: 'Test', email: 'marie@example.test', birth_date: '2003-05-15', gender: 'female' },
        provinces: ['Kinshasa', 'Kongo-Central'],
    },
    onFeedback: () => {},
};

const renderProfile = (overrides = {}) => renderToStaticMarkup(React.createElement(module.exports.default, { ...props, ...overrides }));

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

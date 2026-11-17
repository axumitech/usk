import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../../resources/js/pages/dashboard/blog/Show.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
});
const exports = {};
const imports = {
    '@/components/layouts/Dashboard/Dashboard': { default: ({ children }) => children },
    '@/components/news/VideoPlayer': { default: () => null },
    '@/components/section/dashboard/blog/utils/gradientOptions': { gradientOptions: [] },
    '@inertiajs/react': { Head: () => null, useForm: () => ({ processing: false }) },
    './category-badge': {},
    './EditPostModal': { default: () => null },
};
vm.runInNewContext(outputText, { exports, require: (name) => imports[name] ?? require(name) });

function renderArticle(content) {
    return renderToStaticMarkup(
        React.createElement(exports.default, {
            post: { id: 1, uuid: 'article', title: 'Actualité de test', slug: 'actualite-de-test', status: 'draft', content, views: 0, likes: 0 },
            categories: [],
            galleryRevision: '',
        }),
    );
}

test('La fiche administrative affiche les balises d’un ancien article comme texte', () => {
    const markup = renderArticle('<p>Communiqué <strong>officiel</strong></p>');

    assert.ok(markup.includes('&lt;p&gt;Communiqué &lt;strong&gt;officiel&lt;/strong&gt;&lt;/p&gt;'));
    assert.ok(!markup.includes('<strong>officiel</strong>'));
});

test('La fiche administrative conserve les sauts de ligne du corps d’article', () => {
    const markup = renderArticle('Premier paragraphe\n\nSecond paragraphe');

    assert.match(markup, /class="[^"]*whitespace-pre-line[^"]*">Premier paragraphe\n\nSecond paragraphe<\/div>/);
});

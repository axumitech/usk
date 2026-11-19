/* global require, __dirname, process */
/* eslint @typescript-eslint/no-require-imports: "off" */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');

const root = path.resolve(__dirname, '../../..');
const output = path.resolve(__dirname, '../preuves/formulaires-react.json');
const methods = new Set(['post', 'put', 'patch', 'delete']);
const columns = [
    'form',
    'useForm',
    'router',
    'soumissionUseForm',
    'lienMutation',
    'api',
    'composantFormulaire',
    'champ',
    'required',
    'boutonSubmit',
    'alerte',
    'enCours',
];
const digest = crypto.createHash('sha256');

const git = (args, input) => execFileSync('git', args, { cwd: root, input, maxBuffer: 64 * 1024 * 1024 });
const revision = git(['rev-parse', '--verify', '--end-of-options', (process.argv[2] || 'HEAD') + '^{commit}'])
    .toString()
    .trim();
const tree = git(['rev-parse', revision + ':resources/js'])
    .toString()
    .trim();

function readSources() {
    const blobs = new Map();
    for (const row of git(['ls-tree', '-rz', tree]).toString('utf8').split('\0')) {
        const [info, file] = row.split('\t');
        if (!file || !/\.[cm]?[jt]sx?$/.test(file) || /\.d\.[cm]?ts$/.test(file)) continue;
        blobs.set(file, info.split(' ')[2]);
    }
    const files = [...blobs.keys()].sort();
    const contents = git(['cat-file', '--batch'], files.map((file) => blobs.get(file)).join('\n') + '\n');
    const result = new Map();
    let offset = 0;
    for (const file of files) {
        const end = contents.indexOf(10, offset);
        const [id, type, size] = contents.toString('ascii', offset, end).split(' ');
        if (id !== blobs.get(file) || type !== 'blob') throw new Error('Objet Git inattendu pour ' + file);
        const until = end + 1 + Number(size);
        result.set(file, contents.toString('utf8', end + 1, until).replace(/\r\n/g, '\n'));
        offset = until + 1;
    }
    return result;
}

function moduleFor(file) {
    const [rootName, section, child, nested] = file.split('/');
    if (rootName === 'pages') {
        if (section === 'dashboard') return 'dashboard/' + child;
        if (child) return 'public/' + section;
        const name = section.replace(/page\.[jt]sx?$/i, '').toLowerCase();
        return 'public/' + (name === 'admission' ? 'admissions' : name);
    }
    if (rootName === 'components' && section === 'section') {
        return child === 'dashboard' ? 'dashboard/' + (nested === 'enrollement' ? 'enrollments' : nested) : 'public/' + child;
    }
    return rootName + '/' + section;
}

function walk(node, visit) {
    visit(node);
    ts.forEachChild(node, (child) => walk(child, visit));
}

function inspect(file, code) {
    const tree = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
    if (tree.parseDiagnostics.length) throw new Error('Syntaxe non analysable dans ' + file);
    const counts = Object.fromEntries(columns.map((name) => [name, 0]));
    const hooks = new Set(),
        routers = new Set(),
        links = new Set(),
        forms = new Set(),
        setters = new Set(),
        clients = new Set();
    for (const node of tree.statements.filter(ts.isImportDeclaration)) {
        const pkg = node.moduleSpecifier.text;
        const clause = node.importClause;
        if (pkg === 'axios' && clause?.name) clients.add(clause.name.text);
        if (pkg !== '@inertiajs/react' || !clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
        for (const item of clause.namedBindings.elements) {
            const local = item.name.text;
            const imported = item.propertyName?.text ?? local;
            if (imported === 'useForm') hooks.add(local);
            if (imported === 'router') routers.add(local);
            if (imported === 'Link') links.add(local);
        }
    }
    walk(tree, (node) => {
        if (
            !ts.isVariableDeclaration(node) ||
            !node.initializer ||
            !ts.isCallExpression(node.initializer) ||
            !hooks.has(node.initializer.expression.getText(tree))
        )
            return;
        if (ts.isIdentifier(node.name)) forms.add(node.name.text);
        if (ts.isObjectBindingPattern(node.name)) {
            for (const item of node.name.elements)
                if (
                    methods.has(item.propertyName?.getText(tree) ?? item.name.getText(tree)) ||
                    item.propertyName?.getText(tree) === 'submit' ||
                    item.name.getText(tree) === 'submit'
                )
                    setters.add(item.name.getText(tree));
        }
    });
    walk(tree, (node) => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
            const tag = node.tagName.getText(tree);
            const attrs = Object.fromEntries(
                node.attributes.properties.filter(ts.isJsxAttribute).map((a) => [a.name.getText(tree), a.initializer?.getText(tree) ?? 'true']),
            );
            const literal = (key) => attrs[key]?.replace(/^[{'"]+|[}'"]+$/g, '').toLowerCase();
            if (tag === 'form') counts.form++;
            if (/^[A-Z].*Form$/.test(tag) || tag === 'Form' || (tag === 'AdminModal' && attrs.formId)) counts.composantFormulaire++;
            if (['input', 'select', 'textarea'].includes(tag)) {
                counts.champ++;
                if ('required' in attrs) counts.required++;
            }
            if (['input', 'button'].includes(tag) && literal('type') === 'submit') counts.boutonSubmit++;
            if (links.has(tag) && methods.has(literal('method'))) counts.lienMutation++;
            if (literal('role') === 'alert') counts.alerte++;
            if ([attrs.disabled, attrs['aria-busy'], attrs.busy].some((a) => a && /processing|submitting|busy|loading|saving/i.test(a)))
                counts.enCours++;
        }
        if (!ts.isCallExpression(node)) return;
        const callee = node.expression;
        if (ts.isIdentifier(callee)) {
            if (hooks.has(callee.text)) counts.useForm++;
            if (setters.has(callee.text)) counts.soumissionUseForm++;
            if (callee.text === 'fetch' && node.arguments[1] && ts.isObjectLiteralExpression(node.arguments[1])) {
                const method = node.arguments[1].properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(tree) === 'method');
                if (method && ts.isStringLiteralLike(method.initializer) && methods.has(method.initializer.text.toLowerCase())) counts.api++;
            }
        }
        if (!ts.isPropertyAccessExpression(callee)) return;
        const method = callee.name.text;
        const target = callee.expression.getText(tree);
        if (methods.has(method) && routers.has(target)) counts.router++;
        if (methods.has(method) && clients.has(target)) counts.api++;
        if ((methods.has(method) || method === 'submit') && forms.has(target)) counts.soumissionUseForm++;
    });
    return columns.map((name) => counts[name]);
}

const all = readSources();
const rows = [],
    groups = new Map();
const total = columns.map(() => 0);
for (const [file, code] of all) {
    digest.update(file + '\0' + code + '\0');
    const counts = inspect(file, code);
    if (!counts.some(Boolean)) continue;
    const module = moduleFor(file);
    rows.push([module, file, ...counts]);
    if (!groups.has(module)) groups.set(module, [0, ...columns.map(() => 0)]);
    const group = groups.get(module);
    group[0]++;
    counts.forEach((n, i) => {
        group[i + 1] += n;
        total[i] += n;
    });
}
const meta = {
    perimetre: 'resources/js (JS, JSX, TS, TSX, hors déclarations)',
    revisionGit: revision,
    arbreGitResourcesJs: tree,
    sha256SourcesNormaliseesLF: digest.digest('hex'),
    versionTypeScript: ts.version,
    fichiersAnalyses: all.size,
    fichiersAvecSignal: rows.length,
    prefixeLignesModules: ['module', 'nombreFichiersAvecSignal'],
    prefixeLignesFichiers: ['module', 'cheminSousResourcesJs'],
    colonnes: columns,
    totaux: total,
};
const encode = (items) => '[\n' + items.map((item) => '  ' + JSON.stringify(item)).join(',\n') + '\n]';
const modules = [...groups.keys()].sort().map((key) => [key, ...groups.get(key)]);
fs.writeFileSync(output, '{\n"metadonnees":' + JSON.stringify(meta) + ',\n"modules":' + encode(modules) + ',\n"fichiers":' + encode(rows) + '\n}\n');

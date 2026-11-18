import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../../../resources/js/lib/uploadLimits.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
});

export default await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

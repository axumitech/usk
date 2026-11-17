/* global process, require, __dirname */
/* eslint @typescript-eslint/no-require-imports: "off" */
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const r=JSON.parse(fs.readFileSync(path.join(__dirname,'.runtime.json'),'utf8'));Object.assign(process.env,r.env);
const s=cp.spawnSync(process.env.USK_RECIPE_PHP || 'C:/php-8.4.5/php.exe',[path.join(__dirname,'verify.php'),process.argv[2]||'summary',process.argv[3]||'{}'],{env:process.env,encoding:'utf8',windowsHide:true});
process.stdout.write(s.stdout);process.stderr.write(s.stderr);process.exitCode=s.status;

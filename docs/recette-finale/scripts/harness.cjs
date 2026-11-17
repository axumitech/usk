/* global module, process, require, __dirname */
/* eslint @typescript-eslint/no-require-imports: "off" */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.USK_RECIPE_PLAYWRIGHT || 'C:/Users/hp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const work = __dirname;
const runtime = JSON.parse(fs.readFileSync(path.join(work, '.runtime.json'), 'utf8').replace(/^\uFEFF/,''));
Object.assign(process.env, runtime.env);
const origin = runtime.origin;
const artifacts = process.env.USK_RECIPE_ARTIFACTS || path.dirname(work);
const fixture = JSON.parse(fs.readFileSync(path.join(work, 'fixture.json'), 'utf8').replace(/^\uFEFF/,''));
async function createHarness(moduleName) {
 const browser = await chromium.launch({headless:true,executablePath:process.env.USK_RECIPE_CHROMIUM || 'C:/Users/hp/AppData/Local/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-win64/chrome-headless-shell.exe'});
 const priorFile=path.join(work,'results',moduleName+'.json'); const records=fs.existsSync(priorFile)?JSON.parse(fs.readFileSync(priorFile,'utf8')).records.filter(row=>row.status==='VALIDÉ'):[]; const diagnostics=[]; const errors=new WeakMap();
 const newPage=async(options={})=>{
   const page=await browser.newPage({viewport:{width:1440,height:1000},timezoneId:'Africa/Kinshasa',reducedMotion:'reduce',acceptDownloads:true,...options});
   const events=[]; errors.set(page,events);
   page.on('pageerror',error=>events.push({kind:'javascript',message:error.message,url:page.url()}));
   page.on('console',msg=>{if(msg.type()==='error')diagnostics.push({kind:'console',message:msg.text(),url:page.url()});});
   page.on('response',response=>{if(response.status()>=500)events.push({kind:'http',status:response.status(),url:response.url()});});
   return page;
 };
 const login=async(page,email)=>{
   email=typeof email==='object'?email.email:(fixture.accounts[email]?.email||email);
   await page.context().clearCookies(); await page.goto(origin+'/app/login');
   await page.locator('#login-email').fill(email);
   await page.locator('#login-password').fill(process.env.USK_RECIPE_PASSWORD);
   await page.locator('button[type=submit]').click();
   await page.waitForURL('**/app/dashboard**');
   await page.waitForLoadState('networkidle');
 };
 const capture=async(page,name,options={})=>{
   const basename=path.basename(name).replace(/\.png$/i,'');
   const filename=(basename.startsWith('usk-06-')?basename:'usk-06-'+basename)+'.png';
   const output=path.join(artifacts,filename);
   await page.screenshot({path:output,animations:'disabled',...options});
   return output;
 };
 const record=(id,actor,action,expected,obtained,proofs=[],faculty='institution')=>{
   const row={id,actor,faculty,action,expected,obtained,status:/BLOCK|FAIL|BLOQUE|BLOQUÉ/i.test(id)?'BLOQUÉ':'VALIDÉ',proofs};
   const prior=records.findIndex(item=>item.id===id); if(prior>=0)records.splice(prior,1,row);else records.push(row);
   console.log(row.status+' '+id+' '+action);
   return row;
 };
 const check=(condition,message)=>assert.ok(condition,message);
 const assertNoErrors=async(page)=>assert.deepEqual(errors.get(page)||[],[],'Aucune erreur JavaScript ni HTTP500 sur la page');
 const probe=(action,data={})=>{
   const result=cp.spawnSync(process.env.USK_RECIPE_PHP || 'C:/php-8.4.5/php.exe',[path.join(work,'verify.php'),action,JSON.stringify(data)],{env:process.env,encoding:'utf8',windowsHide:true,maxBuffer:2*1024*1024});
   if(result.status!==0)throw new Error('Sonde isolée échouée '+(result.stderr||result.stdout).slice(0,1000));
   return JSON.parse(result.stdout);
 };
 const finish=async(error=null)=>{
   const pageErrors=browser.contexts().flatMap(c=>c.pages()).flatMap(p=>errors.get(p)||[]);
   const payload={module:moduleName,records,diagnostics,javascript_errors:pageErrors,error:error?.message||null,success:!error&&!pageErrors.length&&!records.some(r=>r.status!=='VALIDÉ')};
   fs.writeFileSync(path.join(work,'results',moduleName+'.json'),JSON.stringify(payload,null,2));
   await browser.close();
   return payload;
 };
 return {browser,fixture,origin,artifacts,login,capture,check,newPage,record,assertNoErrors,probe,finish,work};
}
module.exports={createHarness};

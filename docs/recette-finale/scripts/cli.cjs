/* global process, require, __dirname */
/* eslint @typescript-eslint/no-require-imports: "off" */
const {createHarness}=require('./harness.cjs');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const name=process.argv[2];
 if(!['main-admission-finance','main-academic','teacher-assessment','results-documents','mobile-roles','late-history','history-group','admission-negative','finance-refund','private-support'].includes(name))throw new Error('Module de recette inconnu');
 const h=await createHarness(name);
 const assessment=path.join(__dirname,'teacher-assessment-result.json');
 if(fs.existsSync(assessment))h.fixture.assessment=JSON.parse(fs.readFileSync(assessment,'utf8'));
 let error;
 try{await require('./'+name+'.cjs').run(h);}
 catch(e){error=e;console.error('ECHEC '+name+' '+String(e.stack||e).slice(0,2600));}
 const out=await h.finish(error);
 console.log(JSON.stringify({module:name,success:out.success,scenarios:out.records.length,javascript_errors:out.javascript_errors.length}));
 if(!out.success)process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1});

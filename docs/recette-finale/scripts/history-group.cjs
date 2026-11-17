/* global exports, require */
/* eslint @typescript-eslint/no-require-imports: "off" */
const fs=require('node:fs');const path=require('node:path');
exports.run=async(h)=>{
 const{fixture:fx,origin,newPage,login,capture,check,record,probe,work}=h;
 for(const faculty of ['med','law']){
  const past=fx.all_students.find(s=>s.faculty===faculty&&s.number===6);const p=await newPage();await login(p,past.email);
  await p.goto(origin+'/app/dashboard/student/enrollments?academic='+past.entry);await p.waitForLoadState('networkidle');
  check((await p.locator('body').innerText()).includes('Année précédente de démonstration'),'Année historique visible');
  await p.getByRole('link',{name:/Consulter l’inscription/}).click();await p.waitForLoadState('networkidle');
  const props=JSON.parse(await p.locator('#app').getAttribute('data-page')).props;check(props.studentChrome.academic_id===past.entry,'Contexte de l’inscription historique conservé');
  record('HIST-'+faculty,'Étudiant '+faculty,'Consulter son inscription de l’année précédente','Historique annuel et contexte personnel','Année précédente et inscription terminée consultées',[await capture(p,'historique-annuel-'+faculty)],faculty);await h.assertNoErrors(p);
 }
 const state=JSON.parse(fs.readFileSync(path.join(work,'main-state.json'),'utf8'));const entry=state.entry;const before=probe('history',{entry});
 const a=await newPage();await login(a,'registrar_med');await a.goto(origin+'/app/dashboard/admin/student-academic/administration?academic='+entry);await a.waitForLoadState('networkidle');
 if(before.entry.class_id!==fx.groups.med.B){
  const form=a.locator('form').filter({has:a.getByRole('heading',{name:'Décision administrative',exact:true})});await form.locator('select').nth(1).selectOption(String(fx.groups.med.B));await form.getByLabel('Motif et conditions de reprise',{exact:true}).fill('Changement de groupe fictif après les travaux ; conservation des copies et décisions précédentes.');
  const post=a.waitForResponse(r=>r.request().method()==='POST');await form.getByRole('button',{name:'Enregistrer la décision',exact:true}).click();await post;await a.waitForLoadState('networkidle');
 }
 const after=probe('history',{entry});check(after.entry.class_id===fx.groups.med.B,'Nouveau groupe B appliqué');check(after.submissions.length===before.submissions.length&&after.submissions.length>0,'Copies historiques conservées');check(after.changes.length>=before.changes.length,'Décisions précédentes conservées');
 record('GROUP-01','Appariteur Médecine','Changer le groupe A vers B après remise d’un devoir','Affectation historisée sans effacer les copies','Groupe B appliqué, copies et décisions conservées',[await capture(a,'changement-groupe-historise')],'med');
 const p=await newPage();await login(p,fx.accounts.candidate.email);const assignments=JSON.parse(fs.readFileSync(path.join(work,'teacher-assessment-result.json'),'utf8'));
 const r=await p.goto(origin+'/app/dashboard/student/materials/'+assignments.med.support+'?academic='+entry);check([403,404].includes(r.status()),'Support du groupe A refusé après changement B');
 const foreign=await p.goto(origin+'/app/dashboard/student/submissions/'+assignments.med.students.find(s=>s.entry===fx.students.med.entry).submission+'/versions/1?academic='+entry);check([403,404].includes(foreign.status()),'Copie du camarade même faculté refusée');
 record('GROUP-02','Étudiant Médecine','Ouvrir un ancien support de groupe et la copie d’un camarade','Liens directs protégés après changement','Support ancien public et copie d’un autre étudiant refusés HTTP403/404',[await capture(p,'changement-groupe-refus-copie-autrui')],'med');
 await h.assertNoErrors(a);await h.assertNoErrors(p);
};

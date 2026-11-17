/* global exports, require */
/* eslint @typescript-eslint/no-require-imports: "off" */
const fs=require('node:fs');const path=require('node:path');
exports.run=async(h)=>{
 const{fixture:fx,origin,newPage,login,check,capture,record,probe,work}=h;
 const state=JSON.parse(fs.readFileSync(path.join(work,'main-state.json'),'utf8'));
 const student=await newPage();await login(student,fx.accounts.candidate.email);
 await student.goto(origin+'/app/dashboard/student/courses?academic='+state.entry);
 const before=probe('student',{email:fx.accounts.candidate.email}).entries.find(e=>e.id===state.entry);
 if(!before.class_id){
   const registrar=await newPage();await login(registrar,fx.accounts.registrar_med.email);
   await registrar.goto(origin+'/app/dashboard/admin/student-academic/administration?academic='+state.entry);
   const form=registrar.locator('form').filter({has:registrar.getByRole('heading',{name:'Décision administrative',exact:true})});
   await form.locator('select').nth(1).selectOption(String(fx.groups.med.A));
   await form.getByLabel('Motif et conditions de reprise',{exact:true}).fill('Affectation explicite de l’étudiant admis tardivement au groupe de recette.');
   const action=registrar.waitForResponse(r=>r.request().method()==='POST');await form.getByRole('button',{name:'Enregistrer la décision',exact:true}).click();await action;await registrar.waitForLoadState('networkidle');
   check(probe('student',{email:fx.accounts.candidate.email}).entries.find(e=>e.id===state.entry).class_id===fx.groups.med.A,'Groupe affecté par décision administrative');
   await student.reload();
   await student.getByRole('heading',{name:'Inscription pédagogique en attente',exact:true}).waitFor();
   record('LATE-01','Appariteur / étudiant Médecine','Affecter un nouvel inscrit au groupe et signaler la participation manquante','Cours réservé jusqu’à inscription pédagogique','Affectation historisée et avertissement compréhensible',[await capture(student,'etudiant-tardif-attente-pedagogique')],'med');
   await registrar.goto(origin+'/app/dashboard/admin/teaching?offering='+fx.offerings.med);
   await registrar.getByRole('button',{name:'Synchroniser le public obligatoire',exact:true}).click();
   const d=registrar.getByRole('dialog');await d.getByLabel(/Justification de la décision/).fill('Inscription pédagogique explicite du nouvel étudiant après confirmation.');
   const post=registrar.waitForResponse(r=>r.request().method()==='POST');await d.getByRole('button',{name:'Enregistrer',exact:true}).click();await post;await d.waitFor({state:'hidden'});
   await student.reload();await student.waitForLoadState('networkidle');
   await student.getByRole('heading',{name:'Inscription pédagogique en attente',exact:true}).waitFor({state:'hidden'});
   check(await student.locator('a').filter({hasText:'Fondements biomédicaux'}).count()>0,'Cours accessible au nouvel inscrit pédagogiquement');
   record('LATE-02','Appariteur / étudiant Médecine','Synchroniser explicitement l’offre pour l’étudiant tardif','Accès pédagogique après décision','Cours et enseignant visibles après synchronisation',[await capture(student,'etudiant-tardif-inscrit-pedagogiquement')],'med');
 }
 return state;
};

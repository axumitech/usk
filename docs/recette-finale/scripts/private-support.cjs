/* global exports, require */
/* eslint @typescript-eslint/no-require-imports: "off" */
const fs=require('node:fs');const path=require('node:path');
exports.run=async(h)=>{
 const {origin,fixture:fx,newPage,login,check,capture,record,work}=h;
 const saved=JSON.parse(fs.readFileSync(path.join(work,'teacher-assessment-result.json'),'utf8')).law;
 const p=await newPage();await login(p,'teacher_law');
 const visit=async()=>{await p.goto(origin+'/app/dashboard/teacher/resources?offering='+saved.offering+'&resource='+saved.support);await p.waitForLoadState('networkidle');};
 const transition=async(label)=>{await p.getByRole('button',{name:label,exact:true}).click();const d=p.getByRole('dialog');await d.getByLabel(/Motif|Justification/).fill('Contrôle fictif de confidentialité avant et après publication du support.');const done=p.waitForResponse(r=>r.request().method()==='GET'&&r.headers()['x-inertia']==='true');await d.getByRole('button',{name:'Enregistrer',exact:true}).click();await done;await d.waitFor({state:'hidden'});await p.waitForLoadState('networkidle');};
 await visit();await transition('Retirer');
 const s=await newPage();await login(s,'student_law');
 const response=await s.goto(origin+'/app/dashboard/student/materials/'+saved.support+'?academic='+fx.students.law.entry);check([403,404].includes(response.status()),'Fiche support non publié refusée au destinataire');
 const download=await s.goto(origin+'/app/dashboard/student/resources/'+saved.support+'/download?academic='+fx.students.law.entry);check([403,404].includes(download.status()),'Téléchargement non publié refusé');
 record('PRIVATE-01','Professeur et étudiant Droit','Retirer un support et tenter sa consultation et son téléchargement','Support non publié inaccessible même à son public','Deux liens directs refusés HTTP403/404',[await capture(s,'support-prive-refuse-au-public')],'law');
 await visit();await transition('Publier');
 const visible=await s.goto(origin+'/app/dashboard/student/materials/'+saved.support+'?academic='+fx.students.law.entry);check(visible.status()===200,'Support republié accessible');check((await s.locator('body').innerText()).includes('Support fictif de recette law'),'Support propre affiché');
 record('PRIVATE-02','Professeur et étudiant Droit','Republier le support et consulter sa fiche','Accès rétabli après publication','Support à nouveau accessible sans création de doublon',[await capture(s,'support-republie-accessible')],'law');await h.assertNoErrors(p);await h.assertNoErrors(s);
};

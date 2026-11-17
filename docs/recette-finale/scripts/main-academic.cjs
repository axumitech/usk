/* global exports, require */
/* eslint @typescript-eslint/no-require-imports: "off" */
const fs=require('node:fs');const path=require('node:path');
exports.run=async(h)=>{
 const {fixture:fx,origin,newPage,login,record,capture,check,probe,work}=h;
 const stateFile=path.join(work,'academic-state.json'); const state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{};
 const save=()=>fs.writeFileSync(stateFile,JSON.stringify(state,null,2));
 const p=await newPage();await login(p,'dean_law');
 const submit=async(button)=>{const response=p.waitForResponse(r=>['POST','PUT'].includes(r.request().method()));await button.click();await response;await p.waitForLoadState('networkidle');};
 const data=async()=>{await p.reload();await p.waitForLoadState('networkidle');return JSON.parse(await p.locator('#app').getAttribute('data-page')).props;};
 await p.goto(origin+'/app/dashboard/admin/academic-structure?tab=programs');
 check((await p.locator('body').innerText()).includes('Licence'),'Cycle Licence configuré visible');
 record('ACA-01','Doyen Droit','Consulter les programmes et cycles configurés','Programme rattaché au cycle Licence','Structure existante consultée dans le périmètre Droit',[await capture(p,'structure-cycles-programmes')],'law');
 if(!state.version){
  await p.goto(origin+'/app/dashboard/admin/academic-structure?tab=curriculum&program='+fx.programs.law+'&version='+fx.versions.law);
  await p.getByText('Versions et actions',{exact:true}).click();await p.getByRole('button',{name:'Dupliquer la version',exact:true}).click();
  const d=p.getByRole('dialog');await d.getByLabel('Code de version',{exact:true}).fill('DRO-DEMO-V2-REC06');await d.getByLabel('Nom',{exact:true}).fill('Maquette Droit V2 — RECETTE FICTIVE');
  await d.locator('select').nth(0).selectOption(String(fx.year));await d.getByLabel('Motif',{exact:true}).fill('Préparation explicite d’une nouvelle version fictive pour la recette finale.');
  await submit(d.getByRole('button',{name:'Créer le brouillon',exact:true}));await d.waitFor({state:'hidden'});
  const props=await data();state.version=props.selectedVersion.id;save();
  check(props.selectedVersion.status==='draft','Version clonée en brouillon');
  record('ACA-02','Doyen Droit','Dupliquer la maquette dans un brouillon versionné','Nouvelle version sans altérer les inscriptions existantes','Brouillon V2 créé depuis V1',[await capture(p,'maquette-v2-brouillon')],'law');
 }
 await p.goto(origin+'/app/dashboard/admin/academic-structure?tab=curriculum&version='+state.version);
 let props=await data();
 if(props.selectedVersion.status==='draft'){
  for(const level of props.levelWorkspace){
   if(level.approved)continue;
   await p.getByRole('button',{name:new RegExp(level.title)}).click();await p.getByRole('button',{name:'Validation',exact:true}).click();
   await submit(p.getByRole('button',{name:'Valider ce niveau',exact:true}));await p.getByRole('button',{name:'Retour aux niveaux',exact:true}).click();
  }
  await p.getByRole('button',{name:'Valider la maquette',exact:true}).click();let d=p.getByRole('dialog');await d.getByLabel('Motif officiel',{exact:true}).fill('Niveaux vérifiés et approuvés pour la démonstration fictive.');await submit(d.getByRole('button',{name:'Confirmer la décision',exact:true}));await d.waitFor({state:'hidden'});
 }
 props=await data();
 if(props.selectedVersion.status==='validated'){
  await p.getByRole('button',{name:'Publier la maquette',exact:true}).first().click();let d=p.getByRole('dialog');
  if(await d.locator('select').count())await d.locator('select').selectOption(String(fx.versions.law));
  await d.getByLabel('Motif officiel',{exact:true}).fill('Publication explicite V2 ; maintien des inscriptions historiques sur V1.');await submit(d.getByRole('button',{name:'Confirmer la décision',exact:true}));await d.waitFor({state:'hidden'});
 }
 props=await data();check(props.selectedVersion.status==='published','V2 publiée');
 const student=probe('student',{email:fx.accounts.student_law.email});check(student.entries.find(e=>e.id===fx.students.law.entry).curriculum_version_id===fx.versions.law,'Inscription ancienne conserve V1');
 record('ACA-03','Doyen Droit','Approuver les deux niveaux, valider puis publier la maquette V2','Publication explicite et conservation de V1 pour les inscrits','V2 publiée ; inscription Droit existante toujours rattachée à V1',[await capture(p,'maquette-v2-publiee')],'law');
 if(!state.offering){
  await p.goto(origin+'/app/dashboard/admin/teaching?year='+fx.year+'&program='+fx.programs.law+'&version='+state.version);
  await p.getByRole('button',{name:'Préparer une offre',exact:true}).click();const d=p.getByRole('dialog');
  const ec=d.locator('select').nth(0);const opts=await ec.locator('option').evaluateAll(os=>os.map(o=>({v:o.value,t:o.textContent})));const chosen=opts.find(o=>o.t.includes('Licence 2'));check(chosen,'EC L2 disponible');await ec.selectOption(chosen.v);
  await d.locator('select').nth(1).selectOption(String(fx.groups.law.N2));await d.getByLabel(/Justification de la décision/).fill('Ouverture annuelle explicite du cours de niveau 2 sur la maquette V2.');
  await submit(d.getByRole('button',{name:'Enregistrer',exact:true}));await d.waitFor({state:'hidden'});
  props=await data();state.offering=props.selected.id;save();
 }
 await p.goto(origin+'/app/dashboard/admin/teaching?offering='+state.offering);
 props=await data();
 if(!props.assignments.data.length){
  await p.getByRole('button',{name:'Affecter un membre',exact:true}).click();let d=p.getByRole('dialog');
  const teacher=await d.locator('select').nth(0).locator('option').evaluateAll(os=>os.find(o=>o.value)?.value);await d.locator('select').nth(0).selectOption(teacher);await d.locator('select').nth(1).selectOption('lead');
  await d.getByLabel(/Justification de la décision/).fill('Affectation explicite de l’enseignant Droit au cours V2 de démonstration.');await submit(d.getByRole('button',{name:'Enregistrer',exact:true}));await d.waitFor({state:'hidden'});
 }
 props=await data();if(props.selected.status==='draft'){
  await p.getByRole('button',{name:'Publier après contrôle',exact:true}).click();let d=p.getByRole('dialog');await d.getByLabel(/Justification de la décision/).fill('Offre et affectation contrôlées avant publication du cours de recette.');await submit(d.getByRole('button',{name:'Enregistrer',exact:true}));await d.waitFor({state:'hidden'});
 }
 props=await data();check(props.selected.status==='published','Offre V2 publiée');
 record('ACA-04','Doyen Droit','Ouvrir une offre V2 L2, affecter le professeur et publier','Offre distincte et professeur affecté','Offre publiée sur V2 sans modifier le cours historique V1',[await capture(p,'offre-v2-publiee')],'law');
 await p.goto(origin+'/app/dashboard/admin/schedule?academic_year_id='+fx.year+'&week='+fx.week);
 const scheduleForm=async()=>{
  await p.getByRole('button',{name:'Planifier un cours',exact:true}).first().click();const d=p.getByRole('dialog');
  await d.locator('select').nth(0).selectOption('single');await d.getByLabel(/Enseignement/).selectOption(String(state.offering));
  await d.getByLabel('Début *',{exact:true}).fill(fx.session_day+'T14:00');await d.getByLabel('Fin *',{exact:true}).fill(fx.session_day+'T16:00');
  await d.getByLabel('Salle / lieu (facultatif)',{exact:true}).fill('Auditoire B — RECETTE');await d.getByLabel('Publier dans l’espace étudiant',{exact:true}).check();return d;
 };
 if(!state.session_created){
  const before=probe('summary').sessions;const d=await scheduleForm();await submit(d.getByRole('button',{name:'Enregistrer',exact:true}));await d.waitFor({state:'hidden'});
  check(probe('summary').sessions===before+1,'Une seule séance publiée créée');state.session_created=true;save();
  record('ACA-05','Doyen Droit','Planifier et publier une séance du nouvel enseignement','Séance unique dans l’année et le niveau choisis','Créneau publié pour l’offre V2 avec enseignant affecté',[await capture(p,'horaire-v2-publie')],'law');
 }
 const count=probe('summary').sessions;const d=await scheduleForm();await submit(d.getByRole('button',{name:'Enregistrer',exact:true}));
 check(await d.isVisible(),'Conflit conserve le formulaire');check(probe('summary').sessions===count,'Aucun doublon de séance lors du conflit');
 check(/conflit|chevauche|déjà|occup/i.test(await d.innerText()),'Conflit expliqué');
 record('ACA-06','Doyen Droit','Tenter une séance identique en conflit','Refus et absence de doublon','Conflit visible et compteur serveur inchangé',[await capture(p,'conflit-horaire-refuse')],'law');
 await p.goto(origin+'/app/dashboard/admin/academic-years/calendar?year='+fx.year); check(/Examen|Rattrapage|Férié|férié|examens|examen/i.test(await p.locator('body').innerText()),'Événements académiques fictifs visibles'); record('ACA-08','Doyen Droit','Consulter le calendrier académique','Événements et périodes de l’année visibles','Calendrier consulté avec les périodes fictives',[await capture(p,'calendrier-academique')],'law');
 const s=await newPage();await login(s,'student_law');await s.goto(origin+'/app/dashboard/student/courses?academic='+fx.students.law.entry);check(!(await s.locator('body').innerText()).includes('Applications Droit'),'Offre V2 niveau2 absente du niveau1 V1');
 record('ACA-07','Étudiant Droit','Consulter les cours après publication V2','Conserver son contexte V1 sans offre d’un autre niveau','Cours V1 conservé, offre V2 niveau2 exclue',[await capture(s,'etudiant-v1-apres-publication-v2')],'law');
 await h.assertNoErrors(p);await h.assertNoErrors(s);return state;
};

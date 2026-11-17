/* global Buffer, exports, process, require */
/* eslint @typescript-eslint/no-require-imports: "off" */
const fs=require('node:fs');
const path=require('node:path');
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+pBp0AAAAASUVORK5CYII=','base64');
const reason='Recette finale sur dossier et versements exclusivement fictifs.';
exports.run=async(h)=>{
 const {fixture:fx,origin,newPage,login,capture,check,record,probe,assertNoErrors,work}=h;
 const stateFile=path.join(work,'main-state.json');
 const state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{};
 const save=()=>fs.writeFileSync(stateFile,JSON.stringify(state,null,2));
 const go=async(page,suffix)=>{const r=await page.goto(new URL(suffix,origin).href);check(r.status()<400,'Page accessible '+suffix);await page.waitForLoadState('networkidle');return r;};
 const click=async(page,button)=>{const response=page.waitForResponse(r=>['POST','PUT','PATCH','DELETE'].includes(r.request().method()));await button.click();const r=await response;check(r.status()<500,'Action sans erreur serveur');await page.waitForLoadState('networkidle');};
 const modal=async(page,buttonName,fill)=>{const d=page.getByRole('dialog');if(fill)await fill(d);await click(page,d.getByRole('button',{name:buttonName,exact:true}));await d.waitFor({state:'hidden'});};
 const account=(key)=>fx.accounts[key].email;
 const candidate=await newPage();
 let studentData;
 try{studentData=probe('student',{email:account('candidate')});}catch{/* Le compte peut déjà être vérifié lors de la reprise. */}
 if(!studentData){
   await go(candidate,'/app/register');
   await candidate.getByLabel('Nom',{exact:true}).fill('Candidat Recette');
   await candidate.getByLabel('Prénom',{exact:true}).fill('Nouveau');
   await candidate.getByLabel('Genre',{exact:true}).selectOption('male');
   await candidate.getByLabel('Nationalité',{exact:true}).selectOption('CD');
   await candidate.getByLabel('Adresse email',{exact:true}).fill(account('candidate'));
   await candidate.getByLabel('Mot de passe',{exact:true}).fill(process.env.USK_RECIPE_PASSWORD);
   await candidate.getByLabel('Confirmation du mot de passe',{exact:true}).fill(process.env.USK_RECIPE_PASSWORD);
   await click(candidate,candidate.locator('button[type=submit]'));
   const link=probe('verification_link',{email:account('candidate')}).url;
   await go(candidate,link);
   studentData=probe('student',{email:account('candidate')});
   check(studentData.verified,'Compte candidat vérifié par lien signé');
   record('ADM-01','Candidat','Créer le compte puis vérifier l’adresse fictive','Compte user vérifié','Formulaire de création et lien signé exécutés',[await capture(candidate,'candidat-compte-cree')],'med');
 }else await login(candidate,account('candidate'));
 const application=studentData.applications[0];
 if(!application){
   await go(candidate,'/app/dashboard/enrollments/create');
   await candidate.locator('#faculty_id').selectOption(String(fx.faculties.med));
   await candidate.locator('#level_id').selectOption(String(fx.levels.med));
   await candidate.locator('#year_id').selectOption(String(fx.year));
   if(await candidate.locator('#academic_program_id').count())await candidate.locator('#academic_program_id').selectOption(String(fx.programs.med));
   await click(candidate,candidate.getByRole('button',{name:/Enregistrer et continuer/}));
   await candidate.locator('#name').waitFor();
   await click(candidate,candidate.getByRole('button',{name:/Enregistrer et continuer/}));
   await candidate.locator('input[type=file]').first().waitFor();
   // Required file absent prevents a complete submission.
   check(await candidate.locator('input[type=file]').count()===1,'Une pièce de campagne exigée');
   record('ADM-02','Candidat','Vérifier les pièces exigées par la campagne ouverte','Attestation fictive requise','Programme officiel et document de campagne affichés',[await capture(candidate,'candidat-piece-obligatoire')],'med');
   await candidate.locator('input[type=file]').setInputFiles({name:'attestation-fictive.png',mimeType:'image/png',buffer:image});
   await click(candidate,candidate.getByRole('button',{name:/Enregistrer et continuer/}));
   await candidate.locator('#confirmed').check();
   await click(candidate,candidate.getByRole('button',{name:/Soumettre mon dossier/}));
   await candidate.waitForURL('**/app/dashboard/enrollments');
   studentData=probe('student',{email:account('candidate')});
   check(studentData.applications[0].status==='submitted','Dossier soumis');
   state.application=studentData.applications[0];save();
   record('ADM-03','Candidat','Déposer la pièce et soumettre sa candidature','Dossier submitted','Candidature transmise et UUID conservé',[await capture(candidate,'candidat-dossier-soumis')],'med');
 }else {state.application=application;save();}
 const app=state.application;
 const dean=await newPage();await login(dean,account('dean_med'));
 const foreign=await newPage();await login(foreign,account('dean_law'));
 let denied=await foreign.goto(origin+'/app/dashboard/admin/enrollments/'+app.id);
 check([403,404].includes(denied.status()),'Autre faculté exclue du dossier médecine');
 record('ISO-ADM','Doyen Droit','Ouvrir le dossier Médecine par lien direct','403 ou404','Refus HTTP '+denied.status(),[await capture(foreign,'doyen-droit-refus-medecine')],'law');
 studentData=probe('student',{email:account('candidate')});
 if(studentData.applications[0].status!=='validated'){
   await go(dean,'/app/dashboard/admin/enrollments/'+app.id);
   if(await dean.getByRole('button',{name:'Commencer l’analyse',exact:true}).count())await click(dean,dean.getByRole('button',{name:'Commencer l’analyse',exact:true}));
   await dean.getByRole('radio',{name:'Accepter',exact:true}).check();
   await click(dean,dean.getByRole('button',{name:'Accepter cette pièce',exact:true}));
   await dean.getByRole('button',{name:'Valider le dossier',exact:true}).click();
   await dean.locator('#admission-decision-reason').fill('Pièce fictive relue et conditions du programme vérifiées pour la recette.');
   await dean.getByRole('checkbox',{name:/J’ai examiné/}).check();
   await click(dean,dean.getByRole('button',{name:'Confirmer la validation',exact:true}));
   studentData=probe('student',{email:account('candidate')});
   check(studentData.entries[0]?.enrollment_status==='pending_confirmation','Admission crée une inscription en attente');
   state.entry=studentData.entries[0].id;save();
   await go(candidate,'/app/dashboard/enrollments/'+app.uuid);
   record('ADM-04','Doyen Médecine / candidat','Examiner, motiver l’admission et consulter la décision','Admis et inscription en attente','Décision enregistrée, rôle étudiant attribué et annualité pending_confirmation',[await capture(dean,'admission-decision-medecine'),await capture(candidate,'candidat-admission-recue')],'med');
 }else {state.entry=studentData.entries[0].id;save();}
 const entry=state.entry;
 await go(candidate,'/app/dashboard/student/fees?academic='+entry);
 const section=candidate.getByRole('region',{name:'Première tranche et inscription'});
 await section.getByText('Montant attendu',{exact:true}).waitFor();
 const finance=await newPage();await login(finance,account('finance_med'));
 const accountUrl='/app/dashboard/admin/finance?academic='+entry;
 async function readLedger(){return probe('ledger',{entry});}
 async function recordPayment(reference,amount,kind='tuition'){
   let l=await readLedger();let p=l.payments.find(row=>row.reference===reference);if(p)return p;
   await go(finance,accountUrl);
   await finance.getByRole('button',{name:'Saisir un versement',exact:true}).first().click();
   await modal(finance,'Enregistrer le versement',async d=>{
     await d.getByLabel(/^Frais concernés/).selectOption(kind);await d.getByLabel(/^Montant reçu/).fill(amount);
     await d.getByLabel(/^Mode de paiement/).selectOption('bank_transfer');await d.getByLabel(/^Référence unique/).fill(reference);
     await d.getByLabel(/^Pièce ou justification/).fill(reason);
   });
   l=await readLedger();p=l.payments.find(row=>row.reference===reference);check(p,'Versement fictif présent');return p;
 }
 async function confirmPayment(reference){
   let l=await readLedger();const p=l.payments.find(row=>row.reference===reference);if(p.status==='confirmed')return p;
   await go(finance,accountUrl);const row=finance.getByRole('row').filter({hasText:reference});
   await row.getByRole('button',{name:'Confirmer le versement',exact:true}).click();
   await modal(finance,'Confirmer le versement',d=>d.getByLabel(/^Motif après contrôle/).fill(reason));
   return (await readLedger()).payments.find(row=>row.reference===reference);
 }
 if((await readLedger()).enrollment_status==='pending_confirmation'){
   await recordPayment('REC06-PARTIEL','10.00');
   let l=await readLedger();
   if(l.payments.find(p=>p.reference==='REC06-PARTIEL').status==='pending')check(l.first_installment.remaining_cents===5000,'Versement en attente non reconnu');
   record('FIN-01','Agent financier Médecine','Saisir un versement fictif en attente','La première tranche reste due','Versement pending10USD, reste50USD',[await capture(finance,'versement-en-attente')],'med');
   // The student's proof refers to the same existing bank entry.
   await go(candidate,'/app/dashboard/student/fees?academic='+entry);
   const proofs=candidate.getByRole('region',{name:'Justificatifs de paiement'});
   if(!(await readLedger()).proofs.some(proof=>proof.reference==='REC06-PARTIEL')){
     await proofs.getByLabel(/^Frais concernés/).selectOption('tuition');
     await proofs.getByLabel(/^Montant réellement versé/).fill('10.00');
     await proofs.getByLabel(/^Mode de paiement/).selectOption('bank_transfer');
     await proofs.getByLabel(/^Référence du versement/).fill('REC06-PARTIEL');
     await proofs.locator('input[type=file]').setInputFiles({name:'preuve-versement-fictif.png',mimeType:'image/png',buffer:image});
     await click(candidate,proofs.getByRole('button',{name:'Envoyer le justificatif',exact:true}));
   }
   await go(finance,accountUrl);
   if(await finance.getByRole('button',{name:/^Valider le justificatif/}).count()){
     await finance.getByRole('button',{name:/^Valider le justificatif/}).first().click();
     await modal(finance,'Valider le justificatif',d=>d.getByLabel(/^Motif après vérification/).fill(reason));
   }
   l=await readLedger();
   check(l.payments.filter(p=>p.reference==='REC06-PARTIEL').length===1,'Justificatif rapproché sans doublon');
   check(l.first_installment.paid_cents===1000&&l.first_installment.remaining_cents===4000,'Paiement partiel reconnu sur la bonne tranche');
   record('FIN-02','Étudiant et agent financier Médecine','Déposer et contrôler la preuve du versement existant','Rapprochement unique, paiement partiel insuffisant','Un seul versement10USD confirmé, reste40USD',[await capture(finance,'justificatif-rapproche')],'med');
   const wrong=await recordPayment('REC06-AUTRE-TRANCHE','50.00','unallocated');
   await confirmPayment('REC06-AUTRE-TRANCHE');
   l=await readLedger();
   if(!l.payments.find(p=>p.id===wrong.id).allocations.length){
     await go(finance,accountUrl);
     await finance.getByRole('row').filter({hasText:'REC06-AUTRE-TRANCHE'}).getByRole('button',{name:'Affecter aux obligations',exact:true}).click();
     await modal(finance,'Affecter après contrôle',async d=>{
       const rows=d.locator('input[inputmode=decimal]');await rows.nth(1).fill('50.00');await d.getByLabel('Justification',{exact:true}).fill(reason);
     });
   }
   l=await readLedger();check(l.first_installment.remaining_cents===4000&&l.enrollment_status==='pending_confirmation','Autre tranche ne couvre pas la première');
   await go(finance,'/app/dashboard/admin/finance/confirmations?q=Nouveau');
   await finance.getByText('Première tranche à couvrir',{exact:true}).waitFor();
   check(await finance.getByRole('button',{name:'Confirmer l’inscription',exact:true}).count()===0,'Confirmation indisponible quand première tranche due');
   record('FIN-03','Agent financier Médecine','Affecter un paiement à la deuxième obligation','Première tranche impayée, confirmation bloquée','Paiement affecté à l’autre tranche, reste40USD sur la première',[await capture(finance,'mauvaise-affectation-refusee')],'med');
   await recordPayment('REC06-SOLDE-PREMIERE','40.00');await confirmPayment('REC06-SOLDE-PREMIERE');
   await go(finance,accountUrl);
   await finance.getByRole('button',{name:'Confirmer l’inscription',exact:true}).click();
   await modal(finance,'Confirmer l’inscription',d=>d.getByLabel(/^Motif de confirmation/).fill(reason));
 }
 const ledger=await readLedger();
 check(ledger.enrollment_status==='confirmed'&&ledger.first_installment.remaining_cents===0,'Première obligation couverte et inscription confirmée');
 check(ledger.confirmation_audits===1&&ledger.confirmation_notices===1,'Une décision et une notification');
 await go(candidate,'/app/dashboard/student/fees?academic='+entry);
 await candidate.getByRole('region',{name:'Première tranche et inscription'}).getByText('Inscription confirmée',{exact:true}).waitFor();
 await assertNoErrors(candidate);await assertNoErrors(finance);
 record('FIN-04','Agent financier / étudiant Médecine','Confirmer puis reconnecter pour vérifier les droits','Inscription confirmed, notification unique','Première tranche soldée, audit et notification uniques',[await capture(candidate,'inscription-confirmee-finances')],'med');
 const missing=fx.all_students.find(row=>row.faculty==='med'&&row.number===4);
 await go(finance,'/app/dashboard/admin/finance?academic='+missing.entry);
 await finance.getByText('Barème de la première tranche à établir',{exact:true}).waitFor();
 check(await finance.getByRole('button',{name:'Confirmer l’inscription',exact:true}).count()===0,'Barème absent empêche confirmation');
 record('FIN-05','Agent financier Médecine','Ouvrir une inscription sans barème','Confirmation bloquée et motif visible','Barème requis absent, bouton de confirmation indisponible',[await capture(finance,'bareme-absent-refus')],'med');
 fs.writeFileSync(path.join(work,'candidate-result.json'),JSON.stringify({email:account('candidate'),...state},null,2));
 return state;
};

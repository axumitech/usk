import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import { defaultUploadLimits, proofUploadHelp, type UploadLimits } from '@/lib/uploadLimits';
import { Link, usePage } from '@inertiajs/react';
import { ArrowLeft, ArrowRight, CheckCircle2, HelpCircle, LoaderCircle, Save } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import '../../../../../css/enrollment.css';
import ProgressHeader from './components/ProgressHeader';
import Step1Faculty from './components/Steps/Step1Faculty';
import Step2Personal from './components/Steps/Step2Personal';
import Step3Academic from './components/Steps/Step3Academic';
import Step4Payment from './components/Steps/Step4Payment';
import { useEnrollmentForm } from './hooks/useEnrollmentForm';
import { useRequirements } from './hooks/useRequirements';
import type { AdmissionContext, DraftContext, DraftSnapshot, Faculty, Level, Year } from './types';
import { admissionOptions, changeAdmissionContext } from './utils/admissionContexts';
import { validateStep } from './utils/validators';
type Draft = { uuid: string; last_step: number; form_snapshot: DraftSnapshot; context?: DraftContext };
type PageData = {
    uploadLimits?: UploadLimits;
    auth: { user: { first_name?: string; post_name?: string; last_name?: string; email: string } };
    draft?: Draft;
    faculties: Faculty[];
    years: { id: string | number; title: string }[];
    levelsByFaculty: Record<string, { id: string | number; title: string; programs?: { id: number; name: string; code: string }[] }[]>;
    admissionContexts: AdmissionContext[];
};
const titles = ['Choisissez votre année et votre formation.', 'Vérifiez vos coordonnées.', 'Votre parcours et vos justificatifs.', 'Un dernier regard avant l’envoi.'];
const descriptions = [
    'Commencez par l’année académique, puis choisissez la faculté, le programme et le niveau proposés pour cette campagne.',
    'Vérifiez votre nom et votre adresse email avant de continuer.',
    'Les pièces d’identité et académiques justifient votre parcours. Joignez les documents exigés pour votre formation.',
    'Relisez chaque information. Vous pouvez encore revenir sur les étapes précédentes.',
];
const contextFields = ['year_id', 'faculty_id', 'academic_program_id', 'level_id'] as const;
export default function EnrollmentPageSection() {
    const { props } = usePage<PageData>();
    const limits = props.uploadLimits ?? defaultUploadLimits;
    const user = props.auth.user;
    const [step, setStep] = useState(props.draft?.context?.unavailable_reason ? 1 : Math.max(1, Math.min(4, props.draft?.last_step || 1)));
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [working, setWorking] = useState(false);
    const [contextMessage, setContextMessage] = useState('');
    const [legacySelected, setLegacySelected] = useState(Boolean(props.draft && !props.draft.form_snapshot.academic_program_id && (props.draft.form_snapshot.level_id || props.draft.form_snapshot.program)));
    const heading = useRef<HTMLHeadingElement>(null);
    const errorSummary = useRef<HTMLDivElement>(null);
    const form = useEnrollmentForm({
        name: [user.last_name, user.post_name, user.first_name].filter(Boolean).join(' '),
        email: user.email,
        year_id: !props.draft && props.years.length === 1 ? String(props.years[0].id) : '',
        ...props.draft?.form_snapshot,
        uuid: props.draft?.uuid,
    }, limits);
    const { formData, setFormData, isConfirmed, setIsConfirmed, saveProgress, submitEnrollment, saveStatus, saveError, uploadingKeys, uploadErrors } =
        form;
    const contexts = props.admissionContexts ?? [];
    const historicalLabel = (field: 'year_id' | 'faculty_id' | 'level_id', label: 'year' | 'faculty' | 'level') =>
        formData[field] && String(props.draft?.form_snapshot[field] ?? '') === formData[field] ? props.draft?.context?.[label] : null;
    const options = admissionOptions(contexts, formData, legacySelected);
    const faculties = props.faculties.filter((faculty) => options.facultyIds.includes(String(faculty.id))).map((f) => ({ ...f, id: String(f.id) }));
    const years: Year[] = props.years.map((y) => ({ id: String(y.id), name: y.title }));
    const facultyLevels = props.levelsByFaculty[formData.faculty_id] || [];
    const availableLevels: Level[] = facultyLevels.filter((level) => options.levelIds.includes(String(level.id))).map((level) => ({ id: String(level.id), name: level.title }));
    const catalogPrograms = [...new Map(facultyLevels.flatMap((level) => level.programs ?? []).map((program) => [program.id, program])).values()];
    const availablePrograms = catalogPrograms.filter((program) => options.programIds.includes(String(program.id)));
    const officialProgram = availablePrograms.find((program) => String(program.id) === formData.academic_program_id);
    const applicationForm = officialProgram
        ? { ...formData, academic_program_id: String(officialProgram.id), program: officialProgram.name }
        : formData;
    const { requirements, loading, error: requirementsError } = useRequirements(applicationForm, options.valid);
    const savingBusy = working || uploadingKeys.length > 0;
    const busy = savingBusy || loading;
    const unchangedContext = contextFields.every((field) => String(props.draft?.form_snapshot[field] ?? '') === (formData[field] ?? ''));
    const contextIssue = options.valid ? null : (unchangedContext ? props.draft?.context?.unavailable_reason : null) || (
        formData.year_id && formData.faculty_id && formData.level_id ? 'Cette combinaison n’est plus disponible. Vérifiez l’année, la faculté, le programme et le niveau.' : null
    );
    const formation = {
        faculty: faculties.find((f) => f.id === formData.faculty_id)?.name || historicalLabel('faculty_id', 'faculty') || '—',
        level: availableLevels.find((level) => level.id === formData.level_id)?.name || historicalLabel('level_id', 'level') || '—',
        year: years.find((y) => y.id === formData.year_id)?.name || historicalLabel('year_id', 'year') || '—',
    };
    const noLevels = !!formData.faculty_id && options.hasProgramChoice && availableLevels.length === 0;
    const visibleErrors = Object.fromEntries([errors, form.fieldErrors, uploadErrors].flatMap((group) => Object.entries(group).filter(([, message]) => message)));
    const documentProps = {
        formData: applicationForm,
        errors: visibleErrors,
        handleFieldChange: form.handleFieldChange,
        requirements,
        handleFileChange: form.handleFileChange,
        removeFile: form.removeFile,
        previews: form.previews,
        uploadingKeys,
    };
    const requiredDocs = useMemo(() => [...requirements.personal_info, ...requirements.academic_info].filter((doc) => doc.required), [requirements]);
    useEffect(() => {
        heading.current?.focus({ preventScroll: true });
    }, [step]);
    const goToStep = (next: number) => {
        setErrors({});
        setStep(next);
        requestAnimationFrame(() => heading.current?.scrollIntoView({ block: 'start', behavior: 'auto' }));
    };
    const showErrors = (nextErrors: Record<string, string>) => {
        setErrors(nextErrors);
        requestAnimationFrame(() => {
            errorSummary.current?.focus();
            errorSummary.current?.scrollIntoView({ block: 'center' });
        });
    };
    const next = async () => {
        if (busy) return;
        if (requirementsError) return;
        if (step === 4) {
            for (let current = 1; current <= 4; current++) {
                const nextErrors = validateStep(current, applicationForm, requirements, noLevels, isConfirmed, availablePrograms.length, options.hasProgramChoice && !formData.academic_program_id, options.valid);
                if (Object.keys(nextErrors).length) {
                    setStep(current);
                    showErrors(nextErrors);
                    return;
                }
            }
        }
        const nextErrors = validateStep(step, applicationForm, requirements, noLevels, isConfirmed, availablePrograms.length, options.hasProgramChoice && !formData.academic_program_id, options.valid);
        if (Object.keys(nextErrors).length) {
            showErrors(nextErrors);
            return;
        }
        setWorking(true);
        try {
            if (step < 4) {
                if (await saveProgress(step + 1, applicationForm)) goToStep(step + 1);
            } else await submitEnrollment(applicationForm);
        } finally {
            setWorking(false);
        }
    };
    const saveForLater = async () => {
        if (savingBusy) return;
        setErrors({});
        setWorking(true);
        try {
            await saveProgress(step, applicationForm);
        } finally {
            setWorking(false);
        }
    };
    const changeContext = (field: 'year_id' | 'faculty_id' | 'academic_program_id' | 'level_id', value: string) => {
        const changed = changeAdmissionContext(formData, field, value, contexts, legacySelected);
        setFormData(changed.form);
        setLegacySelected(changed.legacySelected);
        setErrors({});
        setContextMessage(changed.cleared.length
            ? `Choix devenus indisponibles à sélectionner de nouveau : ${changed.cleared.join(', ')}. Vos coordonnées et pièces déjà ajoutées sont conservées.`
            : '');
    };
    return (
        <Dashboard>
            <div className="enrollment-flow">
                <div className="enrollment-page-top">
                    <Link href="/app/dashboard/enrollments">
                        <ArrowLeft size={16} /> Mes candidatures
                    </Link>
                    <span>
                        <CheckCircle2 size={15} />
                        {saveStatus === 'saving'
                            ? 'Sauvegarde en cours…'
                            : saveStatus === 'saved'
                              ? 'Brouillon sauvegardé'
                              : 'Sauvegarde à chaque étape'}
                    </span>
                </div>
                <header className="enrollment-page-title">
                    <span>UNIVERSITÉ SIMON KIMBANGU</span>
                    <h1>Votre candidature, pas à pas.</h1>
                    <p>Un parcours guidé pour préparer et transmettre votre dossier en toute clarté.</p>
                </header>
                <ProgressHeader step={step} onStepChange={busy ? undefined : goToStep} />
                <div className="enrollment-layout">
                    <form
                        className="enrollment-form-card"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void next();
                        }}
                        noValidate
                    >
                        <div className="enrollment-form-heading">
                            <span className="enrollment-kicker">ÉTAPE 0{step} / 04</span>
                            <h2 tabIndex={-1} ref={heading}>
                                {titles[step - 1]}
                            </h2>
                            <p>{descriptions[step - 1]}</p>
                            <small>
                                <span className="enrollment-required">*</span> Champs obligatoires
                            </small>
                        </div>
                        {!!Object.values(visibleErrors).length && (
                            <div className="enrollment-errors" tabIndex={-1} ref={errorSummary} role="alert">
                                <strong>Quelques informations sont à vérifier.</strong>
                                <ul>
                                    {Object.entries(visibleErrors)
                                        .filter(([, message]) => message)
                                        .map(([key, message]) => (
                                            <li key={key}>
                                                <a
                                                    href={`#${['faculty_id', 'level_id', 'academic_program_id', 'year_id', 'name', 'email', 'program', 'confirmed'].includes(key) ? key : `document-${key}`}`}
                                                    onClick={() => setStep(['faculty_id', 'level_id', 'academic_program_id', 'year_id', 'program'].includes(key) ? 1 : ['name', 'email'].includes(key) ? 2 : key === 'confirmed' ? 4 : 3)}
                                                >
                                                    {message}
                                                </a>
                                            </li>
                                        ))}
                                </ul>
                            </div>
                        )}
                        {saveError && (
                            <div className="enrollment-errors" role="alert">
                                {saveError}
                            </div>
                        )}
                        {saveStatus === 'saved' && (
                            <div className="enrollment-info" role="status">
                                Votre brouillon est sauvegardé. Vous pouvez fermer cette page et le reprendre depuis{' '}
                                <Link href="/app/dashboard/enrollments">Mes candidatures</Link>.
                            </div>
                        )}
                        {contextMessage && <p className="enrollment-info" role="status">{contextMessage}</p>}
                        {contextIssue && (
                            <div className="enrollment-errors" role="alert">
                                <p>{contextIssue} Vos informations et pièces sont conservées.</p>
                                {step !== 1 && <button type="button" className="enrollment-secondary" onClick={() => goToStep(1)}>Revoir l’année et la formation</button>}
                            </div>
                        )}
                        {requirementsError && (
                            <div className="enrollment-errors" role="alert">
                                <p>{requirementsError} Revenez à la première étape pour vérifier votre formation.</p>
                                {step !== 1 && <button type="button" className="enrollment-secondary" onClick={() => goToStep(1)}>Revoir l’année et la formation</button>}
                            </div>
                        )}
                        {loading && (
                            <div role="status" data-requirements-skeleton>
                                <span className="sr-only">Chargement des pièces demandées…</span>
                                <div className="usk-inline-skeleton" aria-hidden="true">
                                    <span className="usk-skeleton-block" />
                                    <span className="usk-skeleton-block" />
                                    <span className="usk-skeleton-block" />
                                </div>
                            </div>
                        )}
                        {step === 1 && (
                            <Step1Faculty
                                faculties={faculties}
                                years={years}
                                availableLevels={availableLevels}
                                availablePrograms={availablePrograms}
                                allowsLegacy={options.allowsLegacy}
                                hasProgramChoice={options.hasProgramChoice}
                                noLevelsForSelectedFaculty={noLevels}
                                formData={formData}
                                historicalContext={props.draft?.context}
                                historicalValues={props.draft?.form_snapshot}
                                onContextChange={changeContext}
                                onProgramTextChange={(value) => {
                                    form.handleFieldChange('program', value);
                                    setErrors((previous) => ({ ...previous, program: '' }));
                                }}
                                errors={visibleErrors}
                            />
                        )}
                        {step === 2 && <Step2Personal {...documentProps} />}
                        {step === 3 && <Step3Academic {...documentProps} />}
                        {step === 4 && (
                            <Step4Payment
                                isConfirmed={isConfirmed}
                                setIsConfirmed={setIsConfirmed}
                                errors={visibleErrors}
                                requirements={requirements}
                                formData={applicationForm}
                                formation={formation}
                                onEdit={goToStep}
                            />
                        )}
                        <div className="enrollment-form-actions">
                            {step > 1 && (
                                <button type="button" className="enrollment-secondary" disabled={busy} onClick={() => goToStep(step - 1)}>
                                    <ArrowLeft size={16} /> Précédent
                                </button>
                            )}
                            <button type="submit" className="enrollment-primary" disabled={busy || !!requirementsError}>
                                {working ? (
                                    <>
                                        <LoaderCircle size={17} className="animate-spin" /> Enregistrement…
                                    </>
                                ) : step < 4 ? (
                                    <>
                                        Enregistrer et continuer <ArrowRight size={17} />
                                    </>
                                ) : (
                                    <>
                                        Soumettre mon dossier <ArrowRight size={17} />
                                    </>
                                )}
                            </button>
                        </div>
                        <button type="button" className="enrollment-save" disabled={savingBusy} onClick={() => void saveForLater()}>
                            <Save size={15} /> Enregistrer et continuer plus tard
                        </button>
                    </form>
                    <aside className="enrollment-aside">
                        <section className="enrollment-summary">
                            <span className="enrollment-kicker">VOTRE PROJET D’ÉTUDES</span>
                            <h2>Le cap est fixé.</h2>
                            <dl>
                                {[
                                    ['Année', formation.year],
                                    ['Faculté', formation.faculty],
                                    ['Programme', applicationForm.program || '—'],
                                    ['Niveau', formation.level],
                                ].map(([label, value]) => (
                                    <div key={label}>
                                        <dt>{label}</dt>
                                        <dd>{value === '—' ? 'À sélectionner' : value}</dd>
                                    </div>
                                ))}
                            </dl>
                            <div className="enrollment-save-note">
                                <CheckCircle2 size={18} />
                                <p>Votre progression est enregistrée quand vous passez à l’étape suivante.</p>
                            </div>
                        </section>
                        <section className="enrollment-document-guide">
                            <h3>Préparez vos documents</h3>
                            <p>{proofUploadHelp(limits)}</p>
                            {requiredDocs.length > 0 && (
                                <ul>
                                    {requiredDocs.map((doc) => (
                                        <li key={doc.key} className={formData.documents[doc.key] ? 'is-done' : ''}>
                                            <CheckCircle2 size={15} />
                                            {doc.label}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                        <Link href="/contact" className="enrollment-help">
                            <HelpCircle size={20} />
                            <span>
                                Besoin d’un coup de main ?<strong>Contactez le service des inscriptions</strong>
                            </span>
                            <ArrowRight size={15} />
                        </Link>
                    </aside>
                </div>
            </div>
        </Dashboard>
    );
}

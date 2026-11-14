import { localDate } from '@/lib/scheduleDates';
import { formatDate } from '@/lib/studentEnrollment';
import { useForm } from '@inertiajs/react';
import * as Dialog from '@radix-ui/react-dialog';
import {
    Camera,
    ChevronDown,
    Eye,
    EyeOff,
    GraduationCap,
    IdCard,
    KeyRound,
    LoaderCircle,
    MapPin,
    PencilLine,
    Phone,
    Save,
    UserRound,
    X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import '../../../css/student-profile.css';
import type { Academic, PortalProps } from './types';

type Profile = NonNullable<PortalProps['profile_form']>;
type ProfileData = Record<string, string | boolean | File | null>;
type Option = { value: string; label: string };
type Field = {
    name: string;
    label: string;
    type?: 'date' | 'email' | 'number' | 'password' | 'tel' | 'textarea';
    options?: Option[];
    maxLength?: number;
    autoComplete?: string;
    required?: boolean;
};

const choices = (entries: Record<string, string>): Option[] => Object.entries(entries).map(([value, label]) => ({ value, label }));
const genders = choices({ male: 'Masculin', female: 'Féminin', other: 'Autre' });
const civilStatuses = choices({ single: 'Célibataire', married: 'Marié(e)', divorced: 'Divorcé(e)', widowed: 'Veuf / Veuve', other: 'Autre' });
const diplomaTypes = choices({ state_diploma: 'Diplôme d’État', baccalaureate: 'Baccalauréat', other: 'Autre' });

const identityFields: Field[] = [
    { name: 'last_name', label: 'Nom', autoComplete: 'family-name', required: true, maxLength: 100 },
    { name: 'post_name', label: 'Postnom', maxLength: 100 },
    { name: 'first_name', label: 'Prénom', autoComplete: 'given-name', required: true, maxLength: 100 },
    { name: 'birth_date', label: 'Date de naissance', type: 'date', autoComplete: 'bday' },
    { name: 'gender', label: 'Sexe', options: genders, autoComplete: 'sex' },
    { name: 'birth_place', label: 'Lieu de naissance', maxLength: 150 },
    { name: 'marital_status', label: 'État civil', options: civilStatuses },
];
const identitySummaryFields: Field[] = [{ name: 'full_name', label: 'Nom complet' }, ...identityFields.slice(3)];
const contactFields: Field[] = [
    { name: 'phone', label: 'Téléphone', type: 'tel', autoComplete: 'tel', maxLength: 30 },
    { name: 'email', label: 'Adresse email', type: 'email', autoComplete: 'email', required: true, maxLength: 255 },
];
const addressFields: Field[] = [
    { name: 'residence_commune', label: 'Commune de résidence', maxLength: 150 },
    { name: 'home_address', label: 'Adresse du domicile', type: 'textarea', autoComplete: 'street-address', maxLength: 500 },
    { name: 'territory', label: 'Territoire', maxLength: 150 },
    { name: 'sector', label: 'Secteur / chefferie', maxLength: 150 },
    { name: 'description', label: 'Informations complémentaires', type: 'textarea', maxLength: 2000 },
];
const emergencyFields: Field[] = [
    { name: 'emergency_name', label: 'Nom complet', maxLength: 150 },
    { name: 'emergency_relationship', label: 'Lien avec l’étudiant', maxLength: 100 },
    { name: 'emergency_phone', label: 'Téléphone', type: 'tel', maxLength: 30 },
    { name: 'emergency_address', label: 'Adresse du contact', type: 'textarea', maxLength: 500 },
];
const diplomaFields: Field[] = [
    { name: 'diploma_number', label: 'Numéro du diplôme', maxLength: 100 },
    { name: 'diploma_section', label: 'Section / option', maxLength: 150 },
    { name: 'diploma_school', label: 'Établissement', maxLength: 200 },
    { name: 'diploma_year', label: 'Année d’obtention', type: 'number' },
];

function readValue(field: Field, value: Profile['values'][string]) {
    if (value == null || String(value).trim() === '') return null;
    if (field.type === 'date') return formatDate(String(value));
    return field.options?.find((option) => option.value === value)?.label ?? String(value);
}

function profileData(values: Profile['values']): ProfileData {
    return {
        ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value == null ? '' : String(value)])),
        email_current_password: '',
        photo: null,
        remove_photo: false,
    };
}

function PersonalCard({ id, title, icon: Icon, children }: { id: string; title: string; icon: typeof UserRound; children: ReactNode }) {
    return (
        <section className="profile-personal-card" id={`profile-section-${id}`} aria-labelledby={`profile-heading-${id}`}>
            <header>
                <span className="profile-personal-icon">
                    <Icon size={20} aria-hidden="true" />
                </span>
                <h2 id={`profile-heading-${id}`} tabIndex={-1}>
                    {title}
                </h2>
            </header>
            {children}
        </section>
    );
}

function PersonalValues({ fields, values }: { fields: Field[]; values: Profile['values'] }) {
    return (
        <dl className="profile-personal-values">
            {fields.map((field) => {
                const value = readValue(field, values[field.name]);
                return (
                    <div key={field.name} className={field.type === 'textarea' ? 'is-long' : undefined}>
                        <dt>{field.label}</dt>
                        <dd>{value ?? <span className="profile-personal-empty">Non renseigné</span>}</dd>
                    </div>
                );
            })}
        </dl>
    );
}

export default function StudentProfileForm({
    academic,
    profile,
    onFeedback,
    initialEditSection,
}: {
    academic: Academic;
    profile: Profile;
    onFeedback: (message: string) => void;
    initialEditSection?: 'photo';
}) {
    const form = useForm<ProfileData>(() => profileData(profile.values));
    const [editing, setEditing] = useState(Boolean(initialEditSection));
    const [preview, setPreview] = useState<string | null>(null);
    const [brokenPhoto, setBrokenPhoto] = useState<string | null>(null);
    const photoInput = useRef<HTMLInputElement>(null);
    const photoButton = useRef<HTMLButtonElement>(null);
    const editButton = useRef<HTMLButtonElement>(null);
    const formElement = useRef<HTMLFormElement>(null);
    const pendingFocus = useRef<'identity' | 'photo' | 'edit' | undefined>(initialEditSection);

    useEffect(() => {
        const file = form.data.photo;
        if (!(file instanceof File)) {
            setPreview(null);
            return;
        }
        const url = URL.createObjectURL(file);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [form.data.photo]);

    useEffect(() => {
        const destination = pendingFocus.current;
        if (!destination) return;
        const frame = requestAnimationFrame(() => {
            pendingFocus.current = undefined;
            if (destination === 'edit') {
                editButton.current?.focus();
            } else {
                document.getElementById(`profile-heading-${destination}`)?.focus();
            }
        });
        return () => cancelAnimationFrame(frame);
    }, [editing]);

    const startEditing = () => {
        const data = profileData(profile.values);
        form.setDefaults(data);
        form.setData(data);
        form.clearErrors();
        pendingFocus.current = 'identity';
        setEditing(true);
    };
    const finishEditing = () => {
        pendingFocus.current = 'edit';
        setEditing(false);
    };
    const cancelEditing = () => {
        form.setData(profileData(profile.values));
        form.clearErrors();
        finishEditing();
    };

    const dateToday = editing ? localDate(new Date().toISOString()) : '';
    const field = ({ name, label, type, options, required, maxLength, autoComplete }: Field) => {
        const error = form.errors[name];
        const common = {
            id: `profile-${name}`,
            name,
            value: String(form.data[name] ?? ''),
            onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
                form.setData(name, event.target.value),
            required,
            autoComplete,
            'aria-invalid': Boolean(error),
            'aria-describedby': error ? `profile-error-${name}` : undefined,
        };
        return (
            <div className={`profile-field${type === 'textarea' ? 'is-wide' : ''}`} key={name}>
                <label htmlFor={common.id}>
                    {label}
                    {required && <span aria-hidden="true"> *</span>}
                </label>
                {options ? (
                    <select {...common}>
                        <option value="">Sélectionner</option>
                        {options.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                ) : type === 'textarea' ? (
                    <textarea {...common} rows={3} maxLength={maxLength} />
                ) : (
                    <input
                        {...common}
                        type={type ?? 'text'}
                        maxLength={maxLength}
                        min={type === 'number' ? 1900 : undefined}
                        max={type === 'date' ? dateToday : type === 'number' ? dateToday.slice(0, 4) : undefined}
                    />
                )}
                {error && (
                    <p id={`profile-error-${name}`} className="profile-field-error">
                        {error}
                    </p>
                )}
            </div>
        );
    };

    const values = editing ? form.data : profile.values;
    const provinceField: Field = {
        name: 'province',
        label: 'Province d’origine',
        options: [...profile.provinces.map((value) => ({ value, label: value })), { value: 'other', label: 'Autre' }],
    };
    const address = [...addressFields.slice(0, 2), provinceField, ...addressFields.slice(2)];
    if (values.province === 'other')
        address.splice(3, 0, { name: 'other_province', label: 'Précisez la province / région', required: true, maxLength: 150 });
    const diploma: Field[] = [{ name: 'diploma_type', label: 'Type de diplôme', options: diplomaTypes }, ...diplomaFields];
    if (values.diploma_type === 'other')
        diploma.splice(1, 0, { name: 'other_diploma', label: 'Précisez le diplôme', required: true, maxLength: 150 });
    const contact = [...contactFields];
    if (editing && form.data.email !== (profile.values.email ?? '')) {
        contact.push({
            name: 'email_current_password',
            label: 'Mot de passe actuel',
            type: 'password',
            autoComplete: 'current-password',
            required: true,
        });
    }

    const clearPhoto = () => {
        form.setData('photo', null);
        if (photoInput.current) photoInput.current.value = '';
    };
    const savedPhoto = academic.photo_url && brokenPhoto !== academic.photo_url ? academic.photo_url : null;
    const shownPhoto = editing ? (form.data.remove_photo ? null : (preview ?? savedPhoto)) : savedPhoto;
    const fullName = [profile.values.first_name, profile.values.post_name, profile.values.last_name].filter(Boolean).join(' ');
    const primarySections = (
        <>
            <PersonalCard id="identity" title="Identité" icon={IdCard}>
                {editing ? (
                    <div className="profile-fields">{identityFields.map(field)}</div>
                ) : (
                    <PersonalValues fields={identitySummaryFields} values={{ ...profile.values, full_name: fullName }} />
                )}
            </PersonalCard>
            <PersonalCard id="contact" title="Contact" icon={Phone}>
                {editing ? (
                    <div className="profile-fields">
                        {contact.map(field)}
                        <div className="profile-field">
                            <label htmlFor="profile-code">Matricule</label>
                            <input id="profile-code" value={academic.matricule || 'Non attribué'} readOnly />
                        </div>
                        {contact.length > contactFields.length && (
                            <p className="profile-field-help is-wide">Votre nouvelle adresse email devra être vérifiée après l’enregistrement.</p>
                        )}
                    </div>
                ) : (
                    <PersonalValues
                        fields={[...contact, { name: 'matricule', label: 'Matricule' }]}
                        values={{ ...profile.values, matricule: academic.matricule || 'Non attribué' }}
                    />
                )}
            </PersonalCard>
            <PersonalCard id="origin" title="Adresse et origine" icon={MapPin}>
                {editing ? <div className="profile-fields">{address.map(field)}</div> : <PersonalValues fields={address} values={profile.values} />}
            </PersonalCard>
        </>
    );
    const additionalSections = (
        <>
            <PersonalCard id="emergency" title="Contact d’urgence" icon={Phone}>
                {editing ? (
                    <div className="profile-fields">{emergencyFields.map(field)}</div>
                ) : (
                    <PersonalValues fields={emergencyFields} values={profile.values} />
                )}
            </PersonalCard>
            <PersonalCard id="diploma" title="Diplôme d’accès" icon={GraduationCap}>
                {editing ? <div className="profile-fields">{diploma.map(field)}</div> : <PersonalValues fields={diploma} values={profile.values} />}
            </PersonalCard>
            <PersonalCard id="photo" title="Photo de profil" icon={Camera}>
                <div className="profile-personal-photo">
                    <div className="profile-photo-preview">
                        {shownPhoto ? (
                            <img
                                src={shownPhoto}
                                alt="Photo de profil"
                                width={76}
                                height={76}
                                onError={() => {
                                    if (shownPhoto !== preview) setBrokenPhoto(shownPhoto);
                                }}
                            />
                        ) : (
                            <UserRound size={32} aria-hidden="true" />
                        )}
                    </div>
                    {editing ? (
                        <div className="profile-personal-photo-controls">
                            <button
                                ref={photoButton}
                                type="button"
                                className="profile-personal-secondary"
                                onClick={() => photoInput.current?.click()}
                            >
                                <Camera size={17} aria-hidden="true" /> {preview ? 'Choisir une autre photo' : 'Choisir une photo'}
                            </button>
                            <input
                                ref={photoInput}
                                id="profile-photo"
                                name="photo"
                                aria-label="Photo de profil"
                                type="file"
                                className="sr-only"
                                tabIndex={-1}
                                accept="image/jpeg,image/png,image/webp"
                                aria-invalid={Boolean(form.errors.photo)}
                                aria-describedby="profile-photo-help"
                                onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (!file) return;
                                    form.setData((data) => ({ ...data, photo: file, remove_photo: false }));
                                }}
                            />
                            <p id="profile-photo-help" className="profile-field-help">
                                JPG, PNG ou WebP · 5 Mo maximum
                            </p>
                            {preview && (
                                <button type="button" className="profile-text-button" onClick={clearPhoto}>
                                    Annuler la sélection
                                </button>
                            )}
                            {academic.photo_url && (
                                <label className="profile-photo-reset">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(form.data.remove_photo)}
                                        onChange={(event) => {
                                            const remove = event.target.checked;
                                            form.setData((data) => ({ ...data, remove_photo: remove, photo: remove ? null : data.photo }));
                                            if (remove && photoInput.current) photoInput.current.value = '';
                                        }}
                                    />
                                    Revenir à la photo du dossier d’inscription
                                </label>
                            )}
                            {form.errors.photo && (
                                <p className="profile-field-error" role="alert">
                                    {form.errors.photo}
                                </p>
                            )}
                        </div>
                    ) : (
                        <p className="profile-field-help">{shownPhoto ? 'Votre photo actuelle' : 'Aucune photo disponible'}</p>
                    )}
                </div>
            </PersonalCard>
        </>
    );

    return (
        <div className="profile-personal">
            {!editing ? (
                <>
                    <div className="profile-personal-grid">{primarySections}</div>
                    <details className="profile-personal-more">
                        <summary>
                            Autres informations
                            <ChevronDown size={18} aria-hidden="true" />
                        </summary>
                        <div className="profile-personal-grid">{additionalSections}</div>
                    </details>
                    <div className="profile-personal-edit">
                        <button ref={editButton} type="button" className="profile-personal-primary" onClick={startEditing}>
                            <PencilLine size={18} aria-hidden="true" /> Modifier mes informations
                        </button>
                    </div>
                </>
            ) : (
                <form
                    className="profile-personal-form"
                    ref={formElement}
                    aria-label="Modifier mes informations"
                    encType="multipart/form-data"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const view = initialEditSection === 'photo' ? 'photo' : 'personal';
                        form.post(`/app/dashboard/student/profile?academic=${academic.id}&view=${view}`, {
                            forceFormData: true,
                            preserveScroll: true,
                            onSuccess: (page) => {
                                const saved = (page.props as unknown as Pick<PortalProps, 'profile_form'>).profile_form;
                                if (saved) {
                                    const data = profileData(saved.values);
                                    form.setDefaults(data);
                                    form.setData(data);
                                } else {
                                    form.reset('email_current_password', 'photo', 'remove_photo');
                                }
                                finishEditing();
                                onFeedback('Votre profil a été enregistré avec succès.');
                            },
                            onError: () => {
                                form.reset('email_current_password');
                                requestAnimationFrame(() => {
                                    const invalid = formElement.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
                                    const target = invalid === photoInput.current ? photoButton.current : invalid;
                                    (target ?? formElement.current?.querySelector<HTMLElement>('.profile-error-summary'))?.focus();
                                });
                            },
                        });
                    }}
                >
                    <div className="profile-personal-toolbar">
                        <p className="profile-field-help">Les champs marqués d’un astérisque sont obligatoires.</p>
                        <button type="button" className="profile-personal-secondary" disabled={form.processing} onClick={cancelEditing}>
                            Annuler
                        </button>
                    </div>
                    {Object.keys(form.errors).length > 0 && (
                        <p className="profile-error-summary" role="alert" tabIndex={-1}>
                            Vérifiez les champs signalés ci-dessous.
                        </p>
                    )}
                    <div className="profile-personal-grid">
                        {primarySections}
                        {additionalSections}
                    </div>
                    <footer className="profile-personal-save">
                        <button type="submit" className="profile-personal-primary" disabled={form.processing}>
                            {form.processing ? (
                                <LoaderCircle size={18} className="profile-save-spinner" aria-hidden="true" />
                            ) : (
                                <Save size={18} aria-hidden="true" />
                            )}
                            {form.processing ? 'Enregistrement…' : 'Enregistrer mon profil'}
                        </button>
                    </footer>
                </form>
            )}
        </div>
    );
}

export function StudentPasswordModal({
    academic,
    onClose,
    onFeedback,
}: {
    academic: number;
    onClose: () => void;
    onFeedback: (message: string) => void;
}) {
    const form = useForm({ current_password: '', password: '', password_confirmation: '' });
    const [visible, setVisible] = useState(false);
    return (
        <Dialog.Root
            open
            onOpenChange={(open) => {
                if (!open && !form.processing) {
                    form.reset();
                    onClose();
                }
            }}
        >
            <Dialog.Portal>
                <Dialog.Overlay className="profile-password-overlay" />
                <Dialog.Content
                    onOpenAutoFocus={(event) => {
                        event.preventDefault();
                        document.getElementById('security-current_password')?.focus();
                    }}
                    className="profile-password-modal"
                    onEscapeKeyDown={(event) => {
                        if (form.processing) event.preventDefault();
                    }}
                    onInteractOutside={(event) => {
                        if (form.processing) event.preventDefault();
                    }}
                >
                    <Dialog.Close className="profile-password-close" aria-label="Fermer le changement de mot de passe" disabled={form.processing}>
                        <X size={20} />
                    </Dialog.Close>
                    <div className="profile-password-icon">
                        <KeyRound size={25} strokeWidth={1.5} />
                    </div>
                    <Dialog.Title>Changer votre mot de passe</Dialog.Title>
                    <Dialog.Description>
                        Choisissez un mot de passe personnel d’au moins 8 caractères, avec des lettres et des chiffres.
                    </Dialog.Description>
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            form.post(`/app/dashboard/student/profile/password?academic=${academic}&view=settings`, {
                                errorBag: 'studentPassword',
                                preserveScroll: true,
                                onSuccess: () => {
                                    form.reset();
                                    onClose();
                                    onFeedback('Votre mot de passe a été modifié.');
                                },
                                onError: () => form.reset('password', 'password_confirmation'),
                            });
                        }}
                    >
                        {(['current_password', 'password', 'password_confirmation'] as const).map((key, index) => (
                            <div className="profile-field" key={key}>
                                <label htmlFor={`security-${key}`}>
                                    {['Mot de passe actuel', 'Nouveau mot de passe', 'Confirmer le nouveau mot de passe'][index]}
                                </label>
                                <input
                                    id={`security-${key}`}
                                    type={visible ? 'text' : 'password'}
                                    required
                                    autoComplete={index === 0 ? 'current-password' : 'new-password'}
                                    value={form.data[key]}
                                    onChange={(event) => form.setData(key, event.target.value)}
                                    aria-invalid={Boolean(form.errors[key])}
                                    aria-describedby={form.errors[key] ? `security-error-${key}` : undefined}
                                />
                                {form.errors[key] && (
                                    <p className="profile-field-error" id={`security-error-${key}`}>
                                        {form.errors[key]}
                                    </p>
                                )}
                            </div>
                        ))}
                        <button type="button" className="profile-text-button" onClick={() => setVisible(!visible)}>
                            {visible ? <EyeOff size={15} /> : <Eye size={15} />} {visible ? 'Masquer' : 'Afficher'} les mots de passe
                        </button>
                        <div className="profile-password-actions">
                            <button
                                type="button"
                                disabled={form.processing}
                                onClick={() => {
                                    form.reset();
                                    onClose();
                                }}
                            >
                                Annuler
                            </button>
                            <button type="submit" disabled={form.processing}>
                                {form.processing && <LoaderCircle size={16} className="animate-spin" />}
                                {form.processing ? 'Modification…' : 'Modifier le mot de passe'}
                            </button>
                        </div>
                    </form>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

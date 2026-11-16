import Pagination from '@/components/admin/Pagination';
import { Link } from '@inertiajs/react';
import {
    Archive,
    ArrowLeft,
    ArrowUpRight,
    BookOpen,
    ChevronDown,
    Download,
    Eye,
    FileText,
    Headphones,
    History,
    Link2,
    Pencil,
    Video,
} from 'lucide-react';
import '../../../../css/dashboard/teacher-learning-resource.css';
import { dateTime } from './types';

type Resource = {
    id: number;
    title: string;
    course: string;
    section: string | null;
    kind: string;
    body: string | null;
    url: string | null;
    is_published: boolean;
    archived_at: string | null;
    published_at: string | null;
    updated_at: string | null;
    current_version: number | null;
    filename: string | null;
    size_bytes: number | null;
    download_url: string | null;
    preview_url: string | null;
};

type Version = {
    number: number;
    reason: string | null;
    author_id: number | null;
    created_at: string | null;
    edition: { title: string; filename: string | null; body: string | null; url: string | null };
    download_url: string | null;
};

type Props = {
    resource: Resource;
    libraryHref: string;
    fileStatus: 'available' | 'missing' | 'unavailable' | null;
    canManage: boolean;
    versions: { data: Version[]; total: number } | null;
    onEdit: () => void;
    onPublish: (action: 'publish' | 'withdraw' | 'archive') => void;
    onReuse: (version?: number) => void;
};

const formats = {
    material: { label: 'Support', icon: FileText },
    syllabus: { label: 'Syllabus', icon: BookOpen },
    online: { label: 'Lien', icon: Link2 },
    video: { label: 'Vidéo', icon: Video },
    audio: { label: 'Audio', icon: Headphones },
};

const publicationStates = { draft: 'Brouillon', published: 'Publié', archived: 'Archivé' };
const fileSize = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const externalLink = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null);

function displayDate(value: string | null) {
    return value && Number.isFinite(Date.parse(value)) ? dateTime(value) : null;
}

function displaySize(bytes: number | null) {
    if (bytes === null) return null;
    if (bytes >= 1024 ** 2) return `${fileSize.format(bytes / 1024 ** 2)} Mo`;
    if (bytes >= 1024) return `${fileSize.format(bytes / 1024)} Ko`;
    return `${fileSize.format(bytes)} o`;
}

function ResourceHistory({ versions, canManage, onReuse }: Pick<Props, 'canManage' | 'onReuse'> & { versions: NonNullable<Props['versions']> }) {
    return (
        <details className="teacher-learning-resource-history">
            <summary>
                <History size={18} aria-hidden="true" />
                Historique des versions
                <ChevronDown size={17} aria-hidden="true" />
            </summary>
            {versions.data.length ? (
                <>
                    <ol>
                        {versions.data.map((version) => {
                            const editionDate = displayDate(version.created_at);
                            const link = externalLink(version.edition.url);
                            return (
                                <li key={version.number}>
                                    <details>
                                        <summary>
                                            <span>
                                                <strong>
                                                    Version {version.number} · {version.edition.title}
                                                </strong>
                                                {editionDate && version.created_at && <time dateTime={version.created_at}>{editionDate}</time>}
                                            </span>
                                            <ChevronDown size={16} aria-hidden="true" />
                                        </summary>
                                        {version.author_id && <p>Auteur n°{version.author_id}</p>}
                                        {version.reason && <p>{version.reason}</p>}
                                        {version.edition.body && <p className="teacher-learning-resource-text">{version.edition.body}</p>}
                                        <div className="learning-actions">
                                            {link && (
                                                <a href={link} target="_blank" rel="noopener noreferrer">
                                                    Ouvrir le lien <ArrowUpRight size={15} aria-hidden="true" />
                                                </a>
                                            )}
                                            {version.download_url && (
                                                <a href={version.download_url}>
                                                    <Download size={15} aria-hidden="true" /> Télécharger cette version
                                                </a>
                                            )}
                                            {canManage && (
                                                <button type="button" className="learning-button" onClick={() => onReuse(version.number)}>
                                                    Réutiliser cette version
                                                </button>
                                            )}
                                        </div>
                                    </details>
                                </li>
                            );
                        })}
                    </ol>
                    <Pagination value={versions} preserveState />
                </>
            ) : (
                <p>L’édition historique sera enregistrée au premier remplacement.</p>
            )}
        </details>
    );
}

export default function TeacherLearningResource({ resource, libraryHref, fileStatus, canManage, versions, onEdit, onPublish, onReuse }: Props) {
    const { label, icon: Icon } = formats[resource.kind as keyof typeof formats] ?? formats.material;
    const state = resource.archived_at ? 'archived' : resource.is_published ? 'published' : 'draft';
    const fileSizeLabel = displaySize(resource.size_bytes);
    const fileUnavailable = fileStatus === 'missing' || fileStatus === 'unavailable';
    const url = externalLink(resource.url);
    const facts = [
        { label: 'Fichier', value: resource.filename },
        { label: 'Taille', value: fileSizeLabel },
        { label: 'Version', value: resource.current_version ? String(resource.current_version) : null },
        { label: 'Dernière modification', date: resource.updated_at, value: displayDate(resource.updated_at) },
        { label: 'Publié le', date: resource.published_at, value: displayDate(resource.published_at) },
        { label: 'Archivé le', date: resource.archived_at, value: displayDate(resource.archived_at) },
    ].filter(({ value }) => value !== null);

    return (
        <section
            id="learning-selected"
            className="portal-panel learning-panel learning-selected teacher-learning-resource"
            aria-labelledby="teacher-learning-resource-heading"
            data-resource-id={resource.id}
        >
            <Link className="teacher-learning-resource-back" href={libraryHref}>
                <ArrowLeft size={17} aria-hidden="true" /> Retour à la bibliothèque
            </Link>

            <header className="teacher-learning-resource-intro">
                <span className="learning-item-icon" aria-hidden="true">
                    <Icon size={25} />
                </span>
                <div className="teacher-learning-resource-identity">
                    <p>{[resource.course, resource.section].filter(Boolean).join(' · ')}</p>
                    <h2 id="teacher-learning-resource-heading" tabIndex={-1}>
                        {resource.title}
                    </h2>
                    <div className="teacher-learning-resource-badges">
                        <span className="learning-count">{label}</span>
                        <span className="learning-state" data-state={state}>
                            {publicationStates[state]}
                        </span>
                    </div>
                </div>
            </header>

            {fileUnavailable && (
                <p className="teacher-learning-resource-alert" role="status">
                    Fichier indisponible dans le stockage configuré.
                </p>
            )}
            {((!fileUnavailable && (resource.download_url || resource.preview_url)) || url) && (
                <div className="learning-actions teacher-learning-resource-links">
                    {!fileUnavailable && resource.download_url && (
                        <a className="learning-button is-primary" href={resource.download_url}>
                            <Download size={18} aria-hidden="true" /> Télécharger le fichier
                        </a>
                    )}
                    {!fileUnavailable && resource.preview_url && (
                        <a href={resource.preview_url} target="_blank" rel="noopener noreferrer">
                            <Eye size={17} aria-hidden="true" /> Aperçu du fichier
                        </a>
                    )}
                    {url && (
                        <a
                            className={!resource.download_url || fileUnavailable ? 'learning-button is-primary' : undefined}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <ArrowUpRight size={17} aria-hidden="true" /> Ouvrir le lien externe
                        </a>
                    )}
                </div>
            )}

            {(resource.body || facts.length > 0) && (
                <div className="teacher-learning-resource-content">
                    {resource.body && (
                        <div className="teacher-learning-resource-notes">
                            <h3>Contenu du support</h3>
                            <p className="teacher-learning-resource-text">{resource.body}</p>
                        </div>
                    )}
                    {facts.length > 0 && (
                        <div className="teacher-learning-resource-info">
                            <h3>Informations</h3>
                            <dl>
                                {facts.map(({ label: name, value, date }) => (
                                    <div key={name}>
                                        <dt>{name}</dt>
                                        <dd>{date ? <time dateTime={date}>{value}</time> : value}</dd>
                                    </div>
                                ))}
                            </dl>
                        </div>
                    )}
                </div>
            )}

            {canManage && (
                <div className="teacher-learning-resource-manage" role="group" aria-labelledby="teacher-learning-resource-manage-heading">
                    <h3 id="teacher-learning-resource-manage-heading">Gestion du support</h3>
                    <div className="learning-actions">
                        {!resource.archived_at && (
                            <>
                                <button type="button" className="learning-button" onClick={onEdit}>
                                    <Pencil size={16} aria-hidden="true" /> Modifier
                                </button>
                                <button
                                    type="button"
                                    className="learning-button"
                                    onClick={() => onPublish(resource.is_published ? 'withdraw' : 'publish')}
                                >
                                    {resource.is_published ? 'Retirer' : 'Publier'}
                                </button>
                            </>
                        )}
                        <button type="button" className="learning-button" onClick={() => onReuse()}>
                            Réutiliser
                        </button>
                        {!resource.archived_at && (
                            <button type="button" className="learning-button" onClick={() => onPublish('archive')}>
                                <Archive size={16} aria-hidden="true" /> Archiver
                            </button>
                        )}
                    </div>
                </div>
            )}
            {versions && <ResourceHistory versions={versions} canManage={canManage} onReuse={onReuse} />}
        </section>
    );
}

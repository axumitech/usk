import Pagination from '@/components/admin/Pagination';
import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import { studentHref } from '@/components/student/navigation';
import { StudentYearSelect, type StudentChromeData } from '@/components/student/StudentChrome';
import { zone } from '@/lib/scheduleDates';
import { Head, Link } from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowUpRight,
    BookOpen,
    Bookmark,
    CalendarDays,
    ChevronDown,
    ChevronRight,
    Clock3,
    Download,
    Eye,
    FileAudio,
    FileText,
    Film,
    FolderOpen,
    HardDrive,
    Layers,
    Link2,
    Share2,
    UserRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import '../../../../css/student-materials.css';
import '../../../../css/student-schedule.css';

export type Material = {
    id: number;
    title: string;
    course: string;
    teacher: string | null;
    category: string;
    category_label: string;
    date: string | null;
    size_bytes: number | null;
    format: string | null;
    filename: string | null;
    kind: string;
    mime?: string | null;
    description: string | null;
    preview_url: string | null;
    download_url: string | null;
    detail_url: string;
    source_url: string | null;
    share_url?: string;
    recent: boolean;
    unavailable_reason?: string | null;
};

type StudentMaterials = {
    academic_id: number;
    year: string;
    level: string;
    filter: string;
    stats: { total: number; courses: number; recent: number };
    filters: { key: string; label: string; count: number; url: string }[];
    items: { data: Material[]; links: { url: string | null; label: string; active: boolean }[]; total: number };
    selected: Material | null;
    related: Material[];
    index_url: string;
};

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { timeZone: zone, day: 'numeric', month: 'short', year: 'numeric' });
const detailDateFormatter = new Intl.DateTimeFormat('fr-FR', { timeZone: zone, dateStyle: 'long', timeStyle: 'short' });
const sizeFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

function formatSize(bytes: number | null) {
    if (bytes === null || bytes < 0) return null;
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 ** 2) return `${sizeFormatter.format(bytes / 1024)} Ko`;
    return `${sizeFormatter.format(bytes / 1024 ** 2)} Mo`;
}

function addedDate(value: string | null, detailed = false) {
    if (!value) return null;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    return (detailed ? detailDateFormatter : dateFormatter).format(date);
}

function MaterialIcon({ item }: { item: Material }) {
    const format = item.format?.toUpperCase();
    const Icon = item.kind === 'video' ? Film : item.kind === 'audio' ? FileAudio : item.source_url && !item.filename ? Link2 : FileText;
    return (
        <span className="material-file-icon" data-format={format}>
            <Icon size={23} aria-hidden="true" />
            {format && <span>{format}</span>}
        </span>
    );
}

function savedUrl(indexUrl: string, ids: number[], keepPage = false) {
    const [path, query] = indexUrl.split('?');
    const params = new URLSearchParams(query);
    params.set('filter', 'saved');
    if (ids.length) params.set('saved', ids.join(','));
    else params.delete('saved');
    if (!keepPage) params.delete('materials_page');
    return `${path}?${params}`;
}

function MaterialsCover({
    data,
    archived,
    saved,
    chrome,
}: {
    data: StudentMaterials;
    archived: boolean;
    saved: number[];
    chrome?: StudentChromeData | null;
}) {
    const item = data.selected;
    const keepRow = item && (data.filter !== 'saved' || saved.includes(item.id));
    const indexUrl = data.filter === 'saved' ? savedUrl(data.index_url, saved, Boolean(keepRow)) : data.index_url;
    return (
        <header className="student-agenda-header" data-year-state={archived ? 'archive' : 'current'}>
            <Link
                className="student-agenda-header-action"
                href={
                    item ? `${indexUrl}${keepRow ? `#support-${item.id}` : ''}` : studentHref('overview', data.academic_id, 'student-shortcuts-title')
                }
                aria-label={item ? 'Retour aux supports de cours' : 'Retour aux raccourcis'}
            >
                <ArrowLeft size={22} aria-hidden="true" />
            </Link>
            <div className="student-agenda-heading">
                <h1>{item?.title ?? 'Supports de cours'}</h1>
                {item ? (
                    <p>{item.course}</p>
                ) : chrome && chrome.options.length > 1 ? (
                    <label className="student-agenda-year">
                        <CalendarDays size={15} aria-hidden="true" />
                        <span className="whitespace-nowrap">{data.year}</span>
                        <ChevronDown size={14} aria-hidden="true" />
                        <StudentYearSelect context={chrome} section="materials" />
                    </label>
                ) : (
                    <p>
                        {data.year} · {data.level}
                    </p>
                )}
            </div>
        </header>
    );
}

function MaterialListRow({ item, related = false }: { item: Material; related?: boolean }) {
    const date = addedDate(item.date);
    const size = formatSize(item.size_bytes);
    return (
        <li id={related ? undefined : `support-${item.id}`} className="materials-list-row" data-related={related || undefined}>
            <Link className="materials-list-link" href={item.detail_url}>
                <MaterialIcon item={item} />
                <span className="materials-list-copy">
                    <span className="materials-list-course">
                        <Layers size={14} aria-hidden="true" /> {item.course}
                    </span>
                    <strong>{item.title}</strong>
                    {!related && item.teacher && <span className="materials-list-teacher">{item.teacher}</span>}
                    {(date || size || (!related && item.recent)) && (
                        <span className="materials-list-meta">
                            {date && <time dateTime={item.date ?? undefined}>{date}</time>}
                            {date && size && <span aria-hidden="true">·</span>}
                            {size}
                            {!related && item.recent && <span className="materials-new">Nouveau</span>}
                        </span>
                    )}
                </span>
                <ChevronRight className="materials-list-chevron" size={18} aria-hidden="true" />
            </Link>
            {!related && (item.preview_url || item.download_url) && (
                <div className="materials-list-actions">
                    {item.preview_url && (
                        <a href={item.preview_url} target="_blank" rel="noopener noreferrer" aria-label={`Aperçu · ${item.title}`} title="Aperçu">
                            <Eye size={19} aria-hidden="true" />
                        </a>
                    )}
                    {item.download_url && (
                        <a href={item.download_url} aria-label={`Télécharger · ${item.title}`} title="Télécharger">
                            <Download size={19} aria-hidden="true" />
                        </a>
                    )}
                </div>
            )}
        </li>
    );
}

function MaterialsList({ data, saved }: { data: StudentMaterials; saved: number[] }) {
    const counters = [
        { icon: FileText, label: 'Supports', value: data.stats.total },
        { icon: BookOpen, label: 'Cours', value: data.stats.courses },
        { icon: Clock3, label: 'Ajouts récents', value: data.stats.recent },
    ];
    return (
        <div className="student-agenda-body materials-body">
            <dl className="materials-counters" aria-label="Aperçu des supports">
                {counters.map(({ icon: Icon, label, value }) => (
                    <div key={label}>
                        <Icon size={22} aria-hidden="true" />
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                    </div>
                ))}
            </dl>
            <nav className="materials-filters" aria-label="Filtrer les supports">
                {data.filters
                    .filter(({ key }) => key !== 'saved')
                    .map((filter) => (
                        <Link key={filter.key} href={filter.url} aria-current={filter.key === data.filter ? 'page' : undefined} preserveScroll>
                            {filter.label} <span>({filter.count})</span>
                        </Link>
                    ))}
                <Link href={savedUrl(data.index_url, saved)} aria-current={data.filter === 'saved' ? 'page' : undefined} preserveScroll>
                    <Bookmark size={15} aria-hidden="true" /> Favoris
                </Link>
            </nav>
            {data.items.data.length ? (
                <ul className="materials-list" role="list">
                    {data.items.data.map((item) => (
                        <MaterialListRow key={item.id} item={item} />
                    ))}
                </ul>
            ) : (
                <div className="materials-empty">
                    <FolderOpen size={28} aria-hidden="true" />
                    <p>
                        {data.filter === 'saved'
                            ? 'Aucun support enregistré sur cet appareil.'
                            : data.filter === 'all'
                              ? 'Aucun support de cours publié pour cette inscription.'
                              : 'Aucun support dans cette catégorie.'}
                    </p>
                </div>
            )}
            <Pagination value={data.items} preserveScroll={false} />
        </div>
    );
}

function MaterialPreview({ item }: { item: Material }) {
    const url = item.preview_url;
    if (!url) return null;
    const mime = item.mime ?? '';
    return (
        <section className="material-preview" aria-labelledby="material-preview-heading">
            <h2 id="material-preview-heading">
                <Eye size={20} aria-hidden="true" /> Aperçu du document
            </h2>
            {mime.startsWith('image/') ? (
                <img src={url} alt={`Aperçu de ${item.title}`} loading="lazy" />
            ) : mime.startsWith('video/') ? (
                <video src={url} aria-label={item.title} controls preload="metadata" />
            ) : mime.startsWith('audio/') ? (
                <audio src={url} aria-label={item.title} controls preload="metadata" />
            ) : (
                <>
                    <iframe src={url} title={`Aperçu de ${item.title}`} loading="lazy" />
                    <a className="material-preview-open" href={url} target="_blank" rel="noopener noreferrer">
                        Ouvrir l’aperçu en grand <ArrowUpRight size={16} aria-hidden="true" />
                    </a>
                </>
            )}
        </section>
    );
}

function MaterialActions({ item, saved, toggleBookmark }: { item: Material; saved: boolean; toggleBookmark: () => boolean }) {
    const [feedback, setFeedback] = useState('');
    const [manualShare, setManualShare] = useState<string>();

    async function share() {
        if (!item.share_url) return;
        const url = new URL(item.share_url, window.location.origin).href;
        setFeedback('');
        setManualShare(undefined);
        if (navigator.share) {
            try {
                await navigator.share({ title: item.title, url });
                return;
            } catch (error) {
                if (error instanceof DOMException && error.name === 'AbortError') return;
            }
        }
        try {
            await navigator.clipboard.writeText(url);
            setFeedback('Lien du support copié.');
        } catch {
            setManualShare(url);
        }
    }

    return (
        <>
            <div className="materials-detail-actions">
                {item.download_url && (
                    <a className="material-primary" href={item.download_url}>
                        <Download size={19} aria-hidden="true" /> Télécharger
                    </a>
                )}
                {item.source_url && (
                    <a
                        className={item.download_url ? undefined : 'material-primary'}
                        href={item.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <ArrowUpRight size={19} aria-hidden="true" /> Ouvrir la ressource
                    </a>
                )}
                {item.preview_url && (
                    <a href="#material-preview-heading">
                        <Eye size={19} aria-hidden="true" /> Voir l’aperçu
                    </a>
                )}
                <button
                    type="button"
                    aria-pressed={saved}
                    onClick={() =>
                        setFeedback(
                            toggleBookmark()
                                ? saved
                                    ? 'Support retiré de vos favoris.'
                                    : 'Support enregistré sur cet appareil.'
                                : 'Impossible de modifier vos favoris sur cet appareil.',
                        )
                    }
                >
                    <Bookmark size={19} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" /> {saved ? 'Enregistré' : 'Enregistrer'}
                </button>
                {item.share_url && (
                    <button type="button" onClick={share}>
                        <Share2 size={19} aria-hidden="true" /> Partager
                    </button>
                )}
            </div>
            {feedback && (
                <p className="materials-feedback" role="status">
                    {feedback}
                </p>
            )}
            {manualShare && (
                <label className="materials-share-link">
                    Lien du support à copier
                    <input type="url" readOnly value={manualShare} onFocus={(event) => event.currentTarget.select()} />
                </label>
            )}
        </>
    );
}

function MaterialDetails({
    item,
    data,
    saved,
    toggleBookmark,
}: {
    item: Material;
    data: StudentMaterials;
    saved: boolean;
    toggleBookmark: () => boolean;
}) {
    const facts = [
        { icon: UserRound, label: 'Enseignant', value: item.teacher },
        { icon: CalendarDays, label: 'Date d’ajout', value: addedDate(item.date, true) },
        { icon: HardDrive, label: 'Taille', value: formatSize(item.size_bytes) },
    ].filter(({ value }) => Boolean(value));

    return (
        <div className="student-agenda-body materials-body materials-detail">
            <section className="material-detail-card" aria-labelledby="material-information">
                <header>
                    <MaterialIcon item={item} />
                    <div>
                        <h2 id="material-information">{item.category_label}</h2>
                        {item.filename && <p className="material-filename">{item.filename}</p>}
                    </div>
                </header>
                {facts.length > 0 && (
                    <dl className="material-facts">
                        {facts.map(({ icon: Icon, label, value }) => (
                            <div key={label}>
                                <dt>
                                    <Icon size={16} aria-hidden="true" /> {label}
                                </dt>
                                <dd>{value}</dd>
                            </div>
                        ))}
                    </dl>
                )}
            </section>
            {item.unavailable_reason && (
                <p className="materials-feedback" role="status">
                    {item.unavailable_reason}
                </p>
            )}
            <MaterialActions key={`${data.academic_id}-${item.id}`} item={item} saved={saved} toggleBookmark={toggleBookmark} />
            {item.description && (
                <section className="material-description" aria-labelledby="material-description-heading">
                    <h2 id="material-description-heading">
                        <FileText size={20} aria-hidden="true" /> Description
                    </h2>
                    <p>{item.description}</p>
                </section>
            )}
            <MaterialPreview item={item} />
            {data.related.length > 0 && (
                <section className="material-related" aria-labelledby="material-related-heading">
                    <h2 id="material-related-heading">
                        <Layers size={20} aria-hidden="true" /> Autres supports du même cours
                    </h2>
                    <ul className="materials-list" role="list">
                        {data.related.map((related) => (
                            <MaterialListRow item={related} key={related.id} related />
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}

function MaterialsPage({ materials, studentChrome }: { materials: StudentMaterials; studentChrome?: StudentChromeData | null }) {
    const option = studentChrome?.options.find(({ id }) => id === materials.academic_id);
    const selected = materials.selected;
    const [saved, setSaved] = useState<number[]>([]);
    const storageKey = `usk:material-bookmarks:${materials.academic_id}`;

    useEffect(() => {
        try {
            const ids: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]');
            if (Array.isArray(ids)) {
                const valid = ids.filter((id): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0);
                setSaved([...new Set(valid)].slice(0, 100));
            }
        } catch {
            setSaved([]);
        }
    }, [storageKey]);

    function toggleBookmark(id: number) {
        const next = saved.includes(id) ? saved.filter((item) => item !== id) : [id, ...saved].slice(0, 100);
        try {
            window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
            return false;
        }
        setSaved(next);
        return true;
    }

    return (
        <Dashboard>
            <Head title={materials.selected?.title ?? 'Supports de cours'} />
            <div className="student-materials student-agenda">
                <MaterialsCover data={materials} archived={Boolean(option && !option.is_current)} saved={saved} chrome={studentChrome} />
                {selected ? (
                    <MaterialDetails
                        item={selected}
                        data={materials}
                        saved={saved.includes(selected.id)}
                        toggleBookmark={() => toggleBookmark(selected.id)}
                    />
                ) : (
                    <MaterialsList data={materials} saved={saved} />
                )}
            </div>
        </Dashboard>
    );
}

export default function Materials(props: { materials: StudentMaterials; studentChrome?: StudentChromeData | null }) {
    return <MaterialsPage key={props.materials.academic_id} {...props} />;
}

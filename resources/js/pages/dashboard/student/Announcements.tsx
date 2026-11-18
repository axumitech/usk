import Pagination from '@/components/admin/Pagination';
import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import { studentHref } from '@/components/student/navigation';
import { StudentYearSelect, type StudentChromeData } from '@/components/student/StudentChrome';
import type { AnnouncementKind } from '@/components/student/types';
import { zone } from '@/lib/scheduleDates';
import { Head, Link, usePoll } from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowUpRight,
    Bookmark,
    CalendarDays,
    Check,
    ChevronDown,
    ChevronRight,
    Clock3,
    Download,
    FileText,
    Image,
    Images,
    Landmark,
    Megaphone,
    Play,
    Share2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import '../../../../css/student-announcements.css';
import '../../../../css/student-schedule.css';

type Announcement = {
    id: number;
    kind: AnnouncementKind;
    title: string;
    course: string | null;
    faculty: string | null;
    date: string | null;
    recent: boolean;
    excerpt: string | null;
    description: string | null;
    filename: string | null;
    format: string | null;
    size_bytes: number | null;
    preview_url: string | null;
    download_url: string | null;
    source_url: string | null;
    detail_url: string;
    share_url: string;
};

type StudentAnnouncements = {
    academic_id: number;
    year: string;
    faculty: string | null;
    filter: string;
    index_url: string;
    stats: { total: number; recent: number; media: number };
    filters: { key: string; label: string; count: number; url: string }[];
    items: { data: Announcement[]; links: { url: string | null; label: string; active: boolean }[]; total: number };
    featured: Announcement | null;
    selected: Announcement | null;
    related: Announcement[];
};

type AnnouncementMarks = { saved: number[]; read: number[] };

const emptyMarks: AnnouncementMarks = { saved: [], read: [] };
const mediaKinds = {
    text: { Icon: Megaphone, label: 'Annonce' },
    photo: { Icon: Image, label: 'Photo' },
    video: { Icon: Play, label: 'Vidéo' },
    document: { Icon: FileText, label: 'Document' },
};

const filterIcons = { all: Megaphone, photo: Image, video: Play, document: FileText };
const shortDate = new Intl.DateTimeFormat('fr-FR', { timeZone: zone, dateStyle: 'medium' });
const longDate = new Intl.DateTimeFormat('fr-FR', { timeZone: zone, dateStyle: 'long', timeStyle: 'short' });
const sizeNumber = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

function formatSize(bytes: number | null) {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return null;
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 ** 2) return `${sizeNumber.format(bytes / 1024)} Ko`;
    return `${sizeNumber.format(bytes / 1024 ** 2)} Mo`;
}

function AnnouncementDate({ date, detailed }: { date: string | null; detailed?: boolean }) {
    if (!date || !Number.isFinite(Date.parse(date))) return null;
    return (
        <span className="announcement-meta-item">
            <CalendarDays size={15} aria-hidden="true" />
            <time dateTime={date}>{(detailed ? longDate : shortDate).format(new Date(date))}</time>
        </span>
    );
}

function savedUrl(indexUrl: string, saved: number[], keepPage = false) {
    const [path, query] = indexUrl.split('?');
    const params = new URLSearchParams(query);
    params.set('filter', 'saved');
    if (saved.length) params.set('saved', saved.join(','));
    else params.delete('saved');
    if (!keepPage) params.delete('announcements_page');
    return `${path}?${params}`;
}

function storedIds(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((id): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0))];
}

function useAnnouncementMarks(academic: number) {
    const storageKey = `usk:announcements:${academic}`;
    const [marks, setMarks] = useState(emptyMarks);

    useEffect(() => {
        try {
            const parsed: Partial<AnnouncementMarks> | null = JSON.parse(window.localStorage.getItem(storageKey) ?? 'null');
            setMarks({ saved: storedIds(parsed?.saved).slice(0, 100), read: storedIds(parsed?.read) });
        } catch {
            setMarks(emptyMarks);
        }
    }, [storageKey]);

    function setMarked(key: keyof AnnouncementMarks, id: number, enabled: boolean) {
        const next = enabled ? [id, ...marks[key].filter((item) => item !== id)] : marks[key].filter((item) => item !== id);
        const updated = { ...marks, [key]: key === 'saved' ? next.slice(0, 100) : next };
        try {
            window.localStorage.setItem(storageKey, JSON.stringify(updated));
            setMarks(updated);
            return true;
        } catch {
            return false;
        }
    }

    return { marks, setMarked };
}

function AnnouncementHeader({ data, chrome, saved }: { data: StudentAnnouncements; chrome?: StudentChromeData | null; saved: number[] }) {
    const selected = data.selected;
    const archived = chrome?.options?.some(({ id, is_current }) => id === data.academic_id && !is_current);
    const keepRow = selected && (data.filter !== 'saved' || saved.includes(selected.id));
    const back = data.filter === 'saved' ? savedUrl(data.index_url, saved, Boolean(keepRow)) : data.index_url;
    return (
        <header className="student-agenda-header announcement-header" data-year-state={archived ? 'archive' : 'current'}>
            <Link
                className="student-agenda-header-action"
                href={
                    selected
                        ? `${back}${keepRow ? `#resource-${selected.id}` : ''}`
                        : studentHref('overview', data.academic_id, 'student-shortcuts-title')
                }
                aria-label={selected ? 'Retour aux annonces' : 'Retour aux raccourcis'}
            >
                <ArrowLeft size={22} aria-hidden="true" />
            </Link>
            <div className="student-agenda-heading">
                <h1>{selected ? 'Détail de l’annonce' : 'Annonces'}</h1>
                {!selected && data.faculty && <p>{data.faculty}</p>}
                {!selected &&
                    (chrome && chrome.options?.length > 1 ? (
                        <label className="student-agenda-year">
                            <CalendarDays size={15} aria-hidden="true" />
                            <span>{data.year}</span>
                            <ChevronDown size={14} aria-hidden="true" />
                            <StudentYearSelect context={chrome} section="announcements" />
                        </label>
                    ) : (
                        <p>{data.year}</p>
                    ))}
            </div>
            <Megaphone className="announcement-header-icon" size={24} aria-hidden="true" />
        </header>
    );
}

function AnnouncementThumbnail({ item }: { item: Announcement }) {
    const { Icon, label } = mediaKinds[item.kind];
    const photo = item.kind === 'photo' && item.preview_url;
    return (
        <span className="announcement-thumb" data-kind={item.kind} aria-hidden="true">
            <span className="announcement-thumb-symbol">
                <Icon size={23} />
                {item.kind === 'document' && <small>{item.format || label}</small>}
            </span>
            {photo && <img src={photo} alt="" loading="lazy" onError={(event) => (event.currentTarget.hidden = true)} />}
        </span>
    );
}

function AnnouncementRow({ item, marks, related = false }: { item: Announcement; marks: AnnouncementMarks; related?: boolean }) {
    return (
        <li id={related ? undefined : `resource-${item.id}`} className="announcement-row">
            <Link href={item.detail_url}>
                <AnnouncementThumbnail item={item} />
                <div className="announcement-row-copy">
                    <div className="announcement-row-labels">
                        {item.kind !== 'text' && (
                            <span className="announcement-kind" data-kind={item.kind}>
                                {mediaKinds[item.kind].label}
                            </span>
                        )}
                        {item.recent && !marks.read.includes(item.id) && <span className="announcement-new">Nouveau</span>}
                        {marks.saved.includes(item.id) && (
                            <Bookmark className="announcement-bookmarked" size={15} fill="currentColor" aria-label="Enregistrée" role="img" />
                        )}
                    </div>
                    <strong>{item.title}</strong>
                    {(item.course || item.faculty) && (
                        <span className="announcement-meta-item">
                            <Landmark size={15} aria-hidden="true" /> {item.course || item.faculty}
                        </span>
                    )}
                    {!related && item.excerpt && <p>{item.excerpt}</p>}
                    <AnnouncementDate date={item.date} />
                </div>
                <ChevronRight className="announcement-row-chevron" size={19} aria-hidden="true" />
            </Link>
        </li>
    );
}

function FeaturedAnnouncement({ item }: { item: Announcement }) {
    const photo = item.kind === 'photo' && item.preview_url;
    return (
        <Link id={`resource-${item.id}`} className="announcement-feature" href={item.detail_url}>
            {photo && <img src={photo} alt="" fetchPriority="high" onError={(event) => (event.currentTarget.hidden = true)} />}
            <span className="announcement-feature-copy">
                <span className="announcement-feature-label">
                    <Megaphone size={15} aria-hidden="true" /> À la une
                </span>
                <strong>{item.title}</strong>
                <AnnouncementDate date={item.date} />
            </span>
            <span className="announcement-feature-arrow">
                <ArrowUpRight size={21} aria-hidden="true" />
            </span>
        </Link>
    );
}

function AnnouncementList({ data, marks }: { data: StudentAnnouncements; marks: AnnouncementMarks }) {
    const items = data.items.data.filter((item) => item.id !== data.featured?.id);
    const counters = [
        { Icon: Megaphone, label: 'Annonces', value: data.stats.total },
        { Icon: Clock3, label: 'Récentes', value: data.stats.recent },
        { Icon: Images, label: 'Avec média', value: data.stats.media },
    ];
    return (
        <div className="student-agenda-body announcement-list-body">
            <dl className="announcement-counters" aria-label="Aperçu des annonces">
                {counters.map(({ Icon, label, value }) => (
                    <div key={label}>
                        <Icon size={19} aria-hidden="true" />
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                    </div>
                ))}
            </dl>
            <nav className="announcement-filters" aria-label="Filtrer les annonces">
                {data.filters
                    .filter(({ key }) => key !== 'saved')
                    .map(({ key, label, count, url }) => {
                        const Icon = filterIcons[key as keyof typeof filterIcons];
                        return (
                            <Link key={key} href={url} aria-current={key === data.filter ? 'page' : undefined} preserveScroll>
                                {Icon && <Icon size={16} aria-hidden="true" />}
                                {label} <span>{count}</span>
                            </Link>
                        );
                    })}
                <Link href={savedUrl(data.index_url, marks.saved)} aria-current={data.filter === 'saved' ? 'page' : undefined} preserveScroll>
                    <Bookmark size={16} aria-hidden="true" /> Favoris
                </Link>
            </nav>
            {data.featured && <FeaturedAnnouncement item={data.featured} />}
            {items.length > 0 && (
                <section aria-labelledby="announcement-list-title">
                    <h2 id="announcement-list-title" className="announcement-section-title">
                        {data.filter === 'all' ? 'Dernières annonces' : 'Annonces'}
                    </h2>
                    <ul className="announcement-list" role="list">
                        {items.map((item) => (
                            <AnnouncementRow key={item.id} item={item} marks={marks} />
                        ))}
                    </ul>
                </section>
            )}
            {!items.length && !data.featured && (
                <div className="announcement-empty">
                    <Megaphone size={27} aria-hidden="true" />
                    <p>
                        {data.filter === 'saved'
                            ? 'Aucune annonce enregistrée sur cet appareil.'
                            : data.filter === 'all'
                              ? 'Aucune annonce publiée pour cette inscription.'
                              : 'Aucune annonce dans cette catégorie.'}
                    </p>
                </div>
            )}
            <Pagination value={data.items} preserveScroll={false} />
        </div>
    );
}

function AnnouncementMedia({ item }: { item: Announcement }) {
    const { Icon, label } = mediaKinds[item.kind];
    const [failedImage, setFailedImage] = useState(false);
    if (item.kind === 'photo' && item.preview_url) {
        return (
            <figure className="announcement-detail-media" data-kind="photo">
                {failedImage ? (
                    <p className="announcement-empty">
                        <Image size={25} aria-hidden="true" /> Aperçu de la photo indisponible.
                    </p>
                ) : (
                    <img src={item.preview_url} alt={`Photo associée à l’annonce ${item.title}`} onError={() => setFailedImage(true)} />
                )}
            </figure>
        );
    }
    if (item.kind === 'video' && (item.preview_url || item.source_url || item.download_url)) {
        return (
            <div className="announcement-detail-media" data-kind="video">
                {item.preview_url ? (
                    <video src={item.preview_url} controls playsInline preload="metadata" aria-label={item.title} />
                ) : (
                    <a
                        className="announcement-video-link"
                        href={item.source_url ?? item.download_url ?? undefined}
                        target={item.source_url ? '_blank' : undefined}
                        rel={item.source_url ? 'noopener noreferrer' : undefined}
                    >
                        <Icon size={25} fill="currentColor" aria-hidden="true" /> {item.source_url ? 'Voir la vidéo' : 'Télécharger la vidéo'}
                        {item.source_url ? <ArrowUpRight size={17} aria-hidden="true" /> : <Download size={17} aria-hidden="true" />}
                    </a>
                )}
            </div>
        );
    }
    if (item.kind === 'document' && (item.download_url || item.preview_url || item.source_url)) {
        const size = formatSize(item.size_bytes);
        return (
            <div className="announcement-document">
                <AnnouncementThumbnail item={item} />
                <span>
                    <strong>{item.filename || 'Document joint'}</strong>
                    <small>{[item.format || label, size].filter(Boolean).join(' · ')}</small>
                </span>
                {item.preview_url && (
                    <a href={item.preview_url} target="_blank" rel="noopener noreferrer">
                        Aperçu <ArrowUpRight size={15} aria-hidden="true" />
                    </a>
                )}
                {item.download_url && (
                    <a href={item.download_url} aria-label="Télécharger le document" title="Télécharger">
                        <Download size={19} aria-hidden="true" />
                    </a>
                )}
            </div>
        );
    }
    return null;
}

function AnnouncementActions({
    item,
    marks,
    setMarked,
}: {
    item: Announcement;
    marks: AnnouncementMarks;
    setMarked: ReturnType<typeof useAnnouncementMarks>['setMarked'];
}) {
    const [feedback, setFeedback] = useState('');
    const [manualShare, setManualShare] = useState('');
    const read = marks.read.includes(item.id);
    const saved = marks.saved.includes(item.id);

    function toggleMark(key: keyof AnnouncementMarks, marked: boolean, message: string) {
        setFeedback(setMarked(key, item.id, !marked) ? message : 'Impossible de conserver ce choix sur cet appareil.');
    }

    async function share() {
        const url = new URL(item.share_url, window.location.origin).href;
        setFeedback('');
        setManualShare('');
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
            setFeedback('Lien de l’annonce copié.');
        } catch {
            setManualShare(url);
        }
    }

    return (
        <div className="announcement-actions-wrap">
            <div className="announcement-actions">
                <button
                    className="announcement-read"
                    type="button"
                    aria-pressed={read}
                    onClick={() => toggleMark('read', read, read ? 'Annonce marquée comme non lue.' : 'Annonce marquée comme lue.')}
                >
                    <Check size={20} aria-hidden="true" /> {read ? 'Lue' : 'Marquer comme lue'}
                </button>
                <button
                    type="button"
                    aria-pressed={saved}
                    onClick={() => toggleMark('saved', saved, saved ? 'Annonce retirée des favoris.' : 'Annonce ajoutée aux favoris.')}
                >
                    <Bookmark size={18} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" /> {saved ? 'Enregistrée' : 'Enregistrer'}
                </button>
                <button type="button" onClick={share}>
                    <Share2 size={18} aria-hidden="true" /> Partager
                </button>
            </div>
            <p className="announcement-feedback" role="status">
                {feedback}
            </p>
            {manualShare && (
                <label className="announcement-manual-share">
                    Lien de l’annonce à copier
                    <input type="url" readOnly value={manualShare} onFocus={(event) => event.currentTarget.select()} />
                </label>
            )}
        </div>
    );
}

function AnnouncementDetail({
    item,
    related,
    marks,
    setMarked,
}: {
    item: Announcement;
    related: Announcement[];
    marks: AnnouncementMarks;
    setMarked: ReturnType<typeof useAnnouncementMarks>['setMarked'];
}) {
    const { Icon, label } = mediaKinds[item.kind];
    return (
        <div className="student-agenda-body announcement-detail-body">
            <article className="announcement-article" aria-labelledby="announcement-title">
                {item.kind !== 'document' && <AnnouncementMedia key={item.id} item={item} />}
                <div className="announcement-article-copy">
                    <span className="announcement-kind" data-kind={item.kind}>
                        <Icon size={15} aria-hidden="true" /> {label}
                    </span>
                    <h2 id="announcement-title">{item.title}</h2>
                    <div className="announcement-detail-meta">
                        {item.faculty && (
                            <span className="announcement-meta-item">
                                <Landmark size={16} aria-hidden="true" /> {item.faculty}
                            </span>
                        )}
                        {item.course && item.course !== item.faculty && <span>{item.course}</span>}
                        <AnnouncementDate date={item.date} detailed />
                    </div>
                    {item.description && <p className="announcement-description">{item.description}</p>}
                    {item.kind === 'document' && <AnnouncementMedia item={item} />}
                    {item.source_url && (item.kind !== 'video' || item.preview_url) && (
                        <a className="announcement-resource-link" href={item.source_url} target="_blank" rel="noopener noreferrer">
                            Ouvrir le lien associé <ArrowUpRight size={17} aria-hidden="true" />
                        </a>
                    )}
                    {item.kind === 'photo' && item.download_url && (
                        <a className="announcement-resource-link" href={item.download_url}>
                            Télécharger la photo <Download size={17} aria-hidden="true" />
                        </a>
                    )}
                </div>
            </article>
            <AnnouncementActions key={item.id} item={item} marks={marks} setMarked={setMarked} />
            {related.length > 0 && (
                <section aria-labelledby="announcement-related-title">
                    <h2 id="announcement-related-title" className="announcement-section-title">
                        Annonces liées
                    </h2>
                    <ul className="announcement-list" role="list">
                        {related.map((other) => (
                            <AnnouncementRow key={other.id} item={other} marks={marks} related />
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}

function AnnouncementsPage({ announcements, studentChrome }: { announcements: StudentAnnouncements; studentChrome?: StudentChromeData | null }) {
    const { marks, setMarked } = useAnnouncementMarks(announcements.academic_id);
    usePoll(30000, { only: ['announcements', 'studentChrome'] });
    return (
        <Dashboard>
            <Head title={announcements.selected?.title || 'Annonces'} />
            <div className="student-announcements student-agenda">
                <AnnouncementHeader data={announcements} chrome={studentChrome} saved={marks.saved} />
                {announcements.selected ? (
                    <AnnouncementDetail item={announcements.selected} related={announcements.related} marks={marks} setMarked={setMarked} />
                ) : (
                    <AnnouncementList data={announcements} marks={marks} />
                )}
            </div>
        </Dashboard>
    );
}

function normalizeAnnouncement(item: Announcement): Announcement {
    return { ...item, kind: typeof item.kind === 'string' && Object.hasOwn(mediaKinds, item.kind) ? item.kind : 'text' };
}

export default function Announcements(props: { announcements?: StudentAnnouncements | null; studentChrome?: StudentChromeData | null }) {
    const data = props.announcements;
    if (!data) {
        return (
            <Dashboard>
                <Head title="Annonces" />
                <div className="student-announcements student-agenda">
                    <div className="announcement-empty" role="alert">
                        <Megaphone size={27} aria-hidden="true" />
                        <h1>Annonces</h1>
                        <p>Les annonces sont momentanément indisponibles. Rechargez cette page pour réessayer.</p>
                    </div>
                </div>
            </Dashboard>
        );
    }
    const announcements = {
        ...data,
        stats: data.stats ?? { total: 0, recent: 0, media: 0 },
        filters: data.filters ?? [],
        items: { ...data.items, data: (data.items?.data ?? []).filter(Boolean).map(normalizeAnnouncement) },
        featured: data.featured ? normalizeAnnouncement(data.featured) : null,
        selected: data.selected ? normalizeAnnouncement(data.selected) : null,
        related: (data.related ?? []).filter(Boolean).map(normalizeAnnouncement),
    };

    return <AnnouncementsPage key={announcements.academic_id} announcements={announcements} studentChrome={props.studentChrome} />;
}

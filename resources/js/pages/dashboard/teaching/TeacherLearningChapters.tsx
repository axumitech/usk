import { Link } from '@inertiajs/react';
import { ChevronRight, FolderClosed, FolderOpen, Layers3, Pencil, Plus } from 'lucide-react';
import '../../../../css/dashboard/teacher-learning-chapters.css';

export type LearningChapter = { id: number; title: string; position: number; revision: number; support_count: number };
export type LearningChapterSelection = number | 'unassigned' | null;

type Props = {
    sections: LearningChapter[];
    selection: LearningChapterSelection;
    total: number;
    unassignedCount: number;
    href: (chapter: LearningChapterSelection) => string;
    onCreate?: () => void;
    onEdit?: (chapter: LearningChapter) => void;
};

const countFormat = new Intl.NumberFormat('fr-FR');

export default function TeacherLearningChapters({ sections, selection, total, unassignedCount, href, onCreate, onEdit }: Props) {
    return (
        <section className="portal-panel learning-panel learning-chapters" aria-labelledby="learning-chapters-heading">
            <div className="learning-section-heading">
                <h2 id="learning-chapters-heading">
                    <Layers3 size={20} aria-hidden="true" /> Chapitres du cours
                </h2>
                {onCreate && (
                    <button type="button" className="learning-button" onClick={onCreate}>
                        <Plus size={16} aria-hidden="true" /> Ajouter un chapitre
                    </button>
                )}
            </div>

            {sections.length > 0 || selection === 'unassigned' ? (
                <nav className="learning-chapter-nav" aria-label="Filtrer les supports par chapitre">
                    <div className="learning-chapter-views">
                        <Link href={href(null)} preserveScroll aria-current={selection === null ? 'page' : undefined}>
                            Tous les supports <span>{countFormat.format(total)}</span>
                        </Link>
                        {(unassignedCount > 0 || selection === 'unassigned') && (
                            <Link href={href('unassigned')} preserveScroll aria-current={selection === 'unassigned' ? 'page' : undefined}>
                                Sans chapitre <span>{countFormat.format(unassignedCount)}</span>
                            </Link>
                        )}
                    </div>
                    {sections.length > 0 && (
                        <ul className="learning-chapter-list">
                            {sections.map((chapter) => {
                                const current = chapter.id === selection;
                                const Icon = current ? FolderOpen : FolderClosed;
                                return (
                                    <li key={chapter.id} className="learning-chapter-card" data-current={current || undefined}>
                                        <Link href={href(chapter.id)} preserveScroll aria-current={current ? 'page' : undefined}>
                                            <span className="learning-chapter-icon">
                                                <Icon size={20} aria-hidden="true" />
                                            </span>
                                            <span className="learning-chapter-copy">
                                                <strong>{chapter.title}</strong>
                                                <small>
                                                    {countFormat.format(chapter.support_count)} support{chapter.support_count > 1 ? 's' : ''}
                                                </small>
                                            </span>
                                            <ChevronRight className="learning-chapter-arrow" size={16} aria-hidden="true" />
                                        </Link>
                                        {onEdit && (
                                            <button
                                                type="button"
                                                aria-label={`Modifier le chapitre ${chapter.title}`}
                                                onClick={() => onEdit(chapter)}
                                            >
                                                <Pencil size={16} aria-hidden="true" />
                                            </button>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </nav>
            ) : (
                <p className="learning-chapter-empty">
                    <FolderOpen size={19} aria-hidden="true" /> Aucun chapitre pour ce cours.
                </p>
            )}
        </section>
    );
}

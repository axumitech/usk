import {
    CalendarCheck,
    CalendarClock,
    CalendarX2,
    CheckCircle2,
    FilePenLine,
    FileUp,
    GraduationCap,
    Megaphone,
    MessageSquare,
    Wallet,
    XCircle,
    type LucideIcon,
} from 'lucide-react';

export type Notice = {
    id: string;
    reference: string;
    student_name?: string | null;
    filename: string;
    version: number | null;
    status?: string | null;
    kind?:
        | 'admission'
        | 'announcement'
        | 'document'
        | 'enrollment'
        | 'finance'
        | 'schedule'
        | 'learning'
        | 'assessment'
        | 'results'
        | 'official_document'
        | 'student_request';
    verdict?: string | null;
    title?: string | null;
    comment?: string | null;
    created_at: string;
    read_at: string | null;
    open_url: string;
};

export type Notices = { unread_count: number; items: Notice[] };

type NoticeStyle = { title: string; icon: LucideIcon };

const appointmentNotices: Record<string, NoticeStyle> = {
    appointment_confirmed: { title: 'Votre rendez-vous est confirmé', icon: CalendarCheck },
    appointment_rescheduled: { title: 'Votre rendez-vous a été déplacé', icon: CalendarClock },
    appointment_cancelled: { title: 'Votre rendez-vous a été annulé', icon: CalendarX2 },
};

const reviewVerdicts: Record<string, NoticeStyle> = {
    accepted: { title: 'Votre pièce a été acceptée', icon: CheckCircle2 },
    rejected: { title: 'Votre pièce a été refusée', icon: XCircle },
    correction_requested: { title: 'Une pièce est à corriger', icon: FilePenLine },
};

const officialDocumentTitles: Record<string, string> = {
    received: 'Demande documentaire reçue',
    correction: 'Demande documentaire à compléter',
    refused: 'Demande documentaire refusée',
    approved: 'Demande documentaire approuvée',
    issued: 'Document émis',
    deliver: 'Remise confirmée',
    revoke: 'Document révoqué',
};

const assessmentTitles: Record<string, string> = {
    published: 'Évaluation publiée',
    received: 'Travail reçu',
    cancelled: 'Évaluation annulée',
    feedback: 'Correction disponible',
};

const scheduleTitles: Record<string, string> = {
    published: 'Nouvelle séance publiée',
    changed: 'Séance modifiée',
    cancelled: 'Séance annulée',
    rescheduled: 'Séance reportée',
    absence_submitted: 'Justification reçue',
    absence_accepted: 'Justification acceptée',
    absence_refused: 'Justification refusée',
    absence_correction: 'Justification à compléter',
    absence_in_review: 'Justification en examen',
};

const financeTitles: Record<string, string> = {
    confirmed: 'Votre versement a été confirmé',
    cancelled: 'Une écriture de paiement a été annulée',
    refund_executed: 'Un remboursement a été enregistré comme exécuté',
};

export function presentNotice(notice: Notice, audience: 'student' | 'admin' = 'student'): NoticeStyle & { action: string; showFile: boolean } {
    const status = notice.status ?? '';
    const verdict = audience === 'student' ? reviewVerdicts[notice.verdict ?? ''] : undefined;
    const defaultTitle = audience === 'admin' ? 'Une pièce à réexaminer' : (verdict?.title ?? 'Votre justificatif a été examiné');
    const defaultIcon = verdict?.icon ?? FileUp;
    const base = { icon: defaultIcon, showFile: false };

    switch (notice.kind) {
        case 'announcement':
            return {
                ...base,
                icon: Megaphone,
                title: notice.title || 'Nouvelle annonce de votre enseignant',
                action: 'Lire l’annonce',
            };
        case 'student_request': {
            const appointment = appointmentNotices[status];
            return {
                title:
                    status === 'request_answered'
                        ? 'L’administration a répondu à votre demande'
                        : (appointment?.title ?? 'Votre demande de scolarité a été mise à jour'),
                icon: status === 'request_answered' ? MessageSquare : (appointment?.icon ?? CalendarCheck),
                action: 'Ouvrir ma demande',
                showFile: false,
            };
        }
        case 'official_document':
            return { ...base, title: officialDocumentTitles[status] ?? 'Suivi documentaire', action: 'Ouvrir mes documents' };
        case 'results':
            return {
                ...base,
                title: status === 'appeal_decided' ? 'Votre recours a reçu une décision' : 'Résultats officiels publiés',
                action: 'Consulter mes résultats',
            };
        case 'assessment':
            return { ...base, title: assessmentTitles[status] ?? 'Suivi d’évaluation', action: 'Consulter mes activités' };
        case 'learning':
            return { ...base, title: 'Nouvelle ressource pédagogique', action: 'Consulter les ressources' };
        case 'schedule':
            return { ...base, title: scheduleTitles[status] ?? 'Planification mise à jour', action: 'Ouvrir le suivi' };
        case 'finance':
            return {
                ...base,
                icon: Wallet,
                title: audience === 'student' ? (financeTitles[status] ?? 'Votre situation financière a été mise à jour') : defaultTitle,
                action: 'Consulter mes transactions',
            };
        case 'enrollment':
            return {
                ...base,
                title:
                    audience === 'student'
                        ? status === 'confirmed'
                            ? 'Votre inscription académique est confirmée'
                            : 'Votre situation administrative a été mise à jour'
                        : defaultTitle,
                action: 'Consulter mes inscriptions',
            };
        case 'admission':
            return {
                ...base,
                icon: GraduationCap,
                title: audience === 'student' ? 'Bienvenue dans votre espace étudiant' : defaultTitle,
                action: 'Accéder à mon espace étudiant',
            };
        default:
            return { ...base, title: defaultTitle, action: 'Ouvrir le justificatif', showFile: true };
    }
}

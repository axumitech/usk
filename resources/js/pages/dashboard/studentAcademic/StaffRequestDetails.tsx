import { formatDate } from '@/lib/studentEnrollment';
import { CalendarDays, Download } from 'lucide-react';

export type StaffRequest = {
    id: number;
    academic_enrollment_id: number;
    category: string;
    category_label: string;
    procedure_label: string | null;
    procedure_notice?: string | null;
    service: string | null;
    subject: string;
    body: string;
    status: string;
    response: string | null;
    created_at: string;
    attachment_name: string | null;
    attachment_url: string | null;
    appointment_date: string | null;
    appointment_period: string | null;
    appointment_reservation?: { date: string; time: string; end_time: string } | null;
    action_url: string | null;
    detail_url?: string | null;
};

const periods: Record<string, string> = { morning: 'Matin', afternoon: 'Après-midi' };

export default function StaffRequestDetails({ ticket }: { ticket: StaffRequest }) {
    const preference = [
        ticket.appointment_date && formatDate(ticket.appointment_date),
        ticket.appointment_period && periods[ticket.appointment_period],
    ]
        .filter(Boolean)
        .join(' · ');

    return (
        <>
            {preference && (
                <p className="academic-request-preference">
                    <CalendarDays size={16} aria-hidden="true" /> Créneau souhaité · {preference}
                </p>
            )}
            {ticket.attachment_url && (
                <a className="academic-request-attachment" href={ticket.attachment_url}>
                    <Download size={16} aria-hidden="true" /> {ticket.attachment_name || 'Télécharger la pièce jointe'}
                </a>
            )}
        </>
    );
}

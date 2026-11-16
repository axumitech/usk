export type Permission = { visible?: boolean; allowed: boolean; reason: string | null };
export type Academic = {
    id: number;
    application_uuid: string;
    reference: string;
    matricule: string | null;
    name: string;
    email: string;
    faculty: string;
    level: string;
    year: string;
    group: string | null;
    application_status: string;
    student_status: string;
    enrollment_status: string;
    fee_category: string | null;
    phone?: string | null;
    photo_url?: string | null;
};
export type Balance = {
    assessed: boolean;
    currency: string;
    total_cents: number;
    waived_cents: number;
    due_cents: number;
    paid_cents: number;
    pending_cents: number;
    balance_cents: number;
    overdue_cents: number;
    credit_cents: number;
    financial_clearance_status: string;
};
export type AssessmentActivity = {
    category: string;
    session_code: string;
    modality: string;
    teacher: string | null;
    objectives: string | null;
    attempt_limit: number;
    submission_formats?: string[];
    submission_max_kb?: number;
    late_deadline: string | null;
    maximum_points: number | null;
    status: string;
    can_submit: boolean;
    group: string | null;
    participation: string | null;
    rubric?: { label: string; maximum: number }[];
    session: { starts_at: string; ends_at: string; room: string; cancelled_at: string | null } | null;
    feedback: {
        points: number | null;
        individual: string | null;
        collective: string | null;
        criteria: { label: string; points: number; maximum: number }[];
        file_url: string | null;
        review_url: string | null;
    } | null;
};
export type EvaluationView = 'upcoming' | 'past';
export type EvaluationSummary = {
    status: 'upcoming' | 'ongoing' | 'past' | 'unscheduled' | 'cancelled';
    starts_at: string | null;
    ends_at: string | null;
    teacher: string | null;
    room: string | null;
    filename: string | null;
    size_bytes: number | null;
    can_submit: boolean;
};

export type Resource = {
    id: number;
    kind: string;
    title: string;
    body: string | null;
    course: string;
    allowed: boolean;
    reason: string | null;
    download_url: string | null;
    opens_at: string | null;
    closes_at: string | null;
    supports?: { id: number; title: string; url: string; download_url: string | null; filename?: string | null; size_bytes?: number | null }[];
    assignment?: { status: string; can_submit: boolean; teacher: string | null; filename: string | null; size_bytes: number | null };
    evaluation?: EvaluationSummary | null;
    assessment?: AssessmentActivity | null;
    submission: {
        id?: number;
        body: string | null;
        version: number;
        submitted_at: string;
        filename?: string | null;
        download_url?: string | null;
    } | null;
};
export type OverviewResource = {
    id: number;
    title: string;
    course: string;
    excerpt: string;
    updated_at: string;
    opens_at: string | null;
    closes_at: string | null;
};
export type AnnouncementKind = 'text' | 'photo' | 'video' | 'document';
export type OverviewAnnouncement = OverviewResource & {
    kind?: AnnouncementKind;
    faculty?: string | null;
    date?: string | null;
    recent?: boolean;
    preview_url?: string | null;
    detail_url?: string;
    format?: string | null;
    source_url?: string | null;
};
export type StudentOverviewData = {
    fee_summary: { kind: string; title: string; balance: Balance }[];
    ongoing_evaluations: OverviewResource[];
    upcoming_events?: import('./programCalendar').ProgramEvent[];
    generated_at: string;
    timezone: string;
    today_count: number;
    week_count: number;
    course_count: number;
    today_sessions: (PortalProps['sessions'][number] & { ongoing: boolean })[];
    schedule_week: string;
    week_sessions: (PortalProps['sessions'][number] & { course_id: number; semester: string; ongoing: boolean })[];
    alerts: { id: string; tone: string; title: string; message: string; section: string }[];
    latest_results: OverviewResource[];
    announcements: OverviewAnnouncement[];
    upcoming_evaluations: OverviewResource[];
    missing_documents: string[];
};
export type FinanceDueLine = {
    id: number | string;
    kind: string;
    kind_title?: string;
    title: string;
    amount_cents: number;
    remaining_cents: number;
    currency: string;
    due_at: string | null;
    status: 'paid' | 'exempted' | 'overdue' | 'partial' | 'upcoming';
};
export type FinanceObligation = FinanceDueLine & { id: number; paid_cents: number; waived_cents: number; installment: number; rescheduled?: boolean };
export type StudentPayment = {
    id: number;
    uuid: string;
    reference: string;
    amount_cents: number;
    status: string;
    method: string;
    kind?: string;
    kind_title?: string;
    created_at: string;
    confirmed_at: string | null;
    currency?: string;
    refunded_cents?: number;
    receipt_url: string | null;
};
export type StudentPaymentProofs = {
    submit_url: string | null;
    max_kb: number;
    methods: string[];
    kinds: { id: string; label: string; balance_cents?: number; overdue_cents?: number; currency?: string }[];
    selected_kind?: string | null;
    submissions: {
        id: number;
        kind_label: string;
        amount_cents: number;
        currency: string;
        method: string;
        reference: string;
        status: 'pending' | 'confirmed' | 'rejected';
        submitted_at: string;
        review_note: string | null;
        download_url: string | null;
    }[];
};
export type Session = {
    id: number;
    course: string;
    course_id?: number;
    starts_at: string;
    ends_at: string;
    room: string | null;
    location?: string | null;
    teacher?: string | null;
    level_id?: number;
    status?: string;
    semester?: string | null;
    activity_type?: string | null;
    resource_url?: string | null;
};

export type StudentProfileCompletion = {
    missing: {
        key: string;
        label: string;
        section: 'identity' | 'contact' | 'address' | 'emergency' | 'diploma' | 'photo';
        href: string;
    }[];
    href: string;
    completed: number;
    total: number;
};

export type PortalProps = {
    studentChrome?: import('./StudentChrome').StudentChromeData | null;
    profile_view?: 'overview' | 'personal' | 'photo' | 'settings' | null;
    profile_edit_field?: string | null;
    profile_completion?: StudentProfileCompletion | null;
    finance_schedule?: FinanceDueLine[];
    finance_details?: {
        obligations: FinanceObligation[];
        kinds?: Record<string, Balance>;
        kind_titles?: Record<string, string>;
        can_submit_proof?: boolean;
        recent_payments?: StudentPayment[];
        receipt_payments?: StudentPayment[];
        history_url?: string;
        receipts_url?: string;
    } | null;
    finance_view?: 'history' | 'receipts' | null;
    payment_proofs?: StudentPaymentProofs | null;
    payments_pagination?: { links: { url: string | null; label: string; active: boolean }[] };
    card_eligibility?: {
        ready: boolean;
        reasons: string[];
        photo_status: 'none' | 'pending' | 'approved' | 'refused';
        decision_note: string | null;
    } | null;
    lifecycle?: { reference: string; kind: string; status: string; decided_at: string }[];
    course_credits?: { earned: number | null; remaining: number | null; compensated: number | null; planned: number | null } | null;
    progression_credits?: { earned: number; remaining: number; reference: string } | null;
    progression: {
        id: number;
        level: string;
        year: string;
        target_id: number | null;
        status: string | null;
        can_start: boolean;
        kind?: string | null;
        due_on?: string | null;
        retakes?: { item_id: number; name: string; unit: string }[];
    } | null;
    department: { id: number; name: string } | null;
    department_options: { id: number; name: string }[];
    curriculum?: {
        id: number;
        code: string;
        name: string;
        program: string;
        cycle: string;
        level: string | null;
        cohort?: string | null;
        promotion?: string | null;
    } | null;
    overview: StudentOverviewData | null;
    profile_form: { values: Record<string, string | number | null>; provinces: string[] } | null;
    welcome_pending: boolean;
    section: string;
    academic: Academic;
    permissions: Record<string, Permission>;
    balance: Balance;
    courses: {
        id: number;
        course_id: number;
        detail_url: string;
        title: string;
        code: string | null;
        credits: number | null;
        semester: string | null;
        teacher: string | null;
        catalog_only?: boolean;
        registered?: boolean;
        is_optional?: boolean;
        archived?: boolean;
        unit?: string | null;
        unit_id?: number | null;
        unit_code?: string | null;
        unit_credits?: number | null;
        unit_registered_credits?: number | null;
        unit_is_composite?: boolean;
        unit_component_count?: number | null;
    }[];
    schedule_week: string;
    schedule_day?: string | null;
    schedule_view?: import('./navigation').ScheduleView;
    calendar_events?: { id: number; title: string; category_label: string; start_date: string; end_date: string }[];
    sessions: Session[];
    upcoming_sessions: PortalProps['sessions'];
    resources: Resource[];
    document_center?: import('./OfficialDocumentCenter').DocumentCenter | null;
    document_library?: import('./StudentDocumentsLibrary').DocumentLibrary | null;
    official_results?: import('./OfficialResults').OfficialResultsProps | null;
    work_pagination?: { links: { url: string | null; label: string; active: boolean }[] } | null;
    activity_filter?: string | null;
    evaluation_view?: EvaluationView | null;
    evaluation_counts?: Record<EvaluationView, number> | null;
    work_id?: number | null;
    assignment_counts?: Record<string, number> | null;
    obligations: { id: number; title: string; amount_cents: number; due_at: string | null; installment: number }[];
    payments: StudentPayment[];
    tariffs: { national: (number | null)[]; foreign: (number | null)[] };
    adjustments: {
        id: number;
        type: string;
        amount_cents: number | null;
        funding_source?: string;
        feature: string | null;
        starts_at: string | null;
        expires_at: string | null;
        schedule?: { due_at: string; amount_cents: number }[] | null;
    }[];
    scolarite?: import('./StudentSchoolServices').SchoolServices | null;
    success?: string;
};
export const money = (cents: number, currency = 'USD') =>
    `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
export const labels: Record<string, string> = {
    under_review: 'En vérification',
    correction_required: 'Correction requise',
    on_leave: 'Congé académique',
    withdrawn: 'Abandon',
    transferred: 'Transférée',
    active: 'Actif',
    suspended: 'Suspendu',
    graduated: 'Diplômé',
    archived: 'Archivé',
    confirmed: 'Confirmée',
    pending_confirmation: 'À confirmer',
    completed: 'Terminée',
    cancelled: 'Annulée',
    unpaid: 'Non réglé',
    partial: 'Paiement partiel',
    cleared: 'Solde réglé',
    exempted: 'Exonération',
    overdue: 'Échéance dépassée',
    unassessed: 'Tarif à confirmer',
    pending: 'En attente de confirmation',
    refunded: 'Remboursement enregistré',
    exemption: 'Exonération',
    scholarship: 'Bourse',
    plan: 'Échéancier approuvé',
    override: 'Dérogation',
    open: 'En cours',
    resolved: 'Résolue',
};

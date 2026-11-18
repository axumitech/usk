import type { ComponentType, SVGProps } from 'react';
export type Faculty = { id: string | number; name: string };
export type Level = { id: string | number; name: string; detail?: { fees?: number | null } | null };
export type Year = { id: string | number; name: string };
export type RequirementDoc = { key: string; label: string; required: boolean; accept?: string };
export type Requirements = {
    personal_info: RequirementDoc[];
    academic_info: RequirementDoc[];
    payment?: { required: boolean; amount: number; currency: string };
};
export type DocumentMeta = { uuid?: string; temp?: { token: string; path: string }; filename: string; mime: string; size_bytes: number };
export type FieldType = 'doc' | 'confirm' | 'payment' | undefined;
export type SectionField = { key: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>>; type?: FieldType };
export type Section = { title: string; icon: ComponentType<SVGProps<SVGSVGElement>>; fields: SectionField[] };
export type PaymentStage = 'confirm' | 'pay';
export type FormData = {
    academic_program_id?: string;
    faculty_id: string;
    level_id: string;
    year_id: string;
    name: string;
    email: string;
    program: string;
    documents: Record<string, DocumentMeta | undefined>;
};
export type DraftSnapshot = Omit<Partial<FormData>, 'name' | 'email' | 'program' | 'documents' | 'faculty_id' | 'year_id' | 'level_id' | 'academic_program_id'> & {
    faculty_id?: string | number | null;
    year_id?: string | number | null;
    level_id?: string | number | null;
    academic_program_id?: string | number | null;
    name?: string | null;
    email?: string | null;
    program?: string | null;
    documents?: FormData['documents'] | null;
    isConfirmed?: boolean;
};
export type AdmissionContext = { year_id: number; faculty_id: number; academic_program_id: number | null; level_id: number };
export type DraftContext = {
    year: string | null;
    faculty: string | null;
    program: string | null;
    level: string | null;
    unavailable_reason: string | null;
};
export type SaveStatus = 'idle' | 'saving' | 'saved';

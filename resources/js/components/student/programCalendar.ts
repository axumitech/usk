export type ProgramEvent = {
    id: number | string;
    title: string;
    category: string;
    category_label: string;
    start_date: string;
    end_date: string;
    description?: string | null;
    location?: string | null;
    instructions?: string | null;
    detail_url: string;
    calendar_url: string;
    reminder_url?: string | null;
    share_url?: string | null;
};

const locale = 'fr-FR';
const timeZone = 'Africa/Kinshasa';
const localDate = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00Z`);
const monthFormat = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone });
const compactFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone });
const fullFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone });

export function programMonthLabel(month: string) {
    return monthFormat.format(localDate(`${month}-01`));
}

export function programPeriod(start: string, end: string, compact = false) {
    const formatter = compact ? compactFormat : fullFormat;
    const date = localDate(start);
    if (start === end) return formatter.format(date);
    return formatter.formatRange(date, localDate(end));
}

export function groupProgramEvents(events: ProgramEvent[]) {
    const months = new Map<string, ProgramEvent[]>();
    for (const event of events) {
        const month = event.start_date.slice(0, 7);
        const group = months.get(month) ?? [];
        group.push(event);
        months.set(month, group);
    }

    return [...months];
}

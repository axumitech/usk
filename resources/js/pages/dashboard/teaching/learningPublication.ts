import type { Page } from '@inertiajs/core';

export type PublicationAction = 'publish' | 'withdraw' | 'archive';
type ResourceState = { id: number; academic_offering_id: number; revision: number; is_published: boolean; archived_at: string | null };

export function publicationConfirmation(page: Page, before: ResourceState, action: PublicationAction): string | undefined {
    const current = page.props.selected as ResourceState | null | undefined;
    if (
        page.component !== 'dashboard/teaching/Learning' ||
        page.props.offering !== before.academic_offering_id ||
        current?.id !== before.id ||
        current.academic_offering_id !== before.academic_offering_id ||
        current.revision !== before.revision + 1
    )
        return;

    if (action === 'publish' && current.is_published === true && current.archived_at === null) return 'Support publié.';
    if (action === 'withdraw' && current.is_published === false && current.archived_at === null) return 'Support retiré de la publication.';
    if (action === 'archive' && current.is_published === false && typeof current.archived_at === 'string' && current.archived_at.length > 0)
        return 'Support archivé.';
}

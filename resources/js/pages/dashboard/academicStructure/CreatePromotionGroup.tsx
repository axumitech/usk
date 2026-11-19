import AdminModal from '@/components/admin/AdminModal';
import { useForm } from '@inertiajs/react';
import { messages, type Row } from './types';

export default function CreatePromotionGroup({ promotion, level, onClose }: { promotion: Row; level?: string; onClose: () => void }) {
    const form = useForm({ name: '', capacity: '' });
    return (
        <AdminModal
            title="Créer un groupe pédagogique"
            description={[promotion.name, level].filter(Boolean).join(' · ')}
            formId="promotion-group"
            submitLabel="Créer le groupe"
            errors={messages(form.errors)}
            busy={form.processing}
            onClose={onClose}
        >
            <form
                id="promotion-group"
                className="admin-modal-form"
                onSubmit={(event) => {
                    event.preventDefault();
                    form.post(route('dashboard.admin.academic-structure.groups.store', { promotion: promotion.id }), {
                        preserveScroll: true,
                        onSuccess: onClose,
                    });
                }}
            >
                <label className="admin-field">
                    Nom du groupe
                    <input required maxLength={120} value={form.data.name} onChange={(event) => form.setData('name', event.target.value)} />
                </label>
                <label className="admin-field">
                    Capacité maximale (facultatif)
                    <input
                        type="number"
                        min="1"
                        max="2147483647"
                        step="1"
                        value={form.data.capacity}
                        onChange={(event) => form.setData('capacity', event.target.value)}
                    />
                </label>
            </form>
        </AdminModal>
    );
}

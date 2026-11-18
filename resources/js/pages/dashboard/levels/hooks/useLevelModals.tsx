import type { AdmissionCondition, LevelDetails } from '@/types/academic';
import Alert from '@/utils/sweetAlert';
import { router, useForm } from '@inertiajs/react';
import { SetStateAction, useState } from 'react';
import { processOptionsValue } from '../utils/levelUtils';
import type { useLevelData } from './useLevelData';

export function useLevelModals(level: LevelDetails, returnTab = 'infos') {
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editField, setEditField] = useState('');
    const [editSaving, setEditSaving] = useState(false);
    const [editErrors, setEditErrors] = useState<Record<string, string>>({});
    const [isConditionModalOpen, setIsConditionModalOpen] = useState(false);
    const [conditionMode, setConditionMode] = useState('add');
    const [editIndex, setEditIndex] = useState<number | null>(null);
    const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false);

    // Formulaire pour les conditions
    const {
        data: conditionData,
        setData: setConditionData,
        post: postCondition,
        put: putCondition,
        processing: conditionProcessing,
        errors: conditionErrors,
        clearErrors: clearConditionErrors,
        reset: resetCondition,
    } = useForm({
        faculty_id: level?.faculty_id || '',
        level_id: level?.level_id || '',
        title: '',
        description: '',
        section: '',
        is_required: false,
        id: null as number | null,
    });

    const openEditModal = (field: SetStateAction<string>) => {
        setEditErrors({});
        setEditField(field);
        setIsEditModalOpen(true);
    };

    const saveEdit = ({ draft }: ReturnType<typeof useLevelData>) => {
        const { illustration_image, options, has_certificate, ...fields } = draft;
        const formData = new FormData();
        for (const [key, value] of Object.entries(fields)) {
            formData.append(key, String(value));
        }
        formData.append('has_certificate', has_certificate ? '1' : '0');
        if (illustration_image instanceof File) {
            formData.append('illustration_image', illustration_image);
        }
        processOptionsValue(options).forEach((option, index) => {
            formData.append(`options[${index}]`, option);
        });
        formData.append('_method', 'PUT');

        router.post(route('dashboard.admin.levels.details.update', { id: level.id, tab: returnTab }), formData, {
            forceFormData: true,
            onStart: () => setEditSaving(true),
            onFinish: () => setEditSaving(false),
            onSuccess: (page) => {
                setIsEditModalOpen(false);
                const flash = page.props.flash as { success?: string } | undefined;
                Alert.success(flash?.success || 'Détails du niveau mis à jour avec succès.');
            },
            onError: setEditErrors,
        });
    };

    const openConditionModal = (mode: string, conditionId: number | null = null, condition: AdmissionCondition | null = null) => {
        setConditionMode(mode);
        setEditIndex(conditionId);

        if (mode === 'edit' && condition) {
            setConditionData({
                faculty_id: level?.faculty_id || '',
                level_id: level?.level_id || '',
                title: condition.title || '',
                description: condition.description || '',
                section: condition.section || '',
                is_required: condition.is_required || false,
                id: condition.id,
            });
        } else {
            resetCondition();
            setConditionData({
                faculty_id: level?.faculty_id || '',
                level_id: level?.level_id || '',
                title: '',
                description: '',
                section: '',
                is_required: false,
                id: null,
            });
        }

        clearConditionErrors();
        setIsConditionModalOpen(true);
    };

    const saveCondition = (e: { preventDefault: () => void }) => {
        e.preventDefault();

        if (conditionMode === 'add') {
            postCondition(route('dashboard.admin.levels.admission-conditions.store'), {
                onSuccess: () => {
                    setIsConditionModalOpen(false);
                    resetCondition();
                },
                onError: (errors) => {
                    console.error("Erreur lors de l'ajout de la condition d'admission:", errors);
                },
            });
        } else if (conditionMode === 'edit' && conditionData.id) {
            putCondition(route('dashboard.admin.levels.admission-conditions.update', conditionData.id), {
                onSuccess: () => {
                    setIsConditionModalOpen(false);
                    resetCondition();
                },
                onError: (errors) => {
                    console.error("Erreur lors de la mise à jour de la condition d'admission:", errors);
                },
            });
        }
    };

    const deleteCondition = async (conditionId: number) => {
        const confirmed = await Alert.deleteConfirm('cette condition');
        if (!confirmed) return;

        Alert.loading('Suppression en cours...');
        router.delete(route('dashboard.admin.levels.admission-conditions.destroy', conditionId), {
            onSuccess: () => {
                Alert.success("Condition d'admission supprimée avec succès");
            },
            onError: (errors) => {
                Alert.error("Erreur lors de la suppression de la condition d'admission");
                console.error("Erreur lors de la suppression de la condition d'admission:", errors);
            },
        });
    };

    return {
        // States
        isEditModalOpen,
        setIsEditModalOpen,
        editField,
        editSaving,
        editErrors,
        setEditField,
        isConditionModalOpen,
        setIsConditionModalOpen,
        conditionMode,
        setConditionMode,
        editIndex,
        setEditIndex,
        isImagePreviewOpen,
        setIsImagePreviewOpen,

        // Condition form data
        conditionData,
        setConditionData,
        conditionProcessing,
        conditionErrors,

        // Actions
        openEditModal,
        saveEdit,
        openConditionModal,
        saveCondition,
        deleteCondition,
        resetCondition,
    };
}

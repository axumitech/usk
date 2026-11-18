export type UploadLimits = { document_kb: number; image_kb: number };

export const defaultUploadLimits: UploadLimits = { document_kb: 10240, image_kb: 5120 };
export const documentAccept = '.pdf,.jpg,.jpeg,.png,.webp';
export const imageAccept = 'image/jpeg,image/png,image/webp';

export function uploadSize(kilobytes: number): string {
    if (kilobytes < 1024) return `${kilobytes} Ko`;
    return `${(Math.floor((kilobytes * 100) / 1024) / 100).toLocaleString('fr-FR')} Mo`;
}

export function proofUploadHelp(limits: UploadLimits): string {
    return `PDF : ${uploadSize(limits.document_kb)} maximum. JPG, PNG ou WebP : ${uploadSize(limits.image_kb)} maximum.`;
}

export function proofUploadError(file: File, limits: UploadLimits): string | null {
    const pdf = /\.pdf$/i.test(file.name);
    if (!pdf && !/\.(jpe?g|png|webp)$/i.test(file.name)) return 'Choisissez un fichier PDF, JPG, PNG ou WebP.';

    const maximum = pdf && !file.type?.startsWith('image/') ? limits.document_kb : limits.image_kb;
    return file.size > maximum * 1024 ? `Ce fichier dépasse la taille maximale de ${uploadSize(maximum)}.` : null;
}

export function imageUploadError(file: File, limits: UploadLimits): string | null {
    if (file.type && !imageAccept.split(',').includes(file.type)) return 'Choisissez une image JPG, PNG ou WebP.';
    return file.size > limits.image_kb * 1024 ? `Cette image dépasse la taille maximale de ${uploadSize(limits.image_kb)}.` : null;
}

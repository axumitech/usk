import DocumentUpload from '../DocumentUpload';
import type { DocumentStepProps } from './Step2Personal';
export default function Step3Academic({
    formData,
    errors,
    requirements,
    handleFileChange,
    removeFile,
    previews,
    uploadingKeys,
}: DocumentStepProps) {
    return (
        <div className="enrollment-fields">
            <p className="enrollment-info">Les pièces demandées justifient votre identité et votre parcours académique. Votre formation est déjà renseignée à la première étape.</p>
            <p className="enrollment-field-help">Les pièces demandées sont actualisées selon les conditions de candidature actuelles. Vos fichiers déjà enregistrés sont conservés.</p>
            {!!requirements.personal_info.length && <h3 className="enrollment-subheading">Vos pièces d’identité</h3>}
            {requirements.personal_info.map((doc) => (
                <DocumentUpload key={doc.key} doc={doc} document={formData.documents[doc.key]} preview={previews[doc.key]}
                    uploading={uploadingKeys.includes(doc.key)} error={errors[doc.key]} onChange={handleFileChange(doc.key)} onRemove={() => removeFile(doc.key)} />
            ))}
            {!!requirements.academic_info.length && (
                <>
                    <h3 className="enrollment-subheading">Vos justificatifs académiques</h3>
                    <p className="enrollment-field-help">
                        Ajoutez des documents nets et lisibles. Les pièces obligatoires doivent être transférées avant de continuer.
                    </p>
                </>
            )}
            {requirements.academic_info.map((doc) => (
                <DocumentUpload
                    key={doc.key}
                    doc={doc}
                    document={formData.documents[doc.key]}
                    preview={previews[doc.key]}
                    uploading={uploadingKeys.includes(doc.key)}
                    error={errors[doc.key]}
                    onChange={handleFileChange(doc.key)}
                    onRemove={() => removeFile(doc.key)}
                />
            ))}
        </div>
    );
}

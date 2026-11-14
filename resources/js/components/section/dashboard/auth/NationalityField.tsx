import { ChevronDown, Globe } from 'lucide-react';
import { useId } from 'react';

type NationalityFieldProps = {
    nationalities: Record<string, string>;
    value: string;
    onChange: (value: string) => void;
    error?: string;
};

export default function NationalityField({ nationalities, value, onChange, error }: NationalityFieldProps) {
    const id = useId();
    return (
        <div className="min-w-0 text-left">
            <label htmlFor={id} className="block text-sm font-semibold text-gray-800">
                Nationalité
            </label>
            <div className="relative">
                <Globe className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-emerald-600" aria-hidden="true" />
                <select
                    id={id}
                    name="nationality_code"
                    required
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? `${id}-help ${id}-error` : `${id}-help`}
                    className="w-full appearance-none truncate border-b border-gray-300 bg-transparent py-3 pr-10 pl-11 text-gray-700 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                >
                    <option value="" disabled>
                        Sélectionner votre nationalité
                    </option>
                    {Object.entries(nationalities).map(([code, label]) => (
                        <option key={code} value={code}>
                            {label}
                        </option>
                    ))}
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
            </div>
            <p id={`${id}-help`} className="mt-1 text-sm text-gray-600">
                La nationalité détermine le barème des frais académiques. La RDC relève du tarif national.
            </p>
            {error && (
                <p id={`${id}-error`} className="mt-1 text-sm text-red-700">
                    {error}
                </p>
            )}
        </div>
    );
}

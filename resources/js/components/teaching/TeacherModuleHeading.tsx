import { Link } from '@inertiajs/react';
import { ArrowLeft, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import '../../../css/dashboard/teacher-modules.css';

type Props = {
    title: string;
    icon: LucideIcon;
    description?: string;
    home?: string;
    homeLabel?: string;
    action?: ReactNode;
};

export default function TeacherModuleHeading({ title, icon: Icon, description, home, homeLabel = 'Tableau de bord', action }: Props) {
    return (
        <header className="teacher-module-heading">
            <div className="teacher-module-heading-main">
                {home && (
                    <Link className="teacher-module-home" href={home}>
                        <ArrowLeft size={16} aria-hidden="true" /> {homeLabel}
                    </Link>
                )}
                <div className="teacher-module-title">
                    <span className="teacher-module-symbol">
                        <Icon size={24} aria-hidden="true" />
                    </span>
                    <div>
                        <h1>{title}</h1>
                        {description && <p>{description}</p>}
                    </div>
                </div>
            </div>
            {action && <div className="teacher-module-heading-actions">{action}</div>}
        </header>
    );
}

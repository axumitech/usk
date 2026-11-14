import Dashboard from '@/components/layouts/Dashboard/Dashboard';
import DashboardSignup from '@/components/section/dashboard/auth/DashboardSignup';

export default function Signup({ nationalities }: { nationalities: Record<string, string> }) {
    return (
        <Dashboard authPage>
            <DashboardSignup nationalities={nationalities} />
        </Dashboard>
    );
}

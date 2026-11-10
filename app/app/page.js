import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { currentUser } from '@/lib/auth';
import Workspace from '@/components/Workspace';
export const dynamic = 'force-dynamic';

export default async function AppPage({ searchParams }) {
  const me = await currentUser();
  if (!me) redirect('/login');
  const sp = await searchParams;
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') || 'https'}://${h.get('x-forwarded-host') || h.get('host')}`;
  return <Workspace me={me} origin={origin} openClaim={sp?.claim ? Number(sp.claim) : null} />;
}

import { currentUser } from '@/lib/auth';
import { getReceipt } from '@/lib/claims';
export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  const me = await currentUser();
  if (!me) return new Response('Sign in', { status: 401 });
  const { id } = await params;
  const r = await getReceipt(id);
  if (!r?.receipt) return new Response('No receipt', { status: 404 });
  if (me.role !== 'manager' && me.id !== r.user_id) return new Response('Forbidden', { status: 403 });
  const [, mime, b64] = r.receipt.match(/^data:([^;]+);base64,(.*)$/) || [];
  if (!b64) return new Response('Bad receipt', { status: 500 });
  return new Response(Buffer.from(b64, 'base64'), {
    headers: { 'Content-Type': mime, 'Cache-Control': 'private, max-age=3600' },
  });
}

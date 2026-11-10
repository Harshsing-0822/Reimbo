import { currentUser } from '@/lib/auth';
import { actOnClaim } from '@/lib/claims';
export const dynamic = 'force-dynamic';

export async function PATCH(req, { params }) {
  try {
    const me = await currentUser();
    if (!me) return Response.json({ error: 'Please sign in' }, { status: 401 });
    const { id } = await params;
    const { action, ...payload } = await req.json();
    return Response.json(await actOnClaim(id, action, me, payload));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

import { currentUser } from '@/lib/auth';
import { listClaims, createClaim } from '@/lib/claims';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const me = await currentUser();
    if (!me) return Response.json({ error: 'Please sign in' }, { status: 401 });
    const scope = new URL(req.url).searchParams.get('scope');
    const all = scope === 'team' && me.role === 'manager';
    return Response.json(await listClaims(all ? {} : { userId: me.id }));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const me = await currentUser();
    if (!me) return Response.json({ error: 'Please sign in' }, { status: 401 });
    const body = await req.json();
    return Response.json(await createClaim({ ...body, userId: me.id }, me.name, 'Web'));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

import { sessionCookie, COOKIE_NAME } from '@/lib/auth';
import { listUsers } from '@/lib/claims';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const { userId } = await req.json();
    const users = await listUsers();
    const u = users.find((x) => x.id === Number(userId));
    if (!u) return Response.json({ error: 'Unknown user' }, { status: 400 });
    const res = Response.json({ ok: true, role: u.role });
    const c = sessionCookie(u.id);
    res.headers.append('Set-Cookie', `${c.name}=${c.value}; Path=/; Max-Age=${c.maxAge}; HttpOnly; SameSite=Lax${c.secure ? '; Secure' : ''}`);
    return res;
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE() {
  const res = Response.json({ ok: true });
  res.headers.append('Set-Cookie', `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  return res;
}

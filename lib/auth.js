import crypto from 'crypto';
import { cookies } from 'next/headers';
import { sql, ensureDb } from './db';

const COOKIE = 'reimbo_session';
const secret = () => process.env.SESSION_SECRET || process.env.DATABASE_URL || 'reimbo-dev';
const sign = (v) => crypto.createHmac('sha256', secret()).update(String(v)).digest('base64url');

export function sessionCookie(userId) {
  return {
    name: COOKIE,
    value: `${userId}.${sign(userId)}`,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  };
}
export const COOKIE_NAME = COOKIE;

export async function currentUser() {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [id, sig] = raw.split('.');
  if (!id || !sig || sign(id) !== sig) return null;
  await ensureDb();
  const [u] = await sql`select id, name, email, role, team, color from reimbo_users where id = ${Number(id)}`;
  return u || null;
}

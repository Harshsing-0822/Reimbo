import { listUsers } from '@/lib/claims';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json(await listUsers());
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

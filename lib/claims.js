import { sql, ensureDb } from './db';

export const CATEGORIES = ['Meals', 'Travel', 'Office', 'Software', 'Other'];
export const STATUSES = ['submitted', 'approved', 'rejected', 'paid'];
export const POLICY_LIMIT = 5000;
const COLORS = ['#0B6E4F', '#B45309', '#4338CA', '#BE185D', '#0E7490', '#7C3AED'];

function shape(r) {
  return { ...r, over_policy: r.amount > POLICY_LIMIT };
}

export async function listUsers() {
  await ensureDb();
  return sql`select id, name, email, role, team, color from reimbo_users order by role desc, name`;
}

export async function findOrCreateUser(name) {
  await ensureDb();
  const clean = String(name || '').trim();
  if (!clean) throw new Error('employee name is required');
  const [hit] = await sql`select id, name from reimbo_users where lower(name) = lower(${clean})
    or lower(split_part(name, ' ', 1)) = lower(${clean}) order by id limit 1`;
  if (hit) return hit;
  const color = COLORS[clean.length % COLORS.length];
  const [u] = await sql`insert into reimbo_users (name, role, team, color) values (${clean}, 'employee', 'General', ${color})
    returning id, name`;
  return u;
}

export async function listClaims({ userId, status, employee } = {}) {
  await ensureDb();
  const s = status && STATUSES.includes(status) ? status : null;
  const e = employee ? `%${employee}%` : null;
  const uid = userId ? Number(userId) : null;
  const rows = await sql`select c.id, c.user_id, u.name as employee, u.team, u.color, c.merchant, c.amount::float8 as amount,
      to_char(c.date, 'YYYY-MM-DD') as date, c.category, c.note, c.status, c.reject_reason, c.source,
      (c.receipt is not null) as has_receipt, c.created_at, c.updated_at
    from reimbo_claims c join reimbo_users u on u.id = c.user_id
    where (${uid}::int is null or c.user_id = ${uid})
      and (${s}::text is null or c.status = ${s})
      and (${e}::text is null or u.name ilike ${e})
    order by c.created_at desc, c.id desc`;
  if (!rows.length) return [];
  const events = await sql`select claim_id, action, actor, note, at from reimbo_events
    where claim_id = any(${rows.map((r) => r.id)}::int[]) order by at asc, id asc`;
  return rows.map((r) => shape({ ...r, events: events.filter((ev) => ev.claim_id === r.id) }));
}

export async function getClaim(id) {
  await ensureDb();
  const rows = await listClaimsById(id);
  return rows[0] || null;
}

async function listClaimsById(id) {
  const rows = await sql`select c.id, c.user_id, u.name as employee, u.team, u.color, c.merchant, c.amount::float8 as amount,
      to_char(c.date, 'YYYY-MM-DD') as date, c.category, c.note, c.status, c.reject_reason, c.source,
      (c.receipt is not null) as has_receipt, c.created_at, c.updated_at
    from reimbo_claims c join reimbo_users u on u.id = c.user_id where c.id = ${Number(id)}`;
  if (!rows.length) return [];
  const events = await sql`select claim_id, action, actor, note, at from reimbo_events where claim_id = ${Number(id)} order by at, id`;
  return [shape({ ...rows[0], events })];
}

function clean(input, partial) {
  const out = {};
  if (!partial) for (const k of ['merchant', 'amount', 'date'])
    if (input[k] === undefined || input[k] === '') throw new Error(`${k} is required`);
  if (input.merchant !== undefined) {
    out.merchant = String(input.merchant).trim();
    if (!out.merchant) throw new Error('merchant is required');
  }
  if (input.amount !== undefined) {
    const a = Number(String(input.amount).replace(/[₹,\s]/g, ''));
    if (!Number.isFinite(a) || a <= 0) throw new Error('amount must be a positive number in ₹');
    out.amount = Math.round(a * 100) / 100;
  }
  if (input.date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date))) throw new Error('date must be YYYY-MM-DD');
    out.date = String(input.date);
  }
  if (input.category !== undefined)
    out.category = CATEGORIES.find((x) => x.toLowerCase() === String(input.category).toLowerCase()) || 'Other';
  if (input.note !== undefined) out.note = String(input.note).slice(0, 500);
  return out;
}

const event = (claimId, action, actor, note = null) =>
  sql`insert into reimbo_events (claim_id, action, actor, note) values (${claimId}, ${action}, ${actor}, ${note})`;

export async function createClaim({ userId, employee, receipt, ...input }, actorName, source) {
  await ensureDb();
  const d = clean(input, false);
  const owner = userId ? { id: Number(userId), name: actorName } : await findOrCreateUser(employee);
  if (receipt) validateReceipt(receipt);
  const [c] = await sql`insert into reimbo_claims (user_id, merchant, amount, date, category, note, receipt, source)
    values (${owner.id}, ${d.merchant}, ${d.amount}, ${d.date}, ${d.category || 'Other'}, ${d.note || ''}, ${receipt || null}, ${source})
    returning id`;
  await event(c.id, 'submitted', source === 'Claude' ? `${owner.name} via Claude` : owner.name);
  return getClaim(c.id);
}

function validateReceipt(r) {
  if (!/^data:image\/(png|jpe?g|webp);base64,/.test(r)) throw new Error('Receipt must be a PNG, JPG or WebP image');
  if (r.length > 1_500_000) throw new Error('Receipt image is too large (max ~1 MB after compression)');
}

// actor: { id, name, role } | { name, role: 'claude' }
export async function actOnClaim(id, action, actor, payload = {}) {
  await ensureDb();
  const c = await getClaim(id);
  if (!c) throw new Error(`No claim #${id}`);
  const isOwner = actor.id && actor.id === c.user_id;
  const isManager = actor.role === 'manager';

  if (action === 'approve' || action === 'reject' || action === 'pay') {
    if (!isManager) throw new Error('Only a manager can do this');
    if (isOwner) throw new Error('You can’t approve or pay your own claim — another manager has to.');
  }

  if (action === 'approve') {
    if (c.status !== 'submitted') throw new Error('Only claims in review can be approved');
    await sql`update reimbo_claims set status = 'approved', reject_reason = null, updated_at = now() where id = ${c.id}`;
    await event(c.id, 'approved', actor.name);
  } else if (action === 'reject') {
    const reason = String(payload.reason || '').trim();
    if (!reason) throw new Error('Please give a reason so the employee knows what to fix');
    if (c.status !== 'submitted') throw new Error('Only claims in review can be rejected');
    await sql`update reimbo_claims set status = 'rejected', reject_reason = ${reason}, updated_at = now() where id = ${c.id}`;
    await event(c.id, 'rejected', actor.name, reason);
  } else if (action === 'pay') {
    if (c.status !== 'approved') throw new Error('Only approved claims can be marked paid');
    await sql`update reimbo_claims set status = 'paid', updated_at = now() where id = ${c.id}`;
    await event(c.id, 'paid', actor.name, payload.reference || null);
  } else if (action === 'edit') {
    const canEdit = isManager ? c.status === 'submitted' : (isOwner || actor.role === 'claude') && ['submitted', 'rejected'].includes(c.status);
    if (!canEdit) throw new Error('This claim can no longer be edited');
    const d = clean(payload, true);
    const resubmit = c.status === 'rejected';
    await sql`update reimbo_claims set
        merchant = coalesce(${d.merchant ?? null}, merchant),
        amount = coalesce(${d.amount ?? null}::numeric, amount),
        date = coalesce(${d.date ?? null}::date, date),
        category = coalesce(${d.category ?? null}, category),
        note = coalesce(${d.note ?? null}, note),
        status = ${resubmit ? 'submitted' : c.status},
        reject_reason = ${resubmit ? null : c.reject_reason},
        updated_at = now()
      where id = ${c.id}`;
    await event(c.id, resubmit ? 'resubmitted' : 'edited', actor.name);
  } else if (action === 'receipt') {
    if (!isOwner && !isManager) throw new Error('Not allowed');
    validateReceipt(payload.receipt || '');
    await sql`update reimbo_claims set receipt = ${payload.receipt}, updated_at = now() where id = ${c.id}`;
    await event(c.id, 'receipt', actor.name);
  } else {
    throw new Error(`Unknown action ${action}`);
  }
  return getClaim(c.id);
}

export async function getReceipt(id) {
  await ensureDb();
  const [r] = await sql`select user_id, receipt from reimbo_claims where id = ${Number(id)}`;
  return r || null;
}

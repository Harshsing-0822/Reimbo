import { currentUser } from '@/lib/auth';
import { listClaims } from '@/lib/claims';
export const dynamic = 'force-dynamic';

const esc = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req) {
  const me = await currentUser();
  if (!me || me.role !== 'manager') return new Response('Managers only', { status: 403 });
  const status = new URL(req.url).searchParams.get('status');
  const rows = await listClaims({ status: status || undefined });
  const head = ['Claim ID', 'Date', 'Employee', 'Team', 'Merchant', 'Category', 'Amount (INR)', 'Status', 'Over policy', 'Receipt', 'Note', 'Reject reason', 'Submitted via'];
  const lines = rows.map((r) =>
    [r.id, r.date, r.employee, r.team, r.merchant, r.category, r.amount.toFixed(2), r.status, r.over_policy ? 'Yes' : 'No',
      r.has_receipt ? 'Yes' : 'No', r.note, r.reject_reason || '', r.source].map(esc).join(',')
  );
  const today = new Date().toISOString().slice(0, 10);
  return new Response('﻿' + [head.join(','), ...lines].join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="reimbo-${status || 'all'}-${today}.csv"`,
    },
  });
}

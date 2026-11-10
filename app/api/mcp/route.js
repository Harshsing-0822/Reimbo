// Reimbo MCP server — Streamable HTTP, stateless JSON-RPC. Claude reads the receipt on the
// customer's own plan and calls these tools; Reimbo holds no AI keys.
import { listClaims, createClaim, actOnClaim, getClaim, CATEGORIES, STATUSES, POLICY_LIMIT } from '@/lib/claims';
export const dynamic = 'force-dynamic';

const STATUS_HELP = 'submitted = waiting for manager review, approved = approved and waiting for payout, paid = reimbursed, rejected = sent back with a reason';

const TOOLS = [
  {
    name: 'submit_expense',
    title: 'Submit expense claim',
    description:
      `File a new expense claim in Reimbo for an employee. Read the receipt first and fill merchant, the total amount in Indian Rupees (number only), the receipt date and a category. ` +
      `The claim goes to a manager for approval in the Reimbo app. Claims above ₹${POLICY_LIMIT} are flagged for extra review. ` +
      `After filing, share the returned link so the employee can attach the receipt photo.`,
    inputSchema: {
      type: 'object',
      properties: {
        employee: { type: 'string', description: 'Employee full name (or first name) who paid' },
        merchant: { type: 'string', description: 'Vendor / restaurant / shop name from the receipt' },
        amount: { type: 'number', description: 'Total in ₹ INR, e.g. 1849.50' },
        date: { type: 'string', description: 'Receipt date, YYYY-MM-DD' },
        category: { type: 'string', enum: CATEGORIES },
        note: { type: 'string', description: 'Business purpose, e.g. "Client lunch with Acme"' },
      },
      required: ['employee', 'merchant', 'amount', 'date', 'category'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'list_expenses',
    title: 'List expense claims',
    description: `List claims in Reimbo, newest first, with totals. Filter by status and/or employee. Statuses: ${STATUS_HELP}.`,
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: STATUSES },
        employee: { type: 'string', description: 'Employee name or part of it' },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_claim_status',
    title: 'Get claim status',
    description: `Get one claim with its full timeline (who submitted, approved, rejected or paid it and when). ${STATUS_HELP}.`,
    inputSchema: { type: 'object', properties: { id: { type: 'integer', description: 'Claim ID' } }, required: ['id'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'update_expense',
    title: 'Fix an expense claim',
    description:
      'Correct the details of a claim that is still in review or was rejected (editing a rejected claim resubmits it). Approving and paying can only be done by a manager in the Reimbo app.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        merchant: { type: 'string' },
        amount: { type: 'number', description: '₹ INR' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        category: { type: 'string', enum: CATEGORIES },
        note: { type: 'string' },
      },
      required: ['id'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
];

const inr = (n) => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const slim = ({ events, user_id, color, ...c }) => ({
  ...c,
  timeline: events?.map((e) => `${e.action} by ${e.actor}${e.note ? ` — ${e.note}` : ''} (${new Date(e.at).toISOString().slice(0, 16).replace('T', ' ')} UTC)`),
});

async function callTool(name, args = {}, origin) {
  if (name === 'submit_expense') {
    const c = await createClaim(args, args.employee, 'Claude');
    return {
      message:
        `Claim #${c.id} filed for ${c.employee}: ${inr(c.amount)} at ${c.merchant} (${c.category}). It's now waiting for manager approval.` +
        (c.over_policy ? ` Note: it is above the ${inr(POLICY_LIMIT)} policy limit, so it will be flagged for extra review.` : ''),
      attach_receipt_link: `${origin}/app?claim=${c.id}`,
      claim: slim(c),
    };
  }
  if (name === 'list_expenses') {
    const rows = await listClaims(args);
    const by = (s) => rows.filter((r) => r.status === s).reduce((t, r) => t + r.amount, 0);
    return {
      count: rows.length,
      totals_inr: { submitted: by('submitted'), approved: by('approved'), paid: by('paid'), rejected: by('rejected') },
      claims: rows.map(slim),
      dashboard: `${origin}/app`,
    };
  }
  if (name === 'get_claim_status') {
    const c = await getClaim(args.id);
    if (!c) throw new Error(`No claim #${args.id}`);
    return { claim: slim(c), link: `${origin}/app?claim=${c.id}` };
  }
  if (name === 'update_expense') {
    const { id, ...rest } = args;
    const c = await actOnClaim(id, 'edit', { name: 'Claude', role: 'claude' }, rest);
    return { message: `Claim #${c.id} updated — status: ${c.status}.`, claim: slim(c) };
  }
  throw new Error(`Unknown tool: ${name}`);
}

const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

async function handle(m, origin) {
  if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return fail(m?.id ?? null, -32600, 'Invalid request');
  if (m.id === undefined || m.id === null) return null;
  switch (m.method) {
    case 'initialize':
      return ok(m.id, {
        protocolVersion: m.params?.protocolVersion || '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'Reimbo', title: 'Reimbo — expense claims', version: '2.0.0' },
        instructions:
          'Reimbo is the company expense ledger. When the user shares a receipt, read merchant, date and total in ₹, pick a category, confirm the employee name, then call submit_expense. Use list_expenses or get_claim_status to answer "where is my money?" questions. Managers approve and pay inside the Reimbo app.',
      });
    case 'ping':
      return ok(m.id, {});
    case 'tools/list':
      return ok(m.id, { tools: TOOLS });
    case 'tools/call': {
      const { name, arguments: args } = m.params || {};
      if (!TOOLS.some((t) => t.name === name)) return fail(m.id, -32602, `Unknown tool: ${name}`);
      try {
        const data = await callTool(name, args, origin);
        return ok(m.id, { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data, isError: false });
      } catch (e) {
        return ok(m.id, { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });
      }
    }
    case 'resources/list':
      return ok(m.id, { resources: [] });
    case 'prompts/list':
      return ok(m.id, { prompts: [] });
    default:
      return fail(m.id, -32601, `Method not found: ${m.method}`);
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
};

export async function POST(req) {
  const origin = `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('x-forwarded-host') || req.headers.get('host')}`;
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json(fail(null, -32700, 'Parse error'), { status: 400, headers: CORS });
  }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(m, origin)))).filter(Boolean);
    return out.length ? Response.json(out, { headers: CORS }) : new Response(null, { status: 202, headers: CORS });
  }
  const res = await handle(body, origin);
  return res ? Response.json(res, { headers: CORS }) : new Response(null, { status: 202, headers: CORS });
}

export async function GET() {
  return new Response('Reimbo MCP endpoint is live. Add this URL in Claude → Settings → Connectors.', {
    status: 405,
    headers: { ...CORS, Allow: 'POST' },
  });
}
export async function DELETE() {
  return new Response(null, { status: 405, headers: CORS });
}
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

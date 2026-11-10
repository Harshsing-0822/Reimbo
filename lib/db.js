import { neon } from '@neondatabase/serverless';

let _sql;
export function sql(...args) {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql(...args);
}

let ready;
export function ensureDb() {
  if (!ready) ready = init().catch((e) => { ready = undefined; throw e; });
  return ready;
}

async function init() {
  await sql`create table if not exists reimbo_users (
    id serial primary key,
    name text not null unique,
    email text not null default '',
    role text not null default 'employee',
    team text not null default 'General',
    color text not null default '#0B6E4F'
  )`;
  await sql`create table if not exists reimbo_claims (
    id serial primary key,
    user_id int not null references reimbo_users(id),
    merchant text not null,
    amount numeric(12,2) not null,
    date date not null,
    category text not null default 'Other',
    note text not null default '',
    status text not null default 'submitted',
    reject_reason text,
    receipt text,
    source text not null default 'Claude',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`;
  await sql`create table if not exists reimbo_events (
    id serial primary key,
    claim_id int not null references reimbo_claims(id) on delete cascade,
    action text not null,
    actor text not null,
    note text,
    at timestamptz not null default now()
  )`;

  const [{ n }] = await sql`select count(*)::int as n from reimbo_users`;
  if (n > 0) return;

  const people = [
    ['Harsh Singh', 'harsh@reimbo.demo', 'employee', 'Product', '#0B6E4F'],
    ['Priya Sharma', 'priya@reimbo.demo', 'employee', 'Sales', '#B45309'],
    ['Rahul Verma', 'rahul@reimbo.demo', 'employee', 'Engineering', '#4338CA'],
    ['Neha Kapoor', 'neha@reimbo.demo', 'manager', 'Finance', '#BE185D'],
  ];
  const ids = {};
  for (const [name, email, role, team, color] of people) {
    const [u] = await sql`insert into reimbo_users (name, email, role, team, color)
      values (${name}, ${email}, ${role}, ${team}, ${color}) returning id`;
    ids[name] = u.id;
  }

  // [employee, merchant, amount, daysAgo, category, note, status, reason]
  const seed = [
    ['Priya Sharma', 'IndiGo Airlines', 6500, 2, 'Travel', 'Flight BLR → DEL for Acme pitch', 'submitted'],
    ['Rahul Verma', 'AWS India', 3120, 3, 'Software', 'Staging server for Q4 load test', 'submitted'],
    ['Harsh Singh', 'Third Wave Coffee', 640, 4, 'Meals', 'Coffee with design candidate', 'approved'],
    ['Priya Sharma', 'Taj Vivanta', 4200, 9, 'Travel', 'One night, Delhi client visit', 'paid'],
    ['Harsh Singh', 'Amazon India', 2299, 12, 'Office', 'Keyboard and mouse', 'paid'],
    ['Rahul Verma', 'Swiggy', 980, 6, 'Meals', 'Team dinner', 'rejected', 'Team dinners need prior approval — please raise a request first.'],
  ];
  for (const [who, merchant, amount, ago, category, note, status, reason] of seed) {
    const [c] = await sql`insert into reimbo_claims (user_id, merchant, amount, date, category, note, status, reject_reason, source, created_at, updated_at)
      values (${ids[who]}, ${merchant}, ${amount}, current_date - ${ago}::int, ${category}, ${note}, ${status}, ${reason || null},
              ${ago % 2 ? 'Claude' : 'Web'}, now() - make_interval(days => ${ago}::int), now() - make_interval(days => ${ago}::int))
      returning id`;
    await sql`insert into reimbo_events (claim_id, action, actor, at) values (${c.id}, 'submitted', ${who}, now() - make_interval(days => ${ago}::int))`;
    if (['approved', 'paid'].includes(status))
      await sql`insert into reimbo_events (claim_id, action, actor, at) values (${c.id}, 'approved', 'Neha Kapoor', now() - make_interval(days => ${ago}::int) + interval '5 hours')`;
    if (status === 'paid')
      await sql`insert into reimbo_events (claim_id, action, actor, at) values (${c.id}, 'paid', 'Neha Kapoor', now() - make_interval(days => ${ago}::int) + interval '2 days')`;
    if (status === 'rejected')
      await sql`insert into reimbo_events (claim_id, action, actor, note, at) values (${c.id}, 'rejected', 'Neha Kapoor', ${reason}, now() - make_interval(days => ${ago}::int) + interval '3 hours')`;
  }
}

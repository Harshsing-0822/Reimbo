'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Logo, { MadeBy } from '@/components/Logo';
import Avatar from '@/components/Avatar';

export default function Login() {
  const [users, setUsers] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    fetch('/api/users').then(async (r) => {
      const d = await r.json();
      if (!r.ok) setErr(d.error || 'Could not load workspace');
      else setUsers(d);
    }).catch((e) => setErr(e.message));
  }, []);

  async function signIn(u) {
    setBusy(u.id);
    const r = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: u.id }) });
    if (r.ok) window.location.href = '/app';
    else { setErr((await r.json()).error); setBusy(null); }
  }

  const managers = users?.filter((u) => u.role === 'manager') || [];
  const employees = users?.filter((u) => u.role !== 'manager') || [];

  return (
    <div className="login-wrap">
      <div className="login">
        <Link href="/"><Logo size={36} /></Link>
        <h1>Welcome to Acme Labs on Reimbo</h1>
        <p className="muted">This is a demo workspace. Pick who you want to be — no password needed.</p>
        {err && <div className="alert">{err}</div>}
        {!users && !err && <div className="skeleton" />}
        {users && (
          <>
            <div className="who-label">Managers &amp; finance — approve and pay claims</div>
            {managers.map((u) => <Person key={u.id} u={u} busy={busy} onPick={signIn} />)}
            <div className="who-label">Employees — file and track your own claims</div>
            {employees.map((u) => <Person key={u.id} u={u} busy={busy} onPick={signIn} />)}
          </>
        )}
      </div>
      <MadeBy />
    </div>
  );
}

function Person({ u, busy, onPick }) {
  return (
    <button className="person" onClick={() => onPick(u)} disabled={!!busy}>
      <Avatar name={u.name} color={u.color} />
      <span className="person-txt">
        <b>{u.name}</b>
        <small>{u.role === 'manager' ? 'Manager' : 'Employee'} · {u.team}</small>
      </span>
      <span className="go">{busy === u.id ? '…' : '→'}</span>
    </button>
  );
}

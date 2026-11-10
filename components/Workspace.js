'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Logo, { MadeBy } from './Logo';
import Avatar from './Avatar';

const CATEGORIES = ['Meals', 'Travel', 'Office', 'Software', 'Other'];
const CAT_ICON = { Meals: '🍽️', Travel: '✈️', Office: '🖇️', Software: '💻', Other: '🧾' };
const LIMIT = 5000;
const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtDate = (d) => new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const ago = (t) => {
  const s = (Date.now() - new Date(t).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
const STATUS_LABEL = { submitted: 'In review', approved: 'Approved · awaiting payout', paid: 'Paid', rejected: 'Needs changes' };
const EVENT_LABEL = { submitted: 'Submitted', approved: 'Approved', rejected: 'Sent back', paid: 'Marked paid', edited: 'Edited', resubmitted: 'Fixed & resubmitted', receipt: 'Receipt attached' };

async function api(url, opts = {}) {
  const r = await fetch(url, { cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...opts });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Something went wrong');
  return d;
}

export default function Workspace({ me, origin, openClaim }) {
  const isManager = me.role === 'manager';
  const [view, setView] = useState(isManager ? 'inbox' : 'mine');
  const [mine, setMine] = useState(null);
  const [team, setTeam] = useState(null);
  const [toast, setToast] = useState(null);
  const [detailId, setDetailId] = useState(openClaim);
  const [newOpen, setNewOpen] = useState(false);
  const [rejecting, setRejecting] = useState(null);
  const [fresh, setFresh] = useState(new Set());
  const known = useRef(null);

  const say = (msg, tone = 'ok') => {
    setToast({ msg, tone });
    clearTimeout(say.t);
    say.t = setTimeout(() => setToast(null), 3200);
  };

  const load = useCallback(async () => {
    try {
      const [m, t] = await Promise.all([api('/api/claims'), isManager ? api('/api/claims?scope=team') : Promise.resolve(null)]);
      const all = t || m;
      if (known.current) {
        const added = all.filter((c) => !known.current.has(c.id));
        if (added.length) {
          setFresh(new Set(added.map((c) => c.id)));
          setTimeout(() => setFresh(new Set()), 5000);
          const c = added[0];
          say(`New claim from ${c.employee}: ${inr(c.amount)} at ${c.merchant}`, 'info');
        }
      }
      known.current = new Set(all.map((c) => c.id));
      setMine(m);
      if (t) setTeam(t);
    } catch (e) {
      say(e.message, 'err');
    }
  }, [isManager]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function act(id, action, payload = {}, msg) {
    try {
      await api(`/api/claims/${id}`, { method: 'PATCH', body: JSON.stringify({ action, ...payload }) });
      await load();
      if (msg) say(msg);
      return true;
    } catch (e) {
      say(e.message, 'err');
      return false;
    }
  }

  const allClaims = [...(team || []), ...(mine || [])];
  const detail = detailId ? allClaims.find((c) => c.id === detailId) : null;
  const toReview = team?.filter((c) => c.status === 'submitted').length || 0;

  async function signOut() {
    await fetch('/api/session', { method: 'DELETE' });
    window.location.href = '/login';
  }

  return (
    <div className="ws">
      <header className="ws-top">
        <a href="/"><Logo size={28} /></a>
        <nav className="ws-nav">
          {isManager && (
            <button className={view === 'inbox' ? 'on' : ''} onClick={() => setView('inbox')}>
              Approvals {toReview > 0 && <span className="count">{toReview}</span>}
            </button>
          )}
          <button className={view === 'mine' ? 'on' : ''} onClick={() => setView('mine')}>My claims</button>
          <button className={view === 'connect' ? 'on' : ''} onClick={() => setView('connect')}>Connect Claude</button>
        </nav>
        <div className="me">
          <Avatar name={me.name} color={me.color} size={32} />
          <div className="me-txt">
            <b>{me.name}</b>
            <small>{isManager ? 'Manager' : 'Employee'} · {me.team}</small>
          </div>
          <button className="btn ghost sm" onClick={signOut}>Switch</button>
        </div>
      </header>

      <main className="ws-main">
        {view === 'mine' && <MyClaims me={me} claims={mine} fresh={fresh} onNew={() => setNewOpen(true)} onOpen={setDetailId} goConnect={() => setView('connect')} />}
        {view === 'inbox' && isManager && (
          <Inbox me={me} claims={team} fresh={fresh} onOpen={setDetailId} onReject={setRejecting}
            onApprove={(c) => act(c.id, 'approve', {}, `Approved ${inr(c.amount)} for ${c.employee}`)}
            onPay={(c) => act(c.id, 'pay', {}, `Marked ${inr(c.amount)} as paid to ${c.employee}`)} />
        )}
        {view === 'connect' && <Connect origin={origin} me={me} />}
      </main>

      <MadeBy />

      {newOpen && (
        <ClaimForm title="New claim" onClose={() => setNewOpen(false)}
          onSave={async (body) => {
            await api('/api/claims', { method: 'POST', body: JSON.stringify(body) });
            setNewOpen(false);
            await load();
            say('Claim submitted — your manager has been notified');
          }} />
      )}
      {rejecting && (
        <RejectModal claim={rejecting} onClose={() => setRejecting(null)}
          onConfirm={async (reason) => {
            if (await act(rejecting.id, 'reject', { reason }, `Sent back to ${rejecting.employee} with your reason`)) setRejecting(null);
          }} />
      )}
      {detail && (
        <Detail claim={detail} me={me} onClose={() => setDetailId(null)} act={act} onReject={(c) => setRejecting(c)} />
      )}
      {toast && <div className={`toast ${toast.tone}`}>{toast.msg}</div>}
    </div>
  );
}

/* ---------------- Employee: My claims ---------------- */
function MyClaims({ me, claims, fresh, onNew, onOpen, goConnect }) {
  const sum = (s) => (claims || []).filter((c) => s.includes(c.status)).reduce((t, c) => t + c.amount, 0);
  const n = (s) => (claims || []).filter((c) => s.includes(c.status)).length;
  const needs = (claims || []).filter((c) => c.status === 'rejected');
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hi {me.name.split(' ')[0]} 👋</h1>
          <p className="muted">Here’s where your money is.</p>
        </div>
        <button className="btn primary" onClick={onNew}>+ New claim</button>
      </div>

      <div className="stats">
        <Stat label="In review" value={inr(sum(['submitted']))} hint={`${n(['submitted'])} claim${n(['submitted']) === 1 ? '' : 's'} with your manager`} tone="amber" />
        <Stat label="Coming your way" value={inr(sum(['approved']))} hint="Approved, payout pending" tone="blue" />
        <Stat label="Paid to you" value={inr(sum(['paid']))} hint="Reimbursed so far" tone="green" />
      </div>

      {needs.length > 0 && (
        <div className="banner warn">
          <b>{needs.length} claim{needs.length > 1 ? 's need' : ' needs'} your attention.</b> Your manager sent {needs.length > 1 ? 'them' : 'it'} back — open to see why and fix it.
        </div>
      )}

      {!claims && <div className="skeleton tall" />}
      {claims && claims.length === 0 && (
        <div className="empty">
          <div className="empty-i">🧾</div>
          <h3>No claims yet</h3>
          <p>The fastest way: send a receipt photo to Claude and say <i>“file this as an expense”</i>.</p>
          <div className="row">
            <button className="btn primary" onClick={goConnect}>Connect Claude</button>
            <button className="btn" onClick={onNew}>Add one manually</button>
          </div>
        </div>
      )}
      <div className="cards">
        {claims?.map((c) => (
          <button key={c.id} className={`claim-card ${fresh.has(c.id) ? 'fresh' : ''}`} onClick={() => onOpen(c.id)}>
            <div className="cc-top">
              <span className="cat-i">{CAT_ICON[c.category]}</span>
              <div className="cc-title">
                <b>{c.merchant}</b>
                <small>{c.category} · {fmtDate(c.date)} {c.source === 'Claude' && <span className="via">✦ via Claude</span>}</small>
              </div>
              <div className="cc-amt">{inr(c.amount)}</div>
            </div>
            {c.status === 'rejected' ? (
              <div className="reason"><b>Needs changes:</b> {c.reject_reason}</div>
            ) : (
              <Tracker status={c.status} />
            )}
            <div className="cc-foot">
              <span className={c.has_receipt ? 'ok-txt' : 'warn-txt'}>{c.has_receipt ? '📎 Receipt attached' : '📎 Add receipt'}</span>
              <span className="muted">Updated {ago(c.updated_at)}</span>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

function Tracker({ status }) {
  const order = ['submitted', 'approved', 'paid'];
  const idx = order.indexOf(status);
  return (
    <div className="tracker">
      {['Submitted', 'Approved', 'Paid'].map((l, i) => (
        <span key={l} className={i <= idx ? 'done' : i === idx + 1 ? 'next' : ''}>{l}</span>
      ))}
    </div>
  );
}

function Stat({ label, value, hint, tone }) {
  return (
    <div className={`stat ${tone}`}>
      <span className="stat-l">{label}</span>
      <span className="stat-v">{value}</span>
      <span className="stat-h">{hint}</span>
    </div>
  );
}

/* ---------------- Manager: Approvals inbox ---------------- */
function Inbox({ me, claims, fresh, onOpen, onApprove, onReject, onPay }) {
  const [tab, setTab] = useState('submitted');
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    let l = (claims || []).filter((c) => tab === 'all' || c.status === tab);
    if (q) l = l.filter((c) => `${c.employee} ${c.merchant} ${c.category} ${c.note}`.toLowerCase().includes(q.toLowerCase()));
    if (tab === 'submitted') l = [...l].sort((a, b) => b.over_policy - a.over_policy);
    return l;
  }, [claims, tab, q]);
  const s = (st) => (claims || []).filter((c) => c.status === st);
  const total = (arr) => arr.reduce((t, c) => t + c.amount, 0);
  const flagged = s('submitted').filter((c) => c.over_policy).length;
  const tabs = [['submitted', 'To review'], ['approved', 'To pay'], ['paid', 'Paid'], ['rejected', 'Sent back'], ['all', 'All']];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Approvals</h1>
          <p className="muted">Review your team’s claims, then pay them out.</p>
        </div>
        <a className="btn" href={`/api/export${tab === 'all' ? '' : `?status=${tab}`}`}>⬇ Export CSV</a>
      </div>

      <div className="stats four">
        <Stat label="Waiting for you" value={inr(total(s('submitted')))} hint={`${s('submitted').length} claims to review`} tone="amber" />
        <Stat label="Over policy" value={flagged} hint={`Above ${inr(LIMIT)} — check first`} tone="red" />
        <Stat label="Ready to pay" value={inr(total(s('approved')))} hint={`${s('approved').length} approved claims`} tone="blue" />
        <Stat label="Paid out" value={inr(total(s('paid')))} hint={`${s('paid').length} claims reimbursed`} tone="green" />
      </div>

      <div className="panel">
        <div className="panel-bar">
          <div className="tabs">
            {tabs.map(([k, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {l} <span>{k === 'all' ? claims?.length || 0 : s(k).length}</span>
              </button>
            ))}
          </div>
          <input className="search" placeholder="Search people, merchants…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {!claims && <div className="skeleton tall" />}
        {claims && list.length === 0 && (
          <div className="empty slim">
            <div className="empty-i">{tab === 'submitted' ? '🎉' : '📭'}</div>
            <h3>{tab === 'submitted' ? 'All caught up' : 'Nothing here'}</h3>
            <p>{tab === 'submitted' ? 'New claims from your team will appear here the moment they’re filed.' : 'Claims will show up here as they move along.'}</p>
          </div>
        )}
        <div className="rows">
          {list.map((c) => {
            const own = c.user_id === me.id;
            return (
              <div key={c.id} className={`row-item ${c.over_policy && c.status === 'submitted' ? 'flagged' : ''} ${fresh.has(c.id) ? 'fresh' : ''}`}>
                <button className="ri-main" onClick={() => onOpen(c.id)}>
                  <Avatar name={c.employee} color={c.color} size={36} />
                  <div className="ri-who">
                    <b>{c.employee}</b>
                    <small>{c.team} · {ago(c.created_at)}</small>
                  </div>
                  <div className="ri-what">
                    <b>{CAT_ICON[c.category]} {c.merchant}</b>
                    <small>{c.note || c.category}</small>
                  </div>
                  <div className="ri-tags">
                    {c.over_policy && <span className="tag red">Over ₹5k</span>}
                    {!c.has_receipt && <span className="tag grey">No receipt</span>}
                    {c.source === 'Claude' && <span className="tag mint">✦ Claude</span>}
                  </div>
                  <div className="ri-amt">
                    <b>{inr(c.amount)}</b>
                    <small>{fmtDate(c.date)}</small>
                  </div>
                </button>
                <div className="ri-act">
                  {c.status === 'submitted' && !own && (
                    <>
                      <button className="btn sm danger" onClick={() => onReject(c)}>Send back</button>
                      <button className="btn sm primary" onClick={() => onApprove(c)}>Approve</button>
                    </>
                  )}
                  {c.status === 'submitted' && own && <span className="muted sm">Your claim — another manager approves</span>}
                  {c.status === 'approved' && !own && <button className="btn sm primary" onClick={() => onPay(c)}>Mark paid</button>}
                  {c.status === 'approved' && own && <span className="muted sm">Awaiting another manager</span>}
                  {['paid', 'rejected'].includes(c.status) && <span className={`badge ${c.status}`}>{c.status === 'paid' ? 'Paid' : 'Sent back'}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/* ---------------- Claim detail drawer ---------------- */
function Detail({ claim: c, me, onClose, act, onReject }) {
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bust, setBust] = useState(0);
  const fileRef = useRef();
  const isManager = me.role === 'manager';
  const own = c.user_id === me.id;
  const canEdit = isManager ? c.status === 'submitted' : own && ['submitted', 'rejected'].includes(c.status);

  async function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const data = await compress(f);
      if (await act(c.id, 'receipt', { receipt: data }, 'Receipt attached')) setBust((b) => b + 1);
    } finally {
      setUploading(false);
    }
  }

  if (editing)
    return (
      <ClaimForm title={c.status === 'rejected' ? 'Fix & resubmit' : `Edit claim #${c.id}`} initial={c} hideReceipt onClose={() => setEditing(false)}
        onSave={async (b) => { if (await act(c.id, 'edit', b, c.status === 'rejected' ? 'Resubmitted — back with your manager' : 'Saved')) setEditing(false); }} />
    );

  return (
    <div className="overlay" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <span className="muted">Claim #{c.id}</span>
          <button className="x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="d-amt">{inr(c.amount)}</div>
        <div className="d-merchant">{CAT_ICON[c.category]} {c.merchant}</div>
        <span className={`badge ${c.status}`}>{STATUS_LABEL[c.status]}</span>
        {c.over_policy && <div className="banner red sm">Above the {inr(LIMIT)} per-claim policy limit — needs a closer look.</div>}
        {c.status === 'rejected' && <div className="banner warn sm"><b>Reason:</b> {c.reject_reason}</div>}

        <dl className="facts">
          <dt>Employee</dt><dd>{c.employee} · {c.team}</dd>
          <dt>Date</dt><dd>{fmtDate(c.date)}</dd>
          <dt>Category</dt><dd>{c.category}</dd>
          <dt>Purpose</dt><dd>{c.note || '—'}</dd>
          <dt>Filed via</dt><dd>{c.source === 'Claude' ? '✦ Claude' : 'Reimbo web'}</dd>
        </dl>

        <div className="receipt-box">
          {c.has_receipt ? (
            <a href={`/api/claims/${c.id}/receipt?v=${bust}`} target="_blank" rel="noreferrer">
              <img src={`/api/claims/${c.id}/receipt?v=${bust}`} alt="Receipt" />
            </a>
          ) : (
            <div className="no-receipt">No receipt attached yet</div>
          )}
          {(own || isManager) && (
            <>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
              <button className="btn sm" onClick={() => fileRef.current.click()} disabled={uploading}>
                {uploading ? 'Uploading…' : c.has_receipt ? 'Replace receipt' : '📎 Attach receipt photo'}
              </button>
            </>
          )}
        </div>

        <h4>Timeline</h4>
        <ol className="timeline">
          {c.events.map((e, i) => (
            <li key={i} className={e.action}>
              <b>{EVENT_LABEL[e.action] || e.action}</b> by {e.actor}
              {e.note && <div className="tl-note">“{e.note}”</div>}
              <small>{new Date(e.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small>
            </li>
          ))}
          {c.status === 'submitted' && <li className="pending">Waiting for manager approval</li>}
          {c.status === 'approved' && <li className="pending">Waiting for payout</li>}
        </ol>

        <div className="drawer-actions">
          {canEdit && <button className="btn" onClick={() => setEditing(true)}>{c.status === 'rejected' ? 'Fix & resubmit' : 'Edit'}</button>}
          {isManager && !own && c.status === 'submitted' && (
            <>
              <button className="btn danger" onClick={() => onReject(c)}>Send back</button>
              <button className="btn primary" onClick={() => act(c.id, 'approve', {}, `Approved ${inr(c.amount)}`)}>Approve</button>
            </>
          )}
          {isManager && !own && c.status === 'approved' && (
            <button className="btn primary" onClick={() => act(c.id, 'pay', {}, `Marked paid`)}>Mark paid</button>
          )}
        </div>
      </aside>
    </div>
  );
}

/* ---------------- Forms & modals ---------------- */
function ClaimForm({ title, initial, onClose, onSave, hideReceipt }) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    merchant: initial?.merchant || '', amount: initial?.amount ?? '', date: initial?.date || today,
    category: initial?.category || 'Meals', note: initial?.note || '',
  });
  const [receipt, setReceipt] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await onSave({ ...f, amount: Number(f.amount), ...(receipt ? { receipt } : {}) });
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="drawer-head"><h2>{title}</h2><button type="button" className="x" onClick={onClose}>×</button></div>
        <label>Where did you spend?<input value={f.merchant} onChange={set('merchant')} placeholder="e.g. Barbeque Nation" required autoFocus /></label>
        <div className="two">
          <label>Amount (₹)<input type="number" inputMode="decimal" step="0.01" min="1" value={f.amount} onChange={set('amount')} placeholder="1850" required /></label>
          <label>Date<input type="date" max={today} value={f.date} onChange={set('date')} required /></label>
        </div>
        <label>Category</label>
        <div className="chips">
          {CATEGORIES.map((c) => (
            <button type="button" key={c} className={f.category === c ? 'chip on' : 'chip'} onClick={() => setF({ ...f, category: c })}>
              {CAT_ICON[c]} {c}
            </button>
          ))}
        </div>
        <label>What was it for?<input value={f.note} onChange={set('note')} placeholder="Client lunch with Acme" /></label>
        {!hideReceipt && (
          <label className="file">
            {receipt ? '✓ Receipt ready' : '📎 Add receipt photo (optional)'}
            <input type="file" accept="image/*" capture="environment" hidden onChange={async (e) => e.target.files?.[0] && setReceipt(await compress(e.target.files[0]))} />
          </label>
        )}
        {Number(f.amount) > LIMIT && <div className="banner red sm">Above the {inr(LIMIT)} limit — add a clear purpose so your manager can approve quickly.</div>}
        {err && <div className="alert">{err}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : initial?.status === 'rejected' ? 'Resubmit' : initial ? 'Save' : 'Submit claim'}</button>
        </div>
      </form>
    </div>
  );
}

function RejectModal({ claim, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const quick = ['Please attach the receipt', 'Above policy limit — needs pre-approval', 'Looks like a personal expense', 'Duplicate of another claim'];
  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); onConfirm(reason); }}>
        <div className="drawer-head"><h2>Send back to {claim.employee.split(' ')[0]}</h2><button type="button" className="x" onClick={onClose}>×</button></div>
        <p className="muted">{inr(claim.amount)} at {claim.merchant}. Tell them what to fix — they can correct it and resubmit.</p>
        <div className="chips">
          {quick.map((q) => <button type="button" key={q} className={reason === q ? 'chip on' : 'chip'} onClick={() => setReason(q)}>{q}</button>)}
        </div>
        <label>Reason<textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Write a short note…" required autoFocus /></label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn danger-solid" disabled={!reason.trim()}>Send back</button>
        </div>
      </form>
    </div>
  );
}

/* ---------------- Connect Claude ---------------- */
function Connect({ origin, me }) {
  const url = `${origin}/api/mcp`;
  const [copied, setCopied] = useState('');
  const copy = (t, k) => { navigator.clipboard?.writeText(t); setCopied(k); setTimeout(() => setCopied(''), 1500); };
  const prompts = [
    `File this receipt as an expense for ${me.name.split(' ')[0]}.`,
    'Where is my money? Show my claims that aren’t paid yet.',
    'What’s still waiting for approval?',
    'Change claim #6 to Travel and add the note “Airport cab”.',
  ];
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Connect Claude</h1>
          <p className="muted">One-time setup, about a minute. After this, filing a claim is just a photo and one sentence.</p>
        </div>
      </div>
      <div className="connect">
        <ol className="setup">
          <li><b>Open Claude</b> → <b>Settings</b> → <b>Connectors</b> → <b>Add custom connector</b>.</li>
          <li>
            <b>Name it “Reimbo” and paste this URL</b>
            <div className="copybox">
              <code>{url}</code>
              <button className="btn sm primary" onClick={() => copy(url, 'url')}>{copied === 'url' ? 'Copied ✓' : 'Copy'}</button>
            </div>
            <small className="muted">Leave the OAuth fields empty.</small>
          </li>
          <li><b>In a new chat</b>, turn on Reimbo from the tools menu, attach a receipt and say what it was for.</li>
        </ol>
        <div className="prompts">
          <h3>Try saying</h3>
          {prompts.map((p, i) => (
            <button key={p} className="prompt" onClick={() => copy(p, `p${i}`)}>
              <span>“{p}”</span>
              <small>{copied === `p${i}` ? 'Copied ✓' : 'Copy'}</small>
            </button>
          ))}
          <p className="muted sm">Claude reads the receipt on your own Claude plan. Reimbo never sees your chats — only the claim details Claude sends.</p>
        </div>
      </div>
    </>
  );
}

/* ---------------- helpers ---------------- */
function compress(file, max = 1400, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = url;
  });
}

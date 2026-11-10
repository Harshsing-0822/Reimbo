import Link from 'next/link';
import Logo, { MadeBy } from '@/components/Logo';

const steps = [
  ['📸', 'Snap it to Claude', 'Drop a receipt photo into Claude and say “file this”. Claude reads the merchant, date and amount for you.'],
  ['✅', 'Manager taps approve', 'It lands in your manager’s inbox with policy checks done. Approve, or send it back with a reason.'],
  ['💸', 'You get paid', 'Finance marks it paid and exports to accounts. You always know where your money is.'],
];

const features = [
  ['Where’s my money?', 'Every claim shows a live tracker: Submitted → Approved → Paid. No more chasing on WhatsApp.'],
  ['Approvals inbox', 'Managers see what needs review, flagged items first, receipts one tap away.'],
  ['Policy built in', `Claims above ₹5,000 are flagged automatically. Nobody can approve their own claim.`],
  ['Clear rejections', 'A rejected claim always comes with a reason, and can be fixed and resubmitted in seconds.'],
  ['Month-end in one click', 'Export a clean CSV for Tally, Zoho or your CA, with status, team and receipt check.'],
  ['₹0 AI cost', 'Reimbo uses the Claude plan your team already pays for, so we can price below every AI expense tool.'],
];

export default function Landing() {
  return (
    <div className="landing">
      <nav className="lnav">
        <Logo />
        <div className="lnav-links">
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <Link href="/login" className="btn primary">Open demo workspace</Link>
        </div>
      </nav>

      <header className="hero">
        <div className="hero-copy">
          <span className="pill">Works inside Claude · Made for Indian startups</span>
          <h1>Expense claims that <em>pay you back</em> — fast.</h1>
          <p>
            Employees file a claim by sending a receipt to Claude. Managers approve in one tap. Finance exports at month-end.
            No spreadsheets, no lost bills, no “did you approve my claim?” messages.
          </p>
          <div className="hero-cta">
            <Link href="/login" className="btn primary lg">Try the live demo →</Link>
            <a href="#how" className="btn lg">See how it works</a>
          </div>
          <div className="trust">
            <span><b>10 sec</b> receipt to claim</span>
            <span><b>1 tap</b> to approve</span>
            <span><b>₹0</b> AI cost</span>
          </div>
        </div>

        <div className="hero-art" aria-hidden="true">
          <div className="chat">
            <div className="bubble me">
              <div className="rcpt">🧾 receipt.jpg</div>
              File this as a client lunch for Harsh
            </div>
            <div className="bubble claude">
              <b>Done — claim #42 filed.</b>
              <br />₹1,850 at Barbeque Nation · Meals
              <br /><span className="tool">✦ used Reimbo · submit_expense</span>
            </div>
          </div>
          <div className="mini-card">
            <div className="mini-top">
              <span>Barbeque Nation</span>
              <b>₹1,850</b>
            </div>
            <div className="tracker sm">
              <span className="done">Submitted</span>
              <span className="done">Approved</span>
              <span>Paid</span>
            </div>
          </div>
        </div>
      </header>

      <section id="how" className="how">
        <h2>Three steps. Zero chasing.</h2>
        <div className="steps">
          {steps.map(([icon, t, d], i) => (
            <div className="step" key={t}>
              <div className="step-n">{i + 1}</div>
              <div className="step-i">{icon}</div>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="features">
        {features.map(([t, d]) => (
          <div key={t} className="feature">
            <h3>{t}</h3>
            <p>{d}</p>
          </div>
        ))}
      </section>

      <section id="pricing" className="pricing">
        <h2>Simple pricing</h2>
        <div className="plans">
          <div className="plan">
            <h3>Starter</h3>
            <div className="price">Free</div>
            <p>Up to 5 people · 50 claims a month</p>
          </div>
          <div className="plan hot">
            <span className="tag">Most teams</span>
            <h3>Team</h3>
            <div className="price">₹1,999<small>/month</small></div>
            <p>Up to 25 people · approvals, policy rules, CSV export</p>
          </div>
          <div className="plan">
            <h3>Growth</h3>
            <div className="price">+₹79<small>/person</small></div>
            <p>25–200 people · multiple approvers, accounting exports</p>
          </div>
        </div>
      </section>

      <section className="cta-band">
        <h2>Stop chasing reimbursements.</h2>
        <p>Open the demo workspace as an employee or a manager — no sign-up needed.</p>
        <Link href="/login" className="btn lime lg">Open demo workspace →</Link>
      </section>

      <MadeBy />
    </div>
  );
}

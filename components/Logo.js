export function Mark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="#0B6E4F" />
      <path d="M29.5 14.5A11 11 0 1 0 31 22" fill="none" stroke="#D4F36B" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M26.2 9.6l4.4 4.9-6.2 1.6" fill="none" stroke="#D4F36B" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <text x="20" y="26" textAnchor="middle" fontSize="15" fontWeight="800" fill="#fff" fontFamily="inherit">₹</text>
    </svg>
  );
}

export default function Logo({ size = 30, light = false }) {
  return (
    <span className="logo" style={{ color: light ? '#fff' : 'var(--ink)' }}>
      <Mark size={size} />
      <span>reimbo</span>
    </span>
  );
}

export function MadeBy() {
  return (
    <footer className="madeby">
      <span>Reimbo · Expense claims that pay you back</span>
      <span>Made with care by <b>Harsh Singh</b></span>
    </footer>
  );
}

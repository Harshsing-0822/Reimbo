export default function Avatar({ name, color, size = 38 }) {
  const ini = String(name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span className="avatar" style={{ background: color || '#0B6E4F', width: size, height: size, fontSize: size * 0.38 }}>{ini}</span>
  );
}

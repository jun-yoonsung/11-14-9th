export default function BallIcon({ className = "ball" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="#fff" stroke="#121a2b" strokeWidth="1.5" />
      <path d="M6.2 4.2c2.6 2.8 2.6 12.8 0 15.6M17.8 4.2c-2.6 2.8-2.6 12.8 0 15.6" fill="none" stroke="#c8302a" strokeWidth="1.6" strokeDasharray="2 1.6" />
    </svg>
  );
}

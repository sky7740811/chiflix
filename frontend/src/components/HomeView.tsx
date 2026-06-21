export default function HomeView() {
  return (
    <div className="empty-state">
      <div style={{ fontSize: '18px', marginBottom: '12px' }}>Welcome to Chiflix Pro</div>
      <p style={{ color: '#888', lineHeight: 1.6 }}>
        Search anime in the navbar above, or go to the <strong>Search</strong> tab.<br />
        Click an episode to start watching.
      </p>
    </div>
  );
}

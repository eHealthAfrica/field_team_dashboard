// Short, data-generated narration that opens each page: a lead sentence in
// bold followed by one or two supporting sentences.
export default function Narrative({ eyebrow, lead, children }) {
  return (
    <section className="animate-fade-up" style={{
      background: '#fff', border: '1px solid var(--line)', borderLeft: '3px solid var(--eha-blue)',
      borderRadius: 10, padding: '6px 12px',
    }}>
      {eyebrow && <div className="eyebrow" style={{ marginBottom: 1, fontSize: 10 }}>{eyebrow}</div>}
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)' }}>
        <strong style={{ color: 'var(--ink)', fontWeight: 650 }}>{lead}</strong>{children ? ' ' : ''}{children}
      </p>
    </section>
  )
}

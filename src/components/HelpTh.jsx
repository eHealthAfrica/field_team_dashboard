import { useState } from 'react'
import { createPortal } from 'react-dom'

// Table header with a hover definition. The dotted underline signals that
// help is available; the tooltip is rendered on <body> so scrolling tables
// and panels can't clip it.
export default function HelpTh({ help, className, style, children }) {
  const [pos, setPos] = useState(null)
  const show = e => {
    const r = e.currentTarget.getBoundingClientRect()
    const left = Math.min(Math.max(8, r.left), window.innerWidth - 268)
    setPos({ left, top: r.bottom + 6 })
  }
  return (
    <th className={className} style={{ ...style, cursor: help ? 'help' : undefined }}
      onMouseEnter={help ? show : undefined} onMouseLeave={() => setPos(null)}
      onFocus={help ? show : undefined} onBlur={() => setPos(null)} tabIndex={help ? 0 : undefined}>
      <span style={help ? { borderBottom: '1px dotted var(--ink-4)', paddingBottom: 1 } : undefined}>{children}</span>
      {pos && createPortal(
        <div role="tooltip" style={{
          position: 'fixed', left: pos.left, top: pos.top, width: 260, zIndex: 1000, pointerEvents: 'none',
          background: 'var(--ink)', color: '#fff', borderRadius: 8, padding: '8px 10px',
          fontSize: 11.5, lineHeight: 1.45, fontWeight: 400, letterSpacing: 0, textTransform: 'none', textAlign: 'left',
          whiteSpace: 'normal', boxShadow: '0 8px 24px rgba(15,23,32,.25)', fontFamily: 'Inter, sans-serif',
        }}>
          {help}
        </div>,
        document.body,
      )}
    </th>
  )
}

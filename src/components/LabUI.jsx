import { Gauge, Lightbulb, RotateCcw } from 'lucide-react'

export function Slider({ label, value, min, max, step = 1, unit = '', onChange, accent = '#e65a45', onInteractionStart, onInteractionEnd }) {
  const progress = ((value - min) / (max - min)) * 100
  return (
    <label className="slider-control">
      <span className="control-label">
        <span>{label}</span>
        <output>{Number(value).toFixed(step < 1 ? 1 : 0)}{unit}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerDown={onInteractionStart}
        onPointerUp={onInteractionEnd}
        onKeyDown={onInteractionStart}
        onKeyUp={onInteractionEnd}
        onBlur={onInteractionEnd}
        style={{ '--range-progress': `${progress}%`, '--range-accent': accent }}
      />
    </label>
  )
}

export function Metric({ label, value, tone = 'coral' }) {
  return (
    <div className={`metric metric--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export function Equation({ children, caption, values }) {
  return (
    <div className="equation-block">
      <div className="equation">{children}</div>
      {values && <div className="equation-values">{values}</div>}
      <p>{caption}</p>
    </div>
  )
}

export function Note({ children }) {
  return (
    <div className="note">
      <Lightbulb size={17} aria-hidden="true" />
      <p>{children}</p>
    </div>
  )
}

export function ResetButton({ onClick }) {
  return (
    <button className="icon-button" type="button" onClick={onClick} title="Reset experiment" aria-label="Reset experiment">
      <RotateCcw size={18} />
    </button>
  )
}

export function SceneBadge({ children }) {
  return (
    <div className="scene-badge">
      <Gauge size={15} aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}

export function SectionHeader({ kicker, title, children }) {
  return (
    <header className="lesson-heading">
      <span className="lesson-kicker">{kicker}</span>
      <h1>{title}</h1>
      <p>{children}</p>
    </header>
  )
}

export function ForceLegend({ items }) {
  return (
    <div className="force-legend" aria-label="Force vector legend">
      {items.map(({ color, label }) => (
        <span key={label}><i style={{ background: color }} />{label}</span>
      ))}
    </div>
  )
}

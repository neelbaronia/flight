import { useEffect, useState } from 'react'
import { WingLab } from './labs/WingLab.jsx'
import { WrightLab } from './labs/WrightLab.jsx'
import { JetLab } from './labs/JetLab.jsx'

const labs = [
  { id: 'wing', number: '01', label: 'The wing', short: 'Wing', component: WingLab },
  { id: 'wright', number: '02', label: '1903 Flyer', short: 'Flyer', component: WrightLab },
  { id: 'jet', number: '03', label: 'Boeing 747', short: '747', component: JetLab },
]

export default function App() {
  const [activeId, setActiveId] = useState(() => window.location.hash.replace('#', '') || 'wing')
  const activeIndex = Math.max(0, labs.findIndex((lab) => lab.id === activeId))
  const ActiveLab = labs[activeIndex].component

  useEffect(() => {
    const onHash = () => setActiveId(window.location.hash.replace('#', '') || 'wing')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const chooseLab = (id) => {
    setActiveId(id)
    window.history.replaceState(null, '', `#${id}`)
  }

  return (
    <main className={`app-shell app-shell--${labs[activeIndex].id === 'wing' ? 'painted-notes' : 'cake-box'}`}>
      <header className="site-header">
        <a className="site-title" href="#wing" onClick={() => chooseLab('wing')}>HOW FLIGHT WORKS</a>
      </header>

      <nav className="lab-tabs" aria-label="Flight experiments">
        {labs.map((lab, index) => (
          <button
            key={lab.id}
            type="button"
            className={index === activeIndex ? 'is-active' : ''}
            onClick={() => chooseLab(lab.id)}
            aria-current={index === activeIndex ? 'page' : undefined}
          >
            <span>{lab.number}</span>
            <strong className="tab-long">{lab.label}</strong>
            <strong className="tab-short">{lab.short}</strong>
          </button>
        ))}
      </nav>

      <div className="lab-stage" key={labs[activeIndex].id}>
        <ActiveLab />
      </div>
    </main>
  )
}

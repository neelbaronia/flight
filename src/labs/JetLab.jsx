import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useRef, useState } from 'react'
import { Cloud, ForceArrow, StudioLights } from '../components/SceneKit.jsx'
import { Equation, Metric, Note, ResetButton, SceneBadge, SectionHeader, Slider } from '../components/LabUI.jsx'
import { clamp, flightForces, formatForce, GRAVITY } from '../physics.js'

function Engine({ position }) {
  return (
    <group position={position} rotation={[Math.PI / 2, 0, 0]}>
      <mesh castShadow><cylinderGeometry args={[0.34, 0.46, 1.05, 24]} /><meshStandardMaterial color="#f2c54a" roughness={0.5} /></mesh>
      <mesh position={[0, -0.53, 0]}><torusGeometry args={[0.34, 0.07, 10, 24]} /><meshStandardMaterial color="#9d4438" metalness={0.25} /></mesh>
      <mesh position={[0, -0.55, 0]} rotation={[Math.PI / 2, 0, 0]}><circleGeometry args={[0.3, 20]} /><meshStandardMaterial color="#304b53" /></mesh>
    </group>
  )
}

function JumboModel({ pitch, bank, flaps }) {
  const flapAngle = (flaps * Math.PI) / 150
  return (
    <group rotation={[(bank * Math.PI) / 180, 0, (-pitch * Math.PI) / 180]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow><capsuleGeometry args={[0.62, 6.1, 12, 28]} /><meshStandardMaterial color="#fff8e9" roughness={0.58} /></mesh>
      <mesh position={[0, 0.32, -1.4]} rotation={[Math.PI / 2, 0, 0]}><capsuleGeometry args={[0.5, 1.7, 8, 20]} /><meshStandardMaterial color="#fff8e9" /></mesh>
      <mesh position={[0, 0.03, 0.3]} castShadow><boxGeometry args={[8.7, 0.13, 1.5]} /><meshStandardMaterial color="#f0a9bd" roughness={0.72} /></mesh>
      <mesh position={[0, -0.03, 0.95]} rotation={[flapAngle, 0, 0]}><boxGeometry args={[6.5, 0.08, 0.48]} /><meshStandardMaterial color="#dd7185" /></mesh>
      <mesh position={[0, 0.15, 3.05]}><boxGeometry args={[3.25, 0.1, 0.8]} /><meshStandardMaterial color="#f0a9bd" /></mesh>
      <mesh position={[0, 0.82, 3.28]} rotation={[0.38, 0, 0]}><boxGeometry args={[0.12, 1.8, 1.15]} /><meshStandardMaterial color="#e45845" /></mesh>
      <mesh position={[0, -0.42, -0.6]}><boxGeometry args={[0.83, 0.08, 5.45]} /><meshStandardMaterial color="#e45845" /></mesh>
      {[[-2.45, -0.42, 0.1], [-1.2, -0.46, -0.25], [1.2, -0.46, -0.25], [2.45, -0.42, 0.1]].map((position, i) => <Engine key={i} position={position} />)}
      {Array.from({ length: 14 }, (_, i) => (
        <mesh key={i} position={[(i % 2 ? 1 : -1) * 0.6, 0.14, -2.5 + Math.floor(i / 2) * 0.65]}>
          <circleGeometry args={[0.035, 10]} /><meshBasicMaterial color="#245c6b" /></mesh>
      ))}
      <mesh position={[-0.25, 0.26, -3.46]} rotation={[Math.PI / 2, 0, 0]}><circleGeometry args={[0.1, 12]} /><meshBasicMaterial color="#254c59" /></mesh>
      <mesh position={[0.25, 0.26, -3.46]} rotation={[Math.PI / 2, 0, 0]}><circleGeometry args={[0.1, 12]} /><meshBasicMaterial color="#254c59" /></mesh>
    </group>
  )
}

function JetScene({ pitch, bank, flaps, speed, liftRatio }) {
  const jet = useRef()
  useFrame((state) => {
    if (jet.current) jet.current.position.y = Math.sin(state.clock.elapsedTime * 0.7) * 0.035
  })
  return (
    <>
      <color attach="background" args={['#88cddd']} />
      <fog attach="fog" args={['#88cddd', 16, 38]} />
      <StudioLights />
      <Cloud position={[-7, -1.6, -6]} scale={1.5} />
      <Cloud position={[7, 2.8, -10]} scale={0.9} />
      <Cloud position={[5, -2, 2]} scale={0.7} />
      <group ref={jet}><JumboModel pitch={pitch} bank={bank} flaps={flaps} /></group>
      <ForceArrow from={[0, 0.7, 0]} direction={[0, 1, 0]} length={Math.min(2.5, 0.7 + liftRatio * 0.8)} color="#e6543f" label="LIFT" />
      <ForceArrow from={[0, -0.6, 0]} direction={[0, -1, 0]} length={1.5} color="#2d6171" label="WEIGHT" />
      <ForceArrow from={[0, -0.15, 2.4]} direction={[0, 0, 1]} length={Math.min(2.1, speed / 130)} color="#f4cd4f" label="THRUST" />
      <OrbitControls enablePan={false} minDistance={8} maxDistance={15} minPolarAngle={0.7} maxPolarAngle={2.05} />
    </>
  )
}

export function JetLab() {
  const [thrust, setThrust] = useState(72)
  const [pitch, setPitch] = useState(2.5)
  const [flaps, setFlaps] = useState(0)
  const [bank, setBank] = useState(0)
  const mass = 285_000
  const speed = 70 + thrust * 2.05
  const flapBoost = 0.3 + flaps * 0.025
  const forces = flightForces({ speed, area: 511, angle: pitch, dragCoefficient: 0.022, flapBoost, density: 0.38 })
  const weight = mass * GRAVITY
  const liftRatio = clamp(forces.lift / weight, 0, 2.4)
  const verticalLift = forces.lift * Math.cos((bank * Math.PI) / 180)
  const state = verticalLift > weight * 1.08 ? 'Climbing' : verticalLift < weight * 0.92 ? 'Descending' : 'Holding altitude'
  const altitude = 10670

  const reset = () => { setThrust(72); setPitch(2.5); setFlaps(0); setBank(0) }

  return (
    <div className="lab-layout lab-layout--cake-box">
      <section className="demo-pane demo-pane--jet" aria-label="Interactive Boeing 747 model">
        <div className="scene-toolbar"><SceneBadge>{state} · FL350</SceneBadge><ResetButton onClick={reset} /></div>
        <Canvas camera={{ position: [9.5, 5.5, 9], fov: 42 }} shadows dpr={[1, 1.75]} gl={{ preserveDrawingBuffer: true }}>
          <JetScene pitch={pitch} bank={bank} flaps={flaps} speed={speed} liftRatio={liftRatio} />
        </Canvas>
        <div className="instrument-cluster">
          <div className="dial" style={{ '--needle': `${-110 + (speed / 300) * 220}deg` }}><i /><span>{Math.round(speed * 1.944)}</span><small>KNOTS</small></div>
          <div className="attitude"><span style={{ transform: `rotate(${-bank}deg) translateY(${pitch * 1.5}px)` }} /><b>{bank > 2 ? 'BANK R' : bank < -2 ? 'BANK L' : 'WINGS LEVEL'}</b></div>
          <div className="altimeter"><span>35,000</span><small>FEET</small><b>{state.toUpperCase()}</b></div>
        </div>
      </section>

      <aside className="lesson-pane">
        <SectionHeader kicker="Experiment 03 · The jumbo jet" title="Same four forces. Much bigger numbers.">
          A 747 obeys exactly the same physics as the Flyer. Swept wings, flaps, and four engines simply manage those forces across a far wider range.
        </SectionHeader>

        <div className="control-group">
          <div className="group-title"><span>Flight deck</span><small>Hold altitude while banking</small></div>
          <Slider label="Engine thrust" value={thrust} min={20} max={100} unit="%" onChange={setThrust} />
          <Slider label="Pitch" value={pitch} min={-2} max={9} step={0.5} unit="°" onChange={setPitch} accent="#6e4c9b" />
          <Slider label="Flaps" value={flaps} min={0} max={30} unit="°" onChange={setFlaps} accent="#27829c" />
          <Slider label="Bank angle" value={bank} min={-35} max={35} unit="°" onChange={setBank} accent="#d38d27" />
        </div>

        <div className="metric-grid">
          <Metric label="Lift" value={formatForce(forces.lift)} />
          <Metric label="Weight" value={formatForce(weight)} tone="blue" />
          <Metric label="Drag" value={formatForce(forces.drag)} tone="violet" />
          <Metric label="Altitude" value={`${(altitude / 1000).toFixed(1)} km`} tone="yellow" />
        </div>

        <section className="lesson-section">
          <h2>A bank spends some lift</h2>
          <Equation caption="When the airplane tilts, only the vertical part of lift holds it up. The sideways part bends the flight path into a turn."
            values={`${formatForce(forces.lift)} × cos(${Math.abs(bank)}°) = ${formatForce(verticalLift)} upward`}>
            L<sub>vertical</sub> = L cos(θ)
          </Equation>
          <Note>Bank to 30° and watch the status. To stay level, a pilot gently increases pitch, creating enough extra lift to replace the part used for turning.</Note>
        </section>

        <section className="lesson-section system-list">
          <h2>What the controls change</h2>
          <div><i className="system-icon system-icon--flaps" /><p><strong>Flaps reshape the wing.</strong><span>More curve makes more lift at low speed, but also much more drag.</span></p></div>
          <div><i className="system-icon system-icon--engines" /><p><strong>Engines replace lost energy.</strong><span>Thrust overcomes drag and keeps air moving rapidly over the wings.</span></p></div>
          <div><i className="system-icon system-icon--sweep" /><p><strong>Sweep delays compressibility.</strong><span>Angled wings help the airplane fly efficiently near the speed of sound.</span></p></div>
        </section>

        <section className="lesson-section">
          <h2>Scale changes engineering, not physics</h2>
          <p className="body-copy">At cruise, a 747’s wings can support hundreds of tonnes because enormous wing area and high speed make the ½ρv² term enormous, even though thin high-altitude air has low density.</p>
        </section>
      </aside>
    </div>
  )
}

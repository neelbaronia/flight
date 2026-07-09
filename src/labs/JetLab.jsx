import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import { useEffect, useRef, useState } from 'react'
import { Cloud, ForceArrow, StudioLights } from '../components/SceneKit.jsx'
import { Equation, Metric, Note, ResetButton, SceneBadge, SectionHeader, Slider } from '../components/LabUI.jsx'
import { useTimeOfDay } from '../hooks/useTimeOfDay.js'
import { clamp, flightForces, formatForce, GRAVITY, liftCoefficient } from '../physics.js'

const JET_MASS = 285_000
const JET_AREA = 511
const JET_CRUISE_DENSITY = 0.38
const JET_INITIAL_ALTITUDE = 10_670
const JET_MAX_THRUST = 250_000
const JET_SIMULATION_RATE = 10
const JET_INITIAL_SPEED = Math.sqrt(
  (2 * JET_MASS * GRAVITY) / (JET_CRUISE_DENSITY * JET_AREA * liftCoefficient(2.5, 0.3)),
)
const INITIAL_JET_TELEMETRY = {
  speed: JET_INITIAL_SPEED,
  altitude: JET_INITIAL_ALTITUDE,
  verticalSpeed: 0,
  angleOfAttack: 2.5,
  verticalAcceleration: 0,
  netVerticalForce: 0,
  flightPathAngle: 0,
}

const JET_ATMOSPHERE = {
  day: { sky: '#88cddd', fog: '#88cddd', cloud: '#fff9ed' },
  evening: { sky: '#958cc4', fog: '#bc9fbe', cloud: '#eed4e8' },
  night: { sky: '#122848', fog: '#233e63', cloud: '#7184a5' },
}

function densityAtAltitude(altitude) {
  return clamp(JET_CRUISE_DENSITY * Math.exp((JET_INITIAL_ALTITUDE - altitude) / 8500), 0.24, 0.65)
}

function useJetSimulation(thrust, pitch, flaps, bank, resetSignal) {
  const controls = useRef({ thrust, pitch, flaps, bank })
  const [telemetry, setTelemetry] = useState(INITIAL_JET_TELEMETRY)

  useEffect(() => {
    controls.current = { thrust, pitch, flaps, bank }
  }, [thrust, pitch, flaps, bank])

  useEffect(() => {
    const state = { speed: JET_INITIAL_SPEED, altitude: JET_INITIAL_ALTITUDE, flightPathAngle: 0 }
    let frame
    let lastTime = performance.now()
    let lastPublish = 0

    const tick = (now) => {
      const dt = Math.min((now - lastTime) / 1000, 0.12) * JET_SIMULATION_RATE
      lastTime = now
      const current = controls.current
      const density = densityAtAltitude(state.altitude)
      const flapBoost = 0.3 + current.flaps * 0.025
      const forces = flightForces({ speed: state.speed, area: JET_AREA, angle: current.pitch, dragCoefficient: 0.022, flapBoost, density })
      const engineThrust = (current.thrust / 100) * JET_MAX_THRUST
      const gravityAlongFlightPath = -GRAVITY * Math.sin(state.flightPathAngle)
      const horizontalAcceleration = (engineThrust - forces.drag) / JET_MASS + gravityAlongFlightPath
      state.speed = clamp(state.speed + horizontalAcceleration * dt, 65, 300)

      const verticalLift = forces.lift * Math.cos((current.bank * Math.PI) / 180)
      const netVerticalForce = verticalLift - JET_MASS * GRAVITY
      const verticalAcceleration = netVerticalForce / JET_MASS
      const normalAcceleration = verticalLift / JET_MASS - GRAVITY * Math.cos(state.flightPathAngle)
      const flightPathRate = normalAcceleration / Math.max(state.speed, 65)
      state.flightPathAngle = clamp(state.flightPathAngle + flightPathRate * dt, -0.3, 0.2)
      const verticalSpeed = state.speed * Math.sin(state.flightPathAngle)
      state.altitude = clamp(state.altitude + verticalSpeed * dt, 0, 15_000)
      if ((state.altitude === 0 && verticalSpeed < 0) || (state.altitude === 15_000 && verticalSpeed > 0)) state.flightPathAngle = 0

      if (now - lastPublish > 55) {
        setTelemetry({ ...state, verticalSpeed, angleOfAttack: current.pitch, verticalAcceleration, netVerticalForce })
        lastPublish = now
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [resetSignal])

  return telemetry
}

function Engine({ position }) {
  return (
    <group position={position} rotation={[Math.PI / 2, 0, 0]}>
      <mesh castShadow><cylinderGeometry args={[0.34, 0.46, 1.05, 24]} /><meshStandardMaterial color="#f2c54a" roughness={0.5} /></mesh>
      <mesh position={[0, -0.53, 0]}><torusGeometry args={[0.34, 0.07, 10, 24]} /><meshStandardMaterial color="#9d4438" metalness={0.25} /></mesh>
      <mesh position={[0, -0.55, 0]} rotation={[Math.PI / 2, 0, 0]}><circleGeometry args={[0.3, 20]} /><meshStandardMaterial color="#304b53" /></mesh>
    </group>
  )
}

function JumboModel({ pitch, bank, flaps, time }) {
  const flapAngle = (flaps * Math.PI) / 150
  const night = time === 'night'
  return (
    <group rotation={[(bank * Math.PI) / 180, 0, (-pitch * Math.PI) / 180]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow><capsuleGeometry args={[0.62, 6.1, 12, 28]} /><meshStandardMaterial color={night ? '#dfe8f2' : '#fff8e9'} roughness={0.58} /></mesh>
      <mesh position={[0, 0.32, -1.4]} rotation={[Math.PI / 2, 0, 0]}><capsuleGeometry args={[0.5, 1.7, 8, 20]} /><meshStandardMaterial color={night ? '#dfe8f2' : '#fff8e9'} /></mesh>
      <mesh position={[0, 0.03, 0.3]} castShadow><boxGeometry args={[8.7, 0.13, 1.5]} /><meshStandardMaterial color="#f0a9bd" roughness={0.72} /></mesh>
      <mesh position={[0, -0.03, 0.95]} rotation={[flapAngle, 0, 0]}><boxGeometry args={[6.5, 0.08, 0.48]} /><meshStandardMaterial color="#dd7185" /></mesh>
      <mesh position={[0, 0.15, 3.05]}><boxGeometry args={[3.25, 0.1, 0.8]} /><meshStandardMaterial color="#f0a9bd" /></mesh>
      <mesh position={[0, 0.82, 3.28]} rotation={[0.38, 0, 0]}><boxGeometry args={[0.12, 1.8, 1.15]} /><meshStandardMaterial color="#e45845" /></mesh>
      <mesh position={[0, -0.42, -0.6]}><boxGeometry args={[0.83, 0.08, 5.45]} /><meshStandardMaterial color="#e45845" /></mesh>
      {[[-2.45, -0.42, 0.1], [-1.2, -0.46, -0.25], [1.2, -0.46, -0.25], [2.45, -0.42, 0.1]].map((position, i) => <Engine key={i} position={position} />)}
      {Array.from({ length: 14 }, (_, i) => (
        <mesh key={i} position={[(i % 2 ? 1 : -1) * 0.6, 0.14, -2.5 + Math.floor(i / 2) * 0.65]}>
          <circleGeometry args={[0.035, 10]} /><meshStandardMaterial color={night ? '#fff2a8' : '#245c6b'} emissive={night ? '#ffd968' : '#000000'} emissiveIntensity={night ? 2 : 0} /></mesh>
      ))}
      <mesh position={[-0.25, 0.26, -3.46]} rotation={[Math.PI / 2, 0, 0]}><circleGeometry args={[0.1, 12]} /><meshBasicMaterial color="#254c59" /></mesh>
      <mesh position={[0.25, 0.26, -3.46]} rotation={[Math.PI / 2, 0, 0]}><circleGeometry args={[0.1, 12]} /><meshBasicMaterial color="#254c59" /></mesh>
    </group>
  )
}

function JetScene({ pitch, bank, flaps, liftRatio, time, altitude, verticalSpeed, engineThrust, drag }) {
  const jet = useRef()
  const atmosphere = JET_ATMOSPHERE[time]
  useFrame((state) => {
    if (!jet.current) return
    const altitudeOffset = clamp((altitude - JET_INITIAL_ALTITUDE) / 350, -2.25, 2.25)
    const targetY = altitudeOffset + Math.sin(state.clock.elapsedTime * 0.7) * 0.025
    jet.current.position.y += (targetY - jet.current.position.y) * 0.08
    jet.current.rotation.x = clamp(verticalSpeed / 180, -0.22, 0.16)
  })
  return (
    <>
      <color attach="background" args={[atmosphere.sky]} />
      <fog attach="fog" args={[atmosphere.fog, 16, 38]} />
      <StudioLights time={time} />
      <Cloud position={[-7, -1.6, -6]} scale={1.5} color={atmosphere.cloud} opacity={time === 'night' ? 0.72 : 1} />
      <Cloud position={[7, 2.8, -10]} scale={0.9} color={atmosphere.cloud} opacity={time === 'night' ? 0.72 : 1} />
      <Cloud position={[5, -2, 2]} scale={0.7} color={atmosphere.cloud} opacity={time === 'night' ? 0.72 : 1} />
      {time === 'evening' && <mesh position={[-8, 4.5, -14]}><sphereGeometry args={[0.75, 24, 18]} /><meshBasicMaterial color="#ffd0ac" /></mesh>}
      {time === 'night' && <><Stars radius={28} depth={14} count={700} factor={2.2} saturation={0.15} fade speed={0.2} /><mesh position={[-8, 5, -15]}><sphereGeometry args={[0.52, 24, 18]} /><meshBasicMaterial color="#dce8ff" /></mesh></>}
      <group ref={jet}><JumboModel pitch={pitch} bank={bank} flaps={flaps} time={time} /></group>
      <ForceArrow from={[0, 0.7, 0]} direction={[0, 1, 0]} length={Math.min(2.5, 0.7 + liftRatio * 0.8)} color="#e6543f" label="LIFT" />
      <ForceArrow from={[0, -0.6, 0]} direction={[0, -1, 0]} length={1.5} color="#2d6171" label="WEIGHT" />
      <ForceArrow from={[0, -0.15, -2.4]} direction={[0, 0, -1]} length={0.25 + (engineThrust / JET_MAX_THRUST) * 1.85} color="#f4cd4f" label={`THRUST · ${formatForce(engineThrust)}`} />
      <ForceArrow from={[1.4, 0.1, 0.5]} direction={[0, 0, 1]} length={0.25 + Math.min(1.7, drag / 140_000)} color="#76569b" label={`DRAG · ${formatForce(drag)}`} />
      <OrbitControls enablePan={false} minDistance={8} maxDistance={15} minPolarAngle={0.7} maxPolarAngle={2.05} />
    </>
  )
}

export function JetLab() {
  const [thrust, setThrust] = useState(72)
  const [pitch, setPitch] = useState(2.5)
  const [flaps, setFlaps] = useState(0)
  const [bank, setBank] = useState(0)
  const [resetSignal, setResetSignal] = useState(0)
  const time = useTimeOfDay()
  const telemetry = useJetSimulation(thrust, pitch, flaps, bank, resetSignal)
  const speed = telemetry.speed
  const flapBoost = 0.3 + flaps * 0.025
  const density = densityAtAltitude(telemetry.altitude)
  const forces = flightForces({ speed, area: JET_AREA, angle: telemetry.angleOfAttack, dragCoefficient: 0.022, flapBoost, density })
  const weight = JET_MASS * GRAVITY
  const liftRatio = clamp(forces.lift / weight, 0, 2.4)
  const verticalLift = forces.lift * Math.cos((bank * Math.PI) / 180)
  const engineThrust = (thrust / 100) * JET_MAX_THRUST
  const state = telemetry.verticalSpeed > 2 ? 'Climbing'
    : telemetry.verticalSpeed < -2 ? 'Descending'
      : telemetry.verticalAcceleration > 0.15 ? 'Lift increasing climb'
        : telemetry.verticalAcceleration < -0.15 ? 'Gravity increasing descent' : 'Holding altitude'
  const flightLevel = Math.max(0, Math.round((telemetry.altitude * 3.28084) / 100))

  useEffect(() => {
    document.body.dataset.flightTime = time
    return () => {
      if (document.body.dataset.flightTime === time) delete document.body.dataset.flightTime
    }
  }, [time])

  const reset = () => { setThrust(72); setPitch(2.5); setFlaps(0); setBank(0); setResetSignal((signal) => signal + 1) }

  return (
    <div className={`lab-layout lab-layout--cake-box lab-layout--time-${time}`}>
      <section className="demo-pane demo-pane--jet" aria-label="Interactive Boeing 747 model">
        <div className="scene-toolbar"><SceneBadge>{state} · FL{flightLevel}</SceneBadge><ResetButton onClick={reset} /></div>
        <Canvas camera={{ position: [9.5, 5.5, 9], fov: 42 }} shadows dpr={[1, 1.75]} gl={{ preserveDrawingBuffer: true }}>
          <JetScene pitch={pitch} bank={bank} flaps={flaps} liftRatio={liftRatio} time={time}
            altitude={telemetry.altitude} verticalSpeed={telemetry.verticalSpeed} engineThrust={engineThrust} drag={forces.drag} />
        </Canvas>
        <div className="instrument-cluster">
          <div className="dial" style={{ '--needle': `${-110 + (speed / 300) * 220}deg` }}><i /><span>{Math.round(speed * 1.944)}</span><small>KNOTS</small></div>
          <div className="attitude"><span style={{ transform: `rotate(${-bank}deg) translateY(${pitch * 1.5}px)` }} /><b>{bank > 2 ? 'BANK R' : bank < -2 ? 'BANK L' : 'WINGS LEVEL'}</b></div>
          <div className="altimeter"><span>{Math.round(telemetry.altitude * 3.28084).toLocaleString()}</span><small>FEET</small><b>{state.toUpperCase()}</b></div>
        </div>
      </section>

      <aside className="lesson-pane">
        <SectionHeader kicker="Experiment 03 · The jumbo jet" title="Same four forces. Much bigger numbers.">
          A 747 obeys exactly the same physics as the Flyer. Swept wings, flaps, and four engines simply manage those forces across a far wider range.
        </SectionHeader>

        <div className="control-group">
          <div className="group-title"><span>Flight deck</span><small>Hold altitude while banking</small></div>
          <Slider label="Engine thrust" value={thrust} min={0} max={100} unit="%" onChange={setThrust} />
          <Slider label="Pitch" value={pitch} min={-2} max={9} step={0.5} unit="°" onChange={setPitch} accent="#6e4c9b" />
          <Slider label="Flaps" value={flaps} min={0} max={30} unit="°" onChange={setFlaps} accent="#27829c" />
          <Slider label="Bank angle" value={bank} min={-35} max={35} unit="°" onChange={setBank} accent="#d38d27" />
        </div>

        <div className="metric-grid">
          <Metric label="Lift" value={formatForce(forces.lift)} />
          <Metric label="Weight" value={formatForce(weight)} tone="blue" />
          <Metric label="Drag" value={formatForce(forces.drag)} tone="violet" />
          <Metric label="Thrust" value={formatForce(engineThrust)} tone="yellow" />
          <Metric label="Altitude" value={`${(telemetry.altitude / 1000).toFixed(2)} km`} tone="yellow" />
          <Metric label="Vertical speed" value={`${telemetry.verticalSpeed >= 0 ? '+' : ''}${telemetry.verticalSpeed.toFixed(1)} m/s`} tone="blue" />
        </div>

        <section className="lesson-section">
          <h2>Force difference becomes motion</h2>
          <Equation caption="A close match changes vertical speed slowly. A large mismatch creates a much larger acceleration and the altitude begins changing rapidly."
            values={`(${formatForce(verticalLift)} − ${formatForce(weight)}) ÷ ${JET_MASS.toLocaleString()} kg = ${telemetry.verticalAcceleration.toFixed(2)} m/s²`}>
            a<sub>vertical</sub> = (L<sub>vertical</sub> − W) ÷ m
          </Equation>
          <Note>At zero thrust the 747 initially glides because its existing airspeed still makes lift. Drag then removes speed, lift falls, and the descent steepens. Lowering thrust does not switch gravity on; it removes the energy that was balancing drag.</Note>
        </section>

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

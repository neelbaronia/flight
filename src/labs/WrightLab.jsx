import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useRef, useState } from 'react'
import { Cloud, ForceArrow, Ground, MovingGroundStripes, StudioLights } from '../components/SceneKit.jsx'
import { Equation, Metric, Note, ResetButton, SceneBadge, SectionHeader, Slider } from '../components/LabUI.jsx'
import { clamp, flightForces, formatForce, GRAVITY } from '../physics.js'

function Propeller({ throttle }) {
  const prop = useRef()
  useFrame((_, delta) => {
    if (prop.current) prop.current.rotation.z += delta * (3 + throttle * 0.28)
  })
  return (
    <group ref={prop} position={[0, 0.12, -1.5]}>
      <mesh><boxGeometry args={[0.12, 2.2, 0.08]} /><meshStandardMaterial color="#9b5a3c" /></mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}><boxGeometry args={[0.09, 1.55, 0.07]} /><meshStandardMaterial color="#73412f" /></mesh>
    </group>
  )
}

function FlyerModel({ pitch, warp, throttle }) {
  const frameColor = '#8c503a'
  const fabric = '#f3d267'
  const wingRotation = (warp * Math.PI) / 360
  return (
    <group rotation={[0, 0, (-pitch * Math.PI) / 180]} scale={0.86}>
      {[0.72, -0.72].map((y, index) => (
        <group key={y}>
          <mesh position={[0, y, 0]} rotation={[0, 0, index === 0 ? wingRotation : -wingRotation]} castShadow>
            <boxGeometry args={[7.2, 0.08, 1.55]} />
            <meshStandardMaterial color={fabric} roughness={0.95} />
          </mesh>
          <mesh position={[0, y + (index ? 0.05 : -0.05), 0]}><boxGeometry args={[7.3, 0.045, 0.045]} /><meshStandardMaterial color={frameColor} /></mesh>
        </group>
      ))}
      {[-3.25, -1.7, 0, 1.7, 3.25].map((x) => (
        <mesh key={x} position={[x, 0, 0]}><boxGeometry args={[0.045, 1.48, 0.045]} /><meshStandardMaterial color={frameColor} /></mesh>
      ))}
      <mesh position={[0, -0.84, 0.15]}><boxGeometry args={[2.8, 0.08, 0.12]} /><meshStandardMaterial color={frameColor} /></mesh>
      <mesh position={[0, -0.9, 0.75]} rotation={[0.04, 0, 0]}><boxGeometry args={[2.1, 0.06, 0.08]} /><meshStandardMaterial color={frameColor} /></mesh>
      <mesh position={[0, 0.08, -2.45]}><boxGeometry args={[2.15, 0.07, 0.7]} /><meshStandardMaterial color={fabric} /></mesh>
      <mesh position={[0, 0.45, 1.45]}><boxGeometry args={[1.65, 0.06, 0.65]} /><meshStandardMaterial color={fabric} /></mesh>
      <mesh position={[0, 0.25, 1.75]}><boxGeometry args={[0.08, 1.15, 0.65]} /><meshStandardMaterial color={fabric} /></mesh>
      <mesh position={[-0.55, -0.1, -0.2]}><cylinderGeometry args={[0.22, 0.22, 0.65, 16]} /><meshStandardMaterial color="#6f6a58" metalness={0.3} /></mesh>
      <Propeller throttle={throttle} />
    </group>
  )
}

function FlyerScene({ throttle, pitch, warp, liftRatio }) {
  const plane = useRef()
  useFrame((state) => {
    if (!plane.current) return
    plane.current.position.y = Math.max(-1.2, -0.35 + (liftRatio - 0.7) * 0.75 + Math.sin(state.clock.elapsedTime * 1.6) * 0.025)
    plane.current.rotation.y = (warp * Math.PI) / 1800
  })
  return (
    <>
      <color attach="background" args={['#8dcedc']} />
      <fog attach="fog" args={['#8dcedc', 15, 36]} />
      <StudioLights />
      <Ground color="#e9a16f" y={-2.4} />
      <MovingGroundStripes speed={0.2 + throttle / 20} y={-2.39} />
      <Cloud position={[-6, 3.1, -8]} scale={0.9} />
      <Cloud position={[7, 4, -11]} scale={1.2} />
      <group ref={plane}><FlyerModel pitch={pitch} warp={warp} throttle={throttle} /></group>
      <ForceArrow from={[0, 0.6, 0]} direction={[0, 1, 0]} length={Math.min(2.3, 0.6 + liftRatio)} color="#e6543f" label="LIFT" />
      <ForceArrow from={[0, -0.75, 0]} direction={[0, -1, 0]} length={1.55} color="#2d6171" label="WEIGHT" />
      <OrbitControls enablePan={false} minDistance={7} maxDistance={13} minPolarAngle={0.8} maxPolarAngle={1.9} />
    </>
  )
}

export function WrightLab() {
  const [throttle, setThrottle] = useState(72)
  const [pitch, setPitch] = useState(5)
  const [warp, setWarp] = useState(0)
  const mass = 340
  const speed = 3.5 + throttle * 0.12
  const forces = flightForces({ speed, area: 47.4, angle: pitch, dragCoefficient: 0.055, flapBoost: 0.28 })
  const weight = mass * GRAVITY
  const liftRatio = clamp(forces.lift / weight, 0, 2.2)
  const airborne = forces.lift >= weight * 0.88
  const thrust = throttle * 4.2

  const reset = () => { setThrottle(72); setPitch(5); setWarp(0) }

  return (
    <div className="lab-layout lab-layout--cake-box">
      <section className="demo-pane demo-pane--wright" aria-label="Interactive Wright Flyer model">
        <div className="scene-toolbar"><SceneBadge>{airborne ? 'Airborne over Kitty Hawk' : 'Building takeoff speed'}</SceneBadge><ResetButton onClick={reset} /></div>
        <Canvas camera={{ position: [8, 4.5, 8], fov: 44 }} shadows dpr={[1, 1.75]} gl={{ preserveDrawingBuffer: true }}>
          <FlyerScene throttle={throttle} pitch={pitch} warp={warp} liftRatio={liftRatio} />
        </Canvas>
        <div className="hud-strip">
          <span><small>AIRSPEED</small><b>{speed.toFixed(1)} m/s</b></span>
          <span><small>LIFT / WEIGHT</small><b>{liftRatio.toFixed(2)}</b></span>
          <span><small>ROLL INPUT</small><b>{warp > 0 ? 'RIGHT' : warp < 0 ? 'LEFT' : 'LEVEL'}</b></span>
        </div>
      </section>

      <aside className="lesson-pane">
        <SectionHeader kicker="Experiment 02 · 1903" title="Control was the real breakthrough.">
          The Wright Flyer was fragile and underpowered. Its genius was three-axis control: pitch, roll, and yaw let the pilot keep it balanced.
        </SectionHeader>

        <div className="control-group">
          <div className="group-title"><span>Pilot controls</span><small>Find a stable climb</small></div>
          <Slider label="Engine throttle" value={throttle} min={0} max={100} unit="%" onChange={setThrottle} />
          <Slider label="Elevator / pitch" value={pitch} min={-3} max={12} unit="°" onChange={setPitch} accent="#6e4c9b" />
          <Slider label="Wing warp / roll" value={warp} min={-10} max={10} unit="°" onChange={setWarp} accent="#27829c" />
        </div>

        <div className="metric-grid">
          <Metric label="Lift" value={formatForce(forces.lift)} />
          <Metric label="Weight" value={formatForce(weight)} tone="blue" />
          <Metric label="Thrust" value={formatForce(thrust)} tone="yellow" />
          <Metric label="Drag" value={formatForce(forces.drag)} tone="violet" />
        </div>

        <section className="lesson-section">
          <h2>Takeoff is a force contest</h2>
          <Equation caption="When lift grows larger than weight, the net vertical force points up. Then the airplane accelerates upward."
            values={`${formatForce(forces.lift)} − ${formatForce(weight)} = ${formatForce(forces.lift - weight)}`}>
            F<sub>vertical</sub> = L − mg
          </Equation>
          <Note>The 1903 Flyer lifted off near 12 m/s, about the speed of a fast cyclist. Try reaching that speed with 3–6° of pitch.</Note>
        </section>

        <section className="lesson-section axis-guide">
          <h2>Three ways to turn</h2>
          <div><span className="axis-chip axis-chip--pitch">PITCH</span><p><strong>Nose up or down</strong> · the front elevator changes lift ahead of the wings.</p></div>
          <div><span className="axis-chip axis-chip--roll">ROLL</span><p><strong>Bank left or right</strong> · cables twist, or “warp,” the two wing tips.</p></div>
          <div><span className="axis-chip axis-chip--yaw">YAW</span><p><strong>Nose left or right</strong> · the rear rudder coordinates the turn.</p></div>
        </section>

        <section className="lesson-section">
          <h2>Why two wings?</h2>
          <p className="body-copy">A biplane stacks two large lifting surfaces into a compact, braced structure. The struts add drag, but in 1903 the extra area and strength mattered more than high speed.</p>
        </section>
      </aside>
    </div>
  )
}

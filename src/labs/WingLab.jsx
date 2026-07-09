import { Canvas, useFrame } from '@react-three/fiber'
import { Line, OrbitControls, Text } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { ForceArrow, StudioLights } from '../components/SceneKit.jsx'
import { Equation, ForceLegend, Metric, Note, ResetButton, SceneBadge, SectionHeader, Slider } from '../components/LabUI.jsx'
import { clamp, flightForces, formatForce } from '../physics.js'

const FLOW_LANES = [-1.55, -0.9, 0.88, 1.5]
const SURFACE_POINTS = Array.from({ length: 26 }, (_, index) => {
  const progress = (index + 0.5) / 26
  const curve = Math.sin(progress * Math.PI)
  return {
    x: 4 + progress * 92,
    top: 48 - curve * 31,
    bottom: 54 + curve * 24,
    delay: index * 32,
  }
})

function PressureExplainer() {
  const diagram = useRef()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!diagram.current || !('IntersectionObserver' in window)) {
      setVisible(true)
      return undefined
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true)
        observer.disconnect()
      }
    }, { threshold: 0.45, rootMargin: '0px 0px -12% 0px' })
    observer.observe(diagram.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={diagram} className={`pressure-explainer ${visible ? 'is-visible' : ''}`} aria-label="Tiny pressure forces distributed over the wing surface">
      <div className="pressure-explainer__top"><span>↓</span><span>↓</span><span>↓</span><b>Lower pressure above</b></div>
      <div className="pressure-explainer__wing">
        <strong>THE WING'S SKIN</strong>
        <div className="surface-points" aria-hidden="true">
          {SURFACE_POINTS.map((point, index) => (
            <span
              key={`upper-${index}`}
              className={`pressure-point pressure-point--upper ${index % 5 === 0 ? 'pressure-point--major' : ''}`}
              style={{ left: `${point.x}%`, top: `${point.top}%`, '--point-delay': `${point.delay}ms` }}
            />
          ))}
          {SURFACE_POINTS.map((point, index) => (
            <span
              key={`lower-${index}`}
              className={`pressure-point pressure-point--lower ${index % 4 === 0 ? 'pressure-point--major' : ''}`}
              style={{ left: `${point.x}%`, top: `${point.bottom}%`, '--point-delay': `${point.delay + 130}ms` }}
            />
          ))}
        </div>
      </div>
      <div className="pressure-explainer__bottom"><b>Higher pressure below</b><span>↑</span><span>↑</span><span>↑</span></div>
      <div className="pressure-explainer__caption">Each dot is one tiny patch. Add every patch to get net lift.</div>
    </div>
  )
}

function Airfoil({ angle, camber }) {
  const geometry = useMemo(() => {
    const camberOffset = camber * 0.035
    const shape = new THREE.Shape()
    shape.moveTo(-2.4, 0)
    shape.bezierCurveTo(-1.2, 0.38 + camberOffset, 0.85, 0.41 + camberOffset, 2.3, 0.06)
    shape.bezierCurveTo(2.34, -0.13, 0.7, -0.32 + camberOffset, -2.4, 0)
    const built = new THREE.ExtrudeGeometry(shape, { depth: 2.8, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 3 })
    built.translate(0, 0, -1.4)
    return built
  }, [camber])

  return (
    <group rotation={[0, 0, (angle * Math.PI) / 180]}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color="#f7c84b" roughness={0.72} metalness={0.02} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[geometry, 18]} />
        <lineBasicMaterial color="#963f35" linewidth={2} />
      </lineSegments>
    </group>
  )
}

function AngleGuide({ angle, camber }) {
  const radians = (angle * Math.PI) / 180
  const arc = useMemo(() => Array.from({ length: 19 }, (_, index) => {
    const theta = radians * (index / 18)
    return [Math.cos(theta) * 1.28, Math.sin(theta) * 1.28, 1.78]
  }), [radians])
  const meanLine = useMemo(() => Array.from({ length: 31 }, (_, index) => {
    const progress = index / 30
    const x = -2.4 + progress * 4.7
    const y = camber * 0.035 * Math.sin(progress * Math.PI)
    return [x, y + 0.025, 1.84]
  }), [camber])
  const labelAngle = radians / 2

  return (
    <group>
      <Line points={[[-3.25, 0, 1.76], [3.25, 0, 1.76]]} color="#3f9a9d" lineWidth={2.3} dashed dashSize={0.18} gapSize={0.1} />
      <group rotation={[0, 0, radians]}>
        <Line points={[[-2.55, 0, 1.8], [2.55, 0, 1.8]]} color="#e6543f" lineWidth={3.2} />
        <Text position={[-1.7, 0.22, 1.82]} fontSize={0.18} color="#a9443a" outlineWidth={0.014} outlineColor="#f5eadb">CHORD</Text>
        <Line points={meanLine} color="#f0b918" lineWidth={4} />
        <Line points={[[0, 0.02, 1.86], [0, camber * 0.035, 1.86]]} color="#9b741b" lineWidth={2} />
        <Text position={[-0.15, 0.4 + camber * 0.035, 1.86]} fontSize={0.17} color="#8f6712" outlineWidth={0.014} outlineColor="#f5eadb">MEAN LINE · {camber}%</Text>
      </group>
      <Line points={arc} color="#76569b" lineWidth={4} />
      <Text
        position={[Math.cos(labelAngle) * 1.68, Math.sin(labelAngle) * 1.68 + 0.12, 1.8]}
        fontSize={0.24}
        color="#65468b"
        outlineWidth={0.016}
        outlineColor="#f5eadb"
      >AoA · {angle}°</Text>
    </group>
  )
}

function flowHeight(x, lane, deflection, stalled = false) {
  const aroundWing = Math.abs(x) < 2.45 ? Math.cos((x / 2.45) * (Math.PI / 2)) : 0
  const contour = lane > 0 ? aroundWing * 0.34 : -aroundWing * 0.1
  const downwash = x < -1.8 ? ((-x - 1.8) / 3.2) * deflection : 0
  const separated = stalled && lane > 0 && x < 1.75
    ? clamp((1.75 - x) / 2.7, 0, 1) * 1.15 + Math.sin(x * 3.2 + lane) * 0.16
    : 0
  return lane + contour + separated - downwash
}

function DeflectedAirflow({ speed, cl, stalled, showDownwash }) {
  const particles = useRef()
  const deflection = clamp(Math.abs(cl) * 0.72, 0.12, 1.05)
  const paths = useMemo(() => FLOW_LANES.map((lane, index) => ({
    z: -1.75 + index * 1.15,
    points: Array.from({ length: 25 }, (_, step) => {
      const x = -5.2 + step * (10.4 / 24)
      return [x, flowHeight(x, lane, deflection, stalled), -1.75 + index * 1.15]
    }),
  })), [deflection, stalled])

  useFrame((state) => {
    if (!particles.current) return
    const travel = state.clock.elapsedTime * (0.7 + speed / 15)
    particles.current.children.forEach((particle) => {
      const { phase, lane, z } = particle.userData
      const x = 5.2 - ((phase + travel) % 10.4)
      const nextX = x - 0.08
      particle.position.set(x, flowHeight(x, lane, deflection, stalled), z)
      particle.rotation.z = Math.atan2(flowHeight(nextX, lane, deflection, stalled) - flowHeight(x, lane, deflection, stalled), -0.08)
    })
  })

  return (
    <group>
      {paths.map((path) => <Line key={path.z} points={path.points} color="#4a9fa2" lineWidth={1.25} transparent opacity={0.34} />)}
      <group ref={particles}>
        {Array.from({ length: 36 }, (_, index) => {
          const lane = FLOW_LANES[index % FLOW_LANES.length]
          return (
            <mesh key={index} userData={{ phase: (index / 36) * 10.4, lane, z: -1.75 + (index % FLOW_LANES.length) * 1.15 }}>
              <boxGeometry args={[0.32, 0.025, 0.025]} />
              <meshBasicMaterial color="#3e999c" />
            </mesh>
          )
        })}
      </group>
      {showDownwash && (
        <Text position={[-4.65, -1.9 - deflection, 1.4]} fontSize={0.22} color="#285b60" outlineWidth={0.012} outlineColor="#f5eadb">
          DOWNWASH ←
        </Text>
      )}
      {stalled && <StallVortices />}
    </group>
  )
}

function StallVortices() {
  const swirls = useMemo(() => [-1.35, -0.2, 0.9].map((x, index) => ({
    x,
    points: Array.from({ length: 22 }, (_, step) => {
      const angle = step * 0.48
      const radius = 0.04 + step * 0.012
      return [x + Math.cos(angle) * radius, 1.15 + index * 0.18 + Math.sin(angle) * radius, 1.72]
    }),
  })), [])
  return (
    <group>
      {swirls.map((swirl) => <Line key={swirl.x} points={swirl.points} color="#e6543f" lineWidth={2.5} />)}
      <Text position={[-0.2, 2.18, 1.72]} fontSize={0.23} color="#9b3e35" outlineWidth={0.016} outlineColor="#fff5e7">
        SEPARATED · TUMBLING AIR
      </Text>
    </group>
  )
}

function PairedPackets({ speed, stalled }) {
  const upper = useRef()
  const lower = useRef()
  const startTime = useRef(null)
  const curves = useMemo(() => ({
    upper: new THREE.CatmullRomCurve3([
      new THREE.Vector3(5.1, 0.43, 1.72), new THREE.Vector3(2.55, 0.43, 1.72),
      new THREE.Vector3(1.6, 0.88, 1.72), new THREE.Vector3(0, 1.02, 1.72),
      new THREE.Vector3(-1.5, stalled ? 1.7 : 0.72, 1.72), new THREE.Vector3(-3.2, stalled ? 1.55 : 0.12, 1.72),
      new THREE.Vector3(-5.1, stalled ? 1.12 : -0.68, 1.72),
    ]),
    lower: new THREE.CatmullRomCurve3([
      new THREE.Vector3(5.1, -0.35, 1.72), new THREE.Vector3(2.55, -0.35, 1.72),
      new THREE.Vector3(1.5, -0.46, 1.72), new THREE.Vector3(0, -0.4, 1.72),
      new THREE.Vector3(-1.5, -0.3, 1.72), new THREE.Vector3(-3.2, -0.55, 1.72),
      new THREE.Vector3(-5.1, -0.98, 1.72),
    ]),
  }), [stalled])
  const upperPath = useMemo(() => curves.upper.getPoints(45).map(({ x, y, z }) => [x, y, z]), [curves])
  const lowerPath = useMemo(() => curves.lower.getPoints(45).map(({ x, y, z }) => [x, y, z]), [curves])

  useFrame((state) => {
    if (startTime.current === null) startTime.current = state.clock.elapsedTime
    const elapsed = state.clock.elapsedTime - startTime.current
    const cycle = (elapsed * (0.045 + speed / 700)) % 1
    const upperProgress = stalled ? cycle : clamp(cycle < 0.22 ? cycle : 0.22 + (cycle - 0.22) * 1.22, 0, 0.999)
    const upperPoint = curves.upper.getPointAt(upperProgress)
    const lowerPoint = curves.lower.getPointAt(cycle)
    if (upper.current) upper.current.position.copy(upperPoint)
    if (lower.current) lower.current.position.copy(lowerPoint)
  })

  return (
    <group>
      <Line points={upperPath} color={stalled ? '#e6543f' : '#27829c'} lineWidth={3} transparent opacity={0.75} />
      <Line points={lowerPath} color="#d66788" lineWidth={3} transparent opacity={0.75} />
      <group ref={upper}>
        <mesh><sphereGeometry args={[0.16, 18, 14]} /><meshBasicMaterial color={stalled ? '#e6543f' : '#27829c'} /></mesh>
        <Text position={[0, 0.3, 0]} fontSize={0.2} color={stalled ? '#9b3e35' : '#185f72'} outlineWidth={0.015} outlineColor="#fff9ef">A</Text>
      </group>
      <group ref={lower}>
        <mesh><sphereGeometry args={[0.16, 18, 14]} /><meshBasicMaterial color="#d66788" /></mesh>
        <Text position={[0, -0.3, 0]} fontSize={0.2} color="#a04362" outlineWidth={0.015} outlineColor="#fff9ef">B</Text>
      </group>
      <Text position={[3.85, 0.95, 1.74]} fontSize={0.18} color="#315964" outlineWidth={0.014} outlineColor="#fff9ef">START TOGETHER</Text>
      <Text position={[2.7, 0.08, 1.74]} fontSize={0.17} color="#8f4036" outlineWidth={0.014} outlineColor="#fff9ef">FLOW SPLITS HERE</Text>
      <Text position={[-3.6, stalled ? 2.05 : 0.68, 1.74]} fontSize={0.18} color="#315964" outlineWidth={0.014} outlineColor="#fff9ef">
        {stalled ? 'A PEELS AWAY' : 'A GETS AHEAD'}
      </Text>
    </group>
  )
}

function MovingLandscape({ speed }) {
  const fields = useRef()
  useFrame((_, delta) => {
    if (!fields.current) return
    fields.current.children.forEach((field) => {
      field.position.x -= delta * (0.4 + speed / 13)
      if (field.position.x < -14) field.position.x += 28
    })
  })
  const colors = ['#e3c681', '#f1c34a', '#e56b62', '#54a0a2', '#eaa5b3']
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.15, 0]} receiveShadow>
        <planeGeometry args={[45, 35]} /><meshStandardMaterial color="#ead8b7" roughness={1} />
      </mesh>
      <group ref={fields}>
        {Array.from({ length: 12 }, (_, index) => (
          <mesh key={index} rotation={[-Math.PI / 2, 0, 0]} position={[index * 2.5 - 14, -3.12, (index % 3) * 4 - 4]}>
            <planeGeometry args={[1.8, 3.2]} /><meshBasicMaterial color={colors[index % colors.length]} transparent opacity={0.8} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function surfaceHeight(x, camber, side) {
  const progress = clamp((x + 2.4) / 4.7, 0, 1)
  const envelope = Math.sin(progress * Math.PI) ** 0.7
  const centerline = camber * 0.035 * envelope
  const thickness = 0.34 * envelope
  return side === 'upper' ? centerline + thickness : centerline - thickness * 0.72
}

function SurfacePressure({ liftPositive, angle, camber }) {
  const dots = useRef()
  const startTime = useRef(null)
  const xPositions = [-1.35, 0, 1.35]
  const topLength = liftPositive ? 0.42 : 0.82
  const bottomLength = liftPositive ? 0.82 : 0.42
  const samples = useMemo(() => {
    const chordSamples = Array.from({ length: 10 }, (_, index) => -2.05 + index * (4.05 / 9))
    const spanSamples = [-1.15, -0.7, -0.25, 0.2, 0.65, 1.1, 1.38]
    return ['upper', 'lower'].flatMap((side) => chordSamples.flatMap((x, chordIndex) => spanSamples.map((z, spanIndex) => ({
      x,
      y: surfaceHeight(x, camber, side) + (side === 'upper' ? 0.065 : -0.055),
      z,
      side,
      delay: chordIndex * 0.035 + spanIndex * 0.018 + (side === 'lower' ? 0.16 : 0),
    }))))
  }, [camber])

  useFrame((state) => {
    if (!dots.current) return
    if (startTime.current === null) startTime.current = state.clock.elapsedTime
    const elapsed = state.clock.elapsedTime - startTime.current
    dots.current.children.forEach((dot) => {
      const progress = clamp((elapsed - dot.userData.delay) * 5, 0.001, 1)
      const eased = 1 - (1 - progress) ** 3
      dot.scale.setScalar(eased)
    })
  })

  return (
    <group rotation={[0, 0, (angle * Math.PI) / 180]}>
      <group ref={dots}>
        {samples.map((sample, index) => {
          const upper = sample.side === 'upper'
          const color = upper
            ? (liftPositive ? '#267f93' : '#e0a522')
            : (liftPositive ? '#e0a522' : '#267f93')
          return (
            <mesh key={index} position={[sample.x, sample.y, sample.z]} scale={0.001} userData={{ delay: sample.delay }}>
              <sphereGeometry args={[upper ? 0.045 : 0.055, 12, 8]} />
              <meshBasicMaterial color={color} />
            </mesh>
          )
        })}
      </group>
      {xPositions.map((x) => <ForceArrow key={`top-${x}`} from={[x, 1.2, 1.52]} direction={[0, -1, 0]} length={topLength} color={liftPositive ? '#397f99' : '#f4c744'} />)}
      {xPositions.map((x) => <ForceArrow key={`bottom-${x}`} from={[x, -1.18, 1.52]} direction={[0, 1, 0]} length={bottomLength} color={liftPositive ? '#f4c744' : '#397f99'} />)}
      <Text position={[0, 1.5, 1.59]} fontSize={0.18} color="#245c70" outlineWidth={0.014} outlineColor="#fff9ef">
        {liftPositive ? 'LOW PRESSURE · SMALLER PUSH' : 'HIGH PRESSURE · BIGGER PUSH'}
      </Text>
      <Text position={[0, -1.42, 1.59]} fontSize={0.18} color="#775817" outlineWidth={0.014} outlineColor="#fff9ef">
        {liftPositive ? 'HIGH PRESSURE · BIGGER PUSH' : 'LOW PRESSURE · SMALLER PUSH'}
      </Text>
    </group>
  )
}

function WingScene({ speed, angle, camber, lift, drag, cl, stalled, viewMode, packetRun }) {
  const liftLength = Math.min(2.4, 0.5 + Math.abs(lift) / 4500)
  const dragLength = Math.min(2.6, 1.35 + drag / 2100)
  return (
    <>
      <color attach="background" args={['#f3e8d8']} />
      <fog attach="fog" args={['#f3e8d8', 12, 25]} />
      <StudioLights />
      <MovingLandscape speed={speed} />
      <DeflectedAirflow speed={speed} cl={cl} stalled={stalled} showDownwash={viewMode !== 'geometry'} />
      <Airfoil angle={angle} camber={camber} />
      {viewMode === 'pressure' && <SurfacePressure liftPositive={lift >= 0} angle={angle} camber={camber} />}
      {viewMode === 'packets' && <PairedPackets key={packetRun} speed={speed} stalled={stalled} />}
      {viewMode === 'geometry' && <AngleGuide angle={angle} camber={camber} />}
      <ForceArrow from={[0, 0.48, 0]} direction={[0, lift >= 0 ? 1 : -1, 0]} length={liftLength} color="#e6543f" label={`LIFT · ${formatForce(lift)}`} />
      <ForceArrow from={[3.6, 0.62, 1.9]} direction={[-1, 0, 0]} length={dragLength} color="#304e54" />
      <OrbitControls enablePan={false} target={[0, -0.35, 0]} minDistance={6.5} maxDistance={11} minPolarAngle={0.8} maxPolarAngle={2.1} />
    </>
  )
}

export function WingLab() {
  const [speed, setSpeed] = useState(28)
  const [angle, setAngle] = useState(6)
  const [camber, setCamber] = useState(4)
  const [viewMode, setViewMode] = useState('geometry')
  const [packetRun, setPacketRun] = useState(0)
  const angleSection = useRef()
  const pressureSection = useRef()
  const packetSection = useRef()
  const lastAutoMode = useRef(null)
  const area = 16
  const stallAngle = 16 - camber * 0.25
  const zeroLiftAngle = -((camber * 0.055) / (2 * Math.PI)) * (180 / Math.PI)
  const forces = flightForces({ speed, area, angle, flapBoost: camber * 0.055, dragCoefficient: 0.028 + camber * 0.002, stallAngle })
  const stalled = angle > stallAngle
  const pressureDifference = forces.lift / area

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return undefined
    const sections = [angleSection.current, pressureSection.current, packetSection.current].filter(Boolean)
    const observer = new IntersectionObserver((entries) => {
      const active = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (active) {
        const nextMode = active.target.dataset.sceneMode
        if (lastAutoMode.current !== nextMode) {
          lastAutoMode.current = nextMode
          setViewMode(nextMode)
          if (nextMode === 'packets') setPacketRun((run) => run + 1)
        }
      }
    }, { threshold: [0.01, 0.25], rootMargin: '-22% 0px -44% 0px' })
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [])

  const reset = () => {
    setSpeed(28)
    setAngle(6)
    setCamber(4)
  }

  return (
    <div className="lab-layout lab-layout--painted-notes">
      <section className="demo-pane demo-pane--wing" aria-label="Interactive wing model">
        <div className="scene-toolbar">
          <SceneBadge>{stalled ? 'Airflow separated: stall' : 'Airflow attached'}</SceneBadge>
          <ResetButton onClick={reset} />
        </div>
        <div className="scene-mode" aria-label="Wing visualization mode">
          <button type="button" className={viewMode === 'packets' ? 'is-active' : ''} onClick={() => { setViewMode('packets'); setPacketRun((run) => run + 1) }}>Air packets</button>
          <button type="button" className={viewMode === 'pressure' ? 'is-active' : ''} onClick={() => setViewMode('pressure')}>Surface pressure</button>
          <button type="button" className={viewMode === 'geometry' ? 'is-active' : ''} onClick={() => setViewMode('geometry')}>Angle &amp; shape</button>
        </div>
        <div className="motion-reference" aria-label="Motion reference frame">
          <span><small>Wing motion</small><b>{speed} m/s →</b></span>
          <span><small>Relative airflow</small><b>← {speed} m/s</b></span>
        </div>
        <Canvas camera={{ position: [7, 4, 7], fov: 42 }} shadows dpr={[1, 1.75]} gl={{ preserveDrawingBuffer: true }}>
          <WingScene speed={speed} angle={angle} camber={camber} lift={forces.lift} drag={forces.drag} cl={forces.cl} stalled={stalled} viewMode={viewMode} packetRun={packetRun} />
        </Canvas>
        <ForceLegend items={[{ color: '#e6543f', label: 'Lift' }, { color: '#304e54', label: 'Drag' }, { color: '#3e999c', label: 'Air' }]} />
        <div className="drag-callout" aria-label={`Drag force ${formatForce(forces.drag)}`}>
          <span>←</span><small>Drag force</small><b>{formatForce(forces.drag)}</b>
        </div>
        <div className="scene-readouts" aria-label="Live wing measurements">
          <span><small>Relative airspeed</small><b>{speed} m/s ←</b></span>
          <span><small>Angle</small><b>{angle}°</b></span>
          <span><small>Wing camber</small><b>{camber}%</b></span>
          <span><small>Pressure difference</small><b>{pressureDifference.toFixed(0)} Pa</b></span>
          <span><small>Net lift</small><b>{formatForce(forces.lift)}</b></span>
          <span><small>Drag</small><b>{formatForce(forces.drag)}</b></span>
        </div>
        <div className={`stall-banner ${stalled ? 'is-visible' : ''}`}>STALL · Upper packets peel away into a turbulent wake</div>
      </section>

      <aside className="lesson-pane">
        <SectionHeader kicker="Experiment 01 · The wing" title="Air gets turned. The wing gets lifted.">
          A wing pushes air downward. The air pushes back with an equal force upward. Shape and tilt help it move lots of air smoothly.
        </SectionHeader>

        <div className="control-group">
          <div className="group-title"><span>Try it</span><small>Change one variable at a time</small></div>
          <Slider label="Airspeed" value={speed} min={5} max={60} unit=" m/s" onChange={setSpeed} />
          <Slider label="Angle of attack" value={angle} min={-6} max={22} unit="°" onChange={setAngle} accent="#6e4c9b" />
          <Slider label="Wing camber" value={camber} min={0} max={8} unit="%" onChange={setCamber} accent="#27829c" />
        </div>

        <div className="metric-grid">
          <Metric label="Lift" value={formatForce(forces.lift)} />
          <Metric label="Drag" value={formatForce(forces.drag)} tone="violet" />
          <Metric label="Lift coefficient" value={forces.cl.toFixed(2)} tone="blue" />
          <Metric label="Dynamic pressure" value={`${forces.dynamicPressure.toFixed(0)} Pa`} tone="yellow" />
        </div>

        <section ref={angleSection} data-scene-mode="geometry" className="lesson-section">
          <h2>Angle and shape do different jobs</h2>
          <p className="body-copy"><strong>Angle of attack</strong> is measured between the straight chord line through the wing and the relative airflow, not between the wing and the horizon. Increasing that angle strengthens circulation and the pressure difference until the upper flow separates.</p>
          <p className="body-copy body-copy--spaced"><strong>Camber</strong> is the curve built into the airfoil. A cambered wing can produce positive lift even when its chord is at 0° because its shape still establishes a pressure field that turns air downward.</p>
          <div className="camber-chain" aria-label="How camber produces lift at zero chord angle">
            <span>Curved mean line</span><i>→</i><span>Smooth trailing-edge flow</span><i>→</i><span>Circulation</span><i>→</i><span>Pressure difference + downwash</span>
          </div>
          <Equation
            caption="Camber moves the zero-lift angle α₀L below zero. At a level 0° chord, subtracting that negative angle leaves a positive lift coefficient."
            values={`α₀L ≈ ${zeroLiftAngle.toFixed(1)}°; at α = ${angle}°, Cₗ = ${forces.cl.toFixed(2)}`}
          >C<sub>L</sub> ≈ 2π (α − α<sub>0L</sub>)</Equation>
          <Note>Camber does not pull the wing upward by itself. Viscosity establishes circulation as the flow starts, and the sharp trailing edge selects a smooth departing flow. That circulation and the pressure field are two descriptions of the same result.</Note>
          <Note>Choose “Angle &amp; shape” over the model. Set angle to 0°, then move camber from 0% to 8% to isolate what the wing's curvature contributes.</Note>
        </section>

        <section ref={pressureSection} data-scene-mode="pressure" className="lesson-section">
          <h2>Where is the force made?</h2>
          <PressureExplainer />
          <p className="body-copy">Air molecules press on every square centimetre of the wing's skin. The wing's shape and angle create a pressure field: the air above pushes down less than the air below pushes up. Add those tiny pressure forces across the whole surface and the leftover force points upward.</p>
          <Equation
            caption="This is the average pressure imbalance needed to make the lift shown above."
            values={`${formatForce(forces.lift)} ÷ ${area} m² = ${pressureDifference.toFixed(0)} Pa`}
          >Δp ≈ L ÷ S</Equation>
          <Note>The pressure field also bends the wake downward. “Air pushed down” and “pressure pushing on the wing” are two views of the same interaction, not two different sources of lift.</Note>
        </section>

        <section className="lesson-section">
          <h2>The lift equation</h2>
          <Equation
            caption="Lift grows with wing area S, angle-dependent lift coefficient Cₗ, and especially speed v."
            values={`½ × 1.225 × ${speed}² × ${area} × ${forces.cl.toFixed(2)} = ${formatForce(forces.lift)}`}
          >L = ½ ρ v² S C<sub>L</sub></Equation>
          <Note>Double the speed and the v² term makes about four times as much lift. Try 20 m/s, then 40 m/s.</Note>
        </section>

        <section ref={packetSection} data-scene-mode="packets" className="lesson-section step-list">
          <h2>Do paired packets meet again?</h2>
          <div><b>1</b><p><strong>A and B enter together.</strong><span>In the packet view, the colored markers begin at the same distance ahead of the wing.</span></p></div>
          <div><b>2</b><p><strong>The stagnation region divides them.</strong><span>One streamtube bends over the wing and the other bends below it. The wing does not literally slice molecules in half.</span></p></div>
          <div><b>3</b><p><strong>The upper packet gets ahead.</strong><span>There is no rule requiring paired air to reunite at the trailing edge. The pressure field changes each packet's speed and direction.</span></p></div>
          <Note>A and B restart together at the incoming side. At positive lift, A advances ahead of B. Raise the angle past about {stallAngle.toFixed(0)}° and A instead peels away into the separated flow.</Note>
        </section>

        <section className="lesson-section">
          <h2>Why wings stall</h2>
          <p className="body-copy">Beyond roughly {stallAngle.toFixed(0)}° with this camber setting, the pressure rise toward the rear becomes too steep for the slow air near the surface. The upper streamlines detach, a tumbling wake forms, drag jumps, and lift starts to fade. Raise the angle past that point to see the packet path and streamlines separate in the graphic.</p>
        </section>
      </aside>
    </div>
  )
}

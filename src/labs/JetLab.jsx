import { Canvas, useFrame } from '@react-three/fiber'
import { Stars } from '@react-three/drei'
import { useEffect, useRef, useState } from 'react'
import { Cloud, ForceArrow, KeyboardOrbitControls, StudioLights } from '../components/SceneKit.jsx'
import { Equation, Metric, Note, ResetButton, SceneBadge, SectionHeader, Slider } from '../components/LabUI.jsx'
import { useArrowOrbit } from '../hooks/useArrowOrbit.js'
import { useTimeOfDay } from '../hooks/useTimeOfDay.js'
import { clamp, flightForces, formatForce, GRAVITY, liftCoefficient } from '../physics.js'
import { ElevatorStudyModel, FlapStudyModel, RudderStudyModel } from './JetControlStudies.jsx'
import { FuelDistributionStudyModel, JumboModel, TurbofanCutawayStudyModel } from './JetModels.jsx'

const JET_MASS = 285_000
const JET_AREA = 511
const JET_CRUISE_DENSITY = 0.38
const JET_INITIAL_ALTITUDE = 10_670
const JET_MAX_THRUST = 250_000
const JET_SIMULATION_RATE = 10
const JET_MODE_SHORT = { flight: 'FOUR FORCES', fuel: 'FUEL + THRUST', surfaces: 'CONTROL SURFACES' }
const JET_SURFACE_STUDIES = [
  { id: 'flaps', label: 'Flaps', accent: '#d49a27' },
  { id: 'elevators', label: 'Elevators', accent: '#76569b' },
  { id: 'rudders', label: 'Rudders', accent: '#e45845' },
]
const JET_CAMERAS = {
  flight: { position: [9.5, 6.8, 9.5], fov: 38 },
  fuel: { position: [9.2, 6.4, 10], fov: 38 },
  surfaces: { position: [8.4, 7.4, 10.4], fov: 36 },
}
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

function JetScene({ pitch, bank, flaps, elevator, rudder, thrust, liftRatio, time, altitude, verticalSpeed, engineThrust, drag, mode, cameraInputRef }) {
  const jetPosition = useRef()
  const jetAttitude = useRef()
  const atmosphere = JET_ATMOSPHERE[time]
  useFrame((state) => {
    if (!jetPosition.current || !jetAttitude.current) return
    const altitudeOffset = mode === 'flight' ? clamp((altitude - JET_INITIAL_ALTITUDE) / 350, -2.25, 2.25) : 0
    const targetY = altitudeOffset + Math.sin(state.clock.elapsedTime * 0.7) * 0.025
    jetPosition.current.position.y += (targetY - jetPosition.current.position.y) * 0.08
    jetAttitude.current.rotation.x = mode === 'flight' ? clamp(verticalSpeed / 180, -0.22, 0.16) : 0
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
      <group ref={jetPosition}>
        <group ref={jetAttitude}>
          <JumboModel pitch={pitch} bank={bank} flaps={flaps} elevator={elevator} rudder={rudder} thrust={thrust} time={time} mode={mode} />
          <group rotation={[(pitch * Math.PI) / 180, 0, (-bank * Math.PI) / 180]}>
            {mode === 'flight' && <ForceArrow from={[-4.4, 0.9, 0.15]} direction={[0, 0, -1]} length={0.25 + (engineThrust / JET_MAX_THRUST) * 1.6} color="#f4cd4f" label={`THRUST · ${formatForce(engineThrust)}`} />}
            {mode === 'fuel' && <ForceArrow from={[-4.4, 0.9, 0.15]} direction={[0, 0, -1]} length={0.5 + (engineThrust / JET_MAX_THRUST) * 1.6} color="#f4cd4f" label={`FORWARD THRUST · ${formatForce(engineThrust)}`} />}
          </group>
          {mode === 'flight' && <ForceArrow from={[4.75, 0.8, 0.15]} direction={[0, 0, 1]} length={0.25 + Math.min(1.7, drag / 140_000)} color="#76569b" label={`DRAG · ${formatForce(drag)}`} />}
        </group>
        {mode === 'flight' && (
          <>
            <ForceArrow from={[0, 0.7, 0]} direction={[0, 1, 0]} length={Math.min(2.5, 0.7 + liftRatio * 0.8)} color="#e6543f" label="LIFT" />
            <ForceArrow from={[0, -0.6, 0]} direction={[0, -1, 0]} length={1.5} color="#2d6171" label="WEIGHT" />
          </>
        )}
      </group>
      <KeyboardOrbitControls inputRef={cameraInputRef} enablePan={false} minDistance={8} maxDistance={16} minPolarAngle={0.48} maxPolarAngle={1.48} target={[0, 0.18, mode === 'surfaces' ? 0.8 : 0.35]} />
    </>
  )
}

function JetSystemStudy({ type, stages, orientation, ariaLabel, camera, animate = false, readout, children }) {
  const container = useRef()
  const [loaded, setLoaded] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    if (loaded || !container.current || !('IntersectionObserver' in window)) return undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setLoaded(true)
      observer.disconnect()
    }, { rootMargin: '48px 0px', threshold: 0.01 })
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [loaded])

  return (
    <div ref={container} className={`jet-system-study jet-system-study--${type}`} role="img" aria-label={ariaLabel}>
      <div className="jet-system-study__orientation"><span>{orientation}</span><span>SCHEMATIC · NOT TO SCALE</span></div>
      <div className="jet-system-study__stages" aria-hidden="true" style={{ '--jet-stage-count': stages.length }}>
        {stages.map((stage, index) => <span key={stage}><i>{index + 1}</i>{stage}</span>)}
      </div>
      {loaded && (
        <Canvas orthographic camera={camera} frameloop={animate ? 'always' : 'demand'} dpr={[1, 1.5]}>
          <ambientLight intensity={1.9} />
          <directionalLight position={[4, 6, 6]} intensity={2.2} color="#fff6e4" />
          <directionalLight position={[-4, 1, -3]} intensity={0.7} color="#9fd3dc" />
          {children}
        </Canvas>
      )}
      <div className="jet-system-study__readout">{readout}</div>
    </div>
  )
}

function FuelStudyCanvas({ ariaLabel, camera, animate = false, children }) {
  return (
    <div className="fuel-study-canvas" role="img" aria-label={ariaLabel}>
      <Canvas orthographic camera={camera} frameloop={animate ? 'always' : 'demand'} dpr={[1, 1.5]} gl={{ preserveDrawingBuffer: true }}>
        <ambientLight intensity={1.9} />
        <directionalLight position={[4, 6, 6]} intensity={2.2} color="#fff6e4" />
        <directionalLight position={[-4, 1, -3]} intensity={0.7} color="#9fd3dc" />
        {children}
      </Canvas>
    </div>
  )
}

function FuelStudyPlate({ number, title, subtitle, type, steps, stepStart, ariaLabel, camera, animate, control, orientation, componentKey, legend, children }) {
  return (
    <article className={`fuel-study-plate fuel-study-plate--${type}`}>
      <header className="fuel-study-plate__header">
        <span>{number}</span>
        <div><h3>{title}</h3><p>{subtitle}</p></div>
      </header>
      {control}
      <div className="fuel-study-orientation">{orientation}</div>
      <FuelStudyCanvas ariaLabel={ariaLabel} camera={camera} animate={animate}>{children}</FuelStudyCanvas>
      {componentKey}
      <div className="fuel-study-legend">{legend}</div>
      <div className="fuel-study-steps" role="list" aria-label={`${title} sequence`}>
        {steps.map((step, index) => <span key={step} role="listitem"><i>{stepStart + index}</i><b>{step}</b></span>)}
      </div>
    </article>
  )
}

function FuelSystemStudy({ thrust, onThrustChange }) {
  const journey = useRef()
  const [journeyVisible, setJourneyVisible] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    if (!journey.current || !('IntersectionObserver' in window)) return undefined
    const observer = new IntersectionObserver(([entry]) => setJourneyVisible(entry.isIntersecting), { rootMargin: '200px 0px', threshold: 0.01 })
    observer.observe(journey.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={journey} className="fuel-journey">
      <FuelStudyPlate
        number="01"
        title="Fuel reaches one engine"
        subtitle="Tanks are structural bays. Pumps and valves choose a pressurized route."
        type="distribution"
        steps={['Tanks store fuel', 'Boost pumps pressurize it', 'Crossfeed selects a route', 'Fuel reaches the pylon']}
        stepStart={1}
        ariaLabel="Top-down 747 fuel distribution map. Wing and center tanks feed boost pumps and a crossfeed manifold, with one highlighted route continuing toward an engine."
        camera={{ position: [0, 0.08, 8], zoom: 58 }}
        orientation={<><span>TOP VIEW</span><b>TANKS → MANIFOLD → ENGINE FEED</b></>}
        legend={<><span><i className="jet-swatch jet-swatch--main" />WING TANKS</span><span><i className="jet-swatch jet-swatch--fuel" />CENTER TANK</span><span><i className="jet-swatch jet-swatch--pump" />BOOST PUMP</span></>}
      >
        <FuelDistributionStudyModel />
      </FuelStudyPlate>

      <div className="fuel-study-handoff"><span>Pressurized fuel reaches one engine</span><b>↓</b></div>

      <FuelStudyPlate
        number="02"
        title="The engine accelerates air backward"
        subtitle="Fuel releases energy in the core. The fan transfers that energy to a much larger mass of air."
        type="engine"
        steps={['Engine pump raises pressure', 'Fuel control meters + nozzles spray', 'Turbines drive fan + compressor', 'Fan and core push air back']}
        stepStart={5}
        ariaLabel={`Side cutaway of one 747 turbofan at ${thrust} percent power. Metered fuel enters the combustor while air enters the fan from the left; the bypass stream and hot core move rearward to the right.`}
        camera={{ position: [0, 0.12, 8], zoom: 62 }}
        animate={journeyVisible}
        control={<div className="fuel-engine-power"><Slider label="Engine power" value={thrust} min={0} max={100} unit="%" onChange={onThrustChange} accent="#d49a27" /></div>}
        orientation={<><span>FRONT / INLET</span><b>AIRFLOW →</b><span>REAR / EXHAUST</span></>}
        componentKey={<div className="fuel-component-rail" role="list" aria-label="Engine components from front to rear">
          {['Fan', 'Compressor', 'Combustor', 'Turbine', 'Nozzle'].map((component, index) => <span key={component} role="listitem"><i>{String.fromCharCode(65 + index)}</i><b>{component}</b></span>)}
        </div>}
        legend={<><span><i className="jet-swatch jet-swatch--fuel" />METERED FUEL</span><span><i className="jet-swatch jet-swatch--air" />BYPASS AIR</span><span><i className="jet-swatch jet-swatch--hot" />HOT CORE</span></>}
      >
        <TurbofanCutawayStudyModel thrust={thrust} />
      </FuelStudyPlate>

      <div className="fuel-action-pair" aria-label="Air and thrust move in opposite directions">
        <span><b>AIR + EXHAUST</b> accelerated back →</span>
        <span>← <b>THRUST</b> reaction forward</span>
      </div>
    </div>
  )
}

function SurfaceControlStudy({ study, flaps, elevator, rudder }) {
  const config = {
    flaps: {
      type: 'surface-flaps',
      stages: ['FLAP LEVER', 'TRACKS MOVE AFT', '3 PANELS OPEN SLOTS', 'MORE LIFT + DRAG'],
      orientation: 'MAIN WING · TRAILING EDGE',
      ariaLabel: `Isolated 747 triple-slotted flap assembly deployed to ${flaps} degrees, moving aft and down to increase wing camber, lift, and drag`,
      camera: { position: [5, 4.5, 6], zoom: 65 },
      label: 'TRIPLE-SLOTTED FLAPS',
      value: flaps,
      model: <FlapStudyModel flaps={flaps} />,
    },
    elevators: {
      type: 'surface-elevators',
      stages: ['CONTROL COLUMN', 'CABLE + HYDRAULICS', '4 ELEVATORS HINGE', 'NOSE PITCHES'],
      orientation: 'HORIZONTAL TAIL · TRAILING EDGE',
      ariaLabel: `Isolated 747 horizontal tail with four elevator panels deflected to ${elevator.toFixed(1)} degrees to create a pitching moment`,
      camera: { position: [5, 4.5, 6], zoom: 65 },
      label: '4 ELEVATORS · PITCH',
      value: elevator,
      model: <ElevatorStudyModel elevator={elevator} />,
    },
    rudders: {
      type: 'surface-rudders',
      stages: ['RUDDER PEDALS', 'CABLE + HYDRAULICS', '2 RUDDERS HINGE', 'NOSE YAWS'],
      orientation: 'VERTICAL TAIL · TRAILING EDGE',
      ariaLabel: `Isolated 747 vertical tail with upper and lower rudders deflected to ${rudder.toFixed(1)} degrees to create a yawing moment`,
      camera: { position: [4, 2.8, 6], zoom: 75 },
      label: '2 RUDDERS · YAW',
      value: rudder,
      model: <RudderStudyModel rudder={rudder} />,
    },
  }[study]

  return (
    <JetSystemStudy
      key={study}
      type={config.type}
      stages={config.stages}
      orientation={config.orientation}
      ariaLabel={config.ariaLabel}
      camera={config.camera}
      readout={<><span className={`jet-surface-readout jet-surface-readout--${study}`}>{config.label}</span><output>{config.value >= 0 ? '+' : ''}{config.value.toFixed(1)}°</output></>}
    >
      {config.model}
    </JetSystemStudy>
  )
}

export function JetLab() {
  const [thrust, setThrust] = useState(72)
  const [pitch, setPitch] = useState(2.5)
  const [flaps, setFlaps] = useState(0)
  const [bank, setBank] = useState(0)
  const [elevator, setElevator] = useState(0)
  const [rudder, setRudder] = useState(0)
  const [surfaceStudy, setSurfaceStudy] = useState('flaps')
  const [mode, setMode] = useState('flight')
  const [resetSignal, setResetSignal] = useState(0)
  const {
    rootRef: cameraRootRef,
    keysRef: cameraKeysRef,
    onKeyDown: handleCameraKeyDown,
    onBlur: handleCameraBlur,
    onPointerDown: handleCameraPointerDown,
  } = useArrowOrbit({ autoFocus: true })
  const fuelSection = useRef()
  const tailSection = useRef()
  const lastAutoMode = useRef(null)
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

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return undefined
    const sections = [fuelSection.current, tailSection.current].filter(Boolean)
    const visibility = new Map(sections.map((section) => [section, 0]))
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => visibility.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0))
      const active = sections
        .map((target) => ({ target, intersectionRatio: visibility.get(target) || 0 }))
        .filter((entry) => entry.intersectionRatio > 0)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      const nextMode = active?.target.dataset.sceneMode || 'flight'
      if (lastAutoMode.current !== nextMode) {
        lastAutoMode.current = nextMode
        setMode(nextMode)
      }
    }, { threshold: [0.01, 0.25], rootMargin: '-22% 0px -44% 0px' })
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [])

  const focusCamera = () => requestAnimationFrame(() => cameraRootRef.current?.focus({ preventScroll: true }))

  const chooseMode = (nextMode) => {
    setMode(nextMode)
    focusCamera()
  }

  const chooseSurfaceStudy = (nextStudy, moveFocus = false) => {
    setSurfaceStudy(nextStudy)
    setMode('surfaces')
    if (moveFocus) requestAnimationFrame(() => document.getElementById(`surface-study-tab-${nextStudy}`)?.focus())
  }

  const handleSurfaceTabKeyDown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const currentIndex = JET_SURFACE_STUDIES.findIndex(({ id }) => id === event.currentTarget.dataset.study)
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? JET_SURFACE_STUDIES.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + JET_SURFACE_STUDIES.length) % JET_SURFACE_STUDIES.length
    chooseSurfaceStudy(JET_SURFACE_STUDIES[nextIndex].id, true)
  }

  const reset = () => {
    setThrust(72)
    setPitch(2.5)
    setFlaps(0)
    setBank(0)
    setElevator(0)
    setRudder(0)
    setSurfaceStudy('flaps')
    setResetSignal((signal) => signal + 1)
    focusCamera()
  }

  return (
    <div className={`lab-layout lab-layout--cake-box lab-layout--time-${time}`}>
      <section
        ref={cameraRootRef}
        className="demo-pane demo-pane--jet interactive-scene"
        aria-label="Interactive Boeing 747 model"
        aria-describedby="jet-camera-instructions"
        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
        data-scene-mode={mode}
        data-testid="jet-simulator"
        tabIndex={0}
        onKeyDown={handleCameraKeyDown}
        onBlur={handleCameraBlur}
        onPointerDown={handleCameraPointerDown}
      >
        <span id="jet-camera-instructions" className="sr-only">Use Left and Right Arrow to orbit around the 747. Use Up and Down Arrow to raise or lower the viewpoint. Drag to orbit and pinch or scroll to zoom.</span>
        <div className="scene-toolbar"><SceneBadge>FL{flightLevel} · {JET_MODE_SHORT[mode]}</SceneBadge><ResetButton onClick={reset} /></div>
        <div className="scene-mode jet-scene-mode" aria-label="Boeing 747 visualization mode">
          <button type="button" aria-pressed={mode === 'flight'} className={mode === 'flight' ? 'is-active' : ''} onClick={() => chooseMode('flight')}>Four forces</button>
          <button type="button" aria-pressed={mode === 'fuel'} className={mode === 'fuel' ? 'is-active' : ''} onClick={() => chooseMode('fuel')}>Fuel + thrust</button>
          <button type="button" aria-pressed={mode === 'surfaces'} className={mode === 'surfaces' ? 'is-active' : ''} onClick={() => chooseMode('surfaces')}>Control surfaces</button>
        </div>
        <Canvas key={mode} camera={JET_CAMERAS[mode]} shadows dpr={[1, 1.75]} gl={{ preserveDrawingBuffer: true }}>
          <JetScene pitch={pitch} bank={bank} flaps={flaps} elevator={elevator} rudder={rudder} thrust={thrust} liftRatio={liftRatio} time={time}
            altitude={telemetry.altitude} verticalSpeed={telemetry.verticalSpeed} engineThrust={engineThrust} drag={forces.drag} mode={mode} cameraInputRef={cameraKeysRef} />
        </Canvas>
        {mode === 'flight' && (
          <div className="instrument-cluster">
            <div className="dial" style={{ '--needle': `${-110 + (speed / 300) * 220}deg` }}><i /><span>{Math.round(speed * 1.944)}</span><small>KNOTS</small></div>
            <div className="attitude"><span style={{ transform: `rotate(${-bank}deg) translateY(${pitch * 1.5}px)` }} /><b>{bank > 2 ? 'BANK R' : bank < -2 ? 'BANK L' : 'WINGS LEVEL'}</b></div>
            <div className="altimeter"><span>{Math.round(telemetry.altitude * 3.28084).toLocaleString()}</span><small>FEET</small><b>{state.toUpperCase()}</b></div>
          </div>
        )}
      </section>

      <aside className="lesson-pane">
        <SectionHeader kicker="Experiment 03 · The jumbo jet" title="Same four forces. Much bigger numbers.">
          A 747 obeys exactly the same physics as the Flyer. Swept wings, flaps, and four engines simply manage those forces across a far wider range.
        </SectionHeader>

        <div className="control-group">
          <div className="group-title"><span>Flight deck</span><small>Hold altitude while banking</small></div>
          <Slider label="Engine thrust" value={thrust} min={0} max={100} unit="%" onChange={setThrust} />
          <Slider label="Angle of attack (simplified)" value={pitch} min={-2} max={9} step={0.5} unit="°" onChange={setPitch} accent="#6e4c9b" />
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

        <section ref={fuelSection} data-scene-mode="fuel" className="lesson-section jet-system-section">
          <h2>From sealed wing tanks to thrust</h2>
          <p className="body-copy">This simplified 747-400 map shows fuel inside structural bays in the wings and center wing box. Electric boost pumps pressurize it, and a crossfeed manifold can route fuel toward any of the four engines.</p>
          <FuelSystemStudy thrust={thrust} onThrustChange={setThrust} />
          <p className="jet-system-principle"><strong>Fuel supplies energy. Air carries most of the momentum.</strong> At the pylon, an engine shutoff valve passes fuel to engine-driven pumps and a metering unit, then to spray nozzles in the combustor. The hot gas turns turbines connected to the compressor and fan; the fan accelerates a much larger bypass stream backward.</p>
          <Equation caption="The fan and hot core both add rearward momentum to the airflow. The equal reaction is forward thrust."
            values={`${thrust}% command = ${formatForce(engineThrust)} simulated cruise thrust`}>
            T ≈ ṁ<sub>air</sub> (V<sub>exit</sub> − V<sub>flight</sub>)
          </Equation>
          <Note>The optional stabilizer tank shown on the full aircraft is not universal across every 747. On equipped passenger 747-400s it is a transfer tank; fuel moves forward before it joins the normal engine feed system.</Note>
        </section>

        <section ref={tailSection} data-scene-mode="surfaces" className="lesson-section jet-system-section">
          <h2>Compare one surface at a time</h2>
          <p className="body-copy">Choose a surface, move only its control, and watch one mechanism. The full aircraft above keeps the same colors so you can place each isolated part back on the 747.</p>
          <div className="surface-study-tabs" role="tablist" aria-label="Isolated 747 control-surface study">
            {JET_SURFACE_STUDIES.map(({ id: study, label, accent }) => (
              <button
                key={study}
                id={`surface-study-tab-${study}`}
                type="button"
                role="tab"
                data-study={study}
                aria-selected={surfaceStudy === study}
                aria-controls="surface-study-panel"
                className={surfaceStudy === study ? 'is-active' : ''}
                tabIndex={surfaceStudy === study ? 0 : -1}
                style={{ '--surface-tab-accent': accent }}
                onClick={() => chooseSurfaceStudy(study)}
                onKeyDown={handleSurfaceTabKeyDown}
              >{label}</button>
            ))}
          </div>
          <div id="surface-study-panel" role="tabpanel" aria-labelledby={`surface-study-tab-${surfaceStudy}`} className="surface-study-panel">
            <div className="control-group surface-study-control">
              <div className="group-title"><span>{surfaceStudy === 'flaps' ? 'Wing flap control' : surfaceStudy === 'elevators' ? 'Tail pitch control' : 'Tail yaw control'}</span><small>Only this surface moves</small></div>
              {surfaceStudy === 'flaps' && <Slider label="Flap deflection" value={flaps} min={0} max={30} step={1} unit="°" onChange={(value) => { setFlaps(value); setMode('surfaces') }} accent="#d49a27" />}
              {surfaceStudy === 'elevators' && <Slider label="Elevator deflection" value={elevator} min={-18} max={18} step={1} unit="°" onChange={(value) => { setElevator(value); setMode('surfaces') }} accent="#76569b" />}
              {surfaceStudy === 'rudders' && <Slider label="Rudder deflection" value={rudder} min={-22} max={22} step={1} unit="°" onChange={(value) => { setRudder(value); setMode('surfaces') }} accent="#e45845" />}
            </div>
            <SurfaceControlStudy study={surfaceStudy} flaps={flaps} elevator={elevator} rudder={rudder} />
            <p className="surface-study-explanation">
              {surfaceStudy === 'flaps' && <><strong>Flaps reshape the main wing.</strong> They slide aft and down together, increasing camber and area so the wing makes more lift at low speed, with a large drag penalty.</>}
              {surfaceStudy === 'elevators' && <><strong>Elevators rotate the airplane.</strong> Their tail force creates a pitching moment, moving the nose and changing the main wing's angle of attack.</>}
              {surfaceStudy === 'rudders' && <><strong>Rudders turn the nose sideways.</strong> The upper and lower panels create a sideways tail force for yaw and turn coordination.</>}
            </p>
          </div>
          <div className="surface-role-comparison" aria-label="Difference between flaps and elevators">
            <div><i className="surface-role-swatch surface-role-swatch--flaps" /><p><strong>Flaps = more wing lift and drag</strong><span>They live on the main wings and normally move symmetrically for takeoff and landing.</span></p></div>
            <div><i className="surface-role-swatch surface-role-swatch--elevators" /><p><strong>Elevators = nose up or down</strong><span>They live on the horizontal tail and create the pitching moment that controls attitude.</span></p></div>
          </div>
          <Note>Flap deployment can create a secondary pitching tendency that pilots trim out, but that is not the flap's primary job. The elevator is the direct pitch-control surface.</Note>
        </section>

        <section className="lesson-section system-list">
          <h2>What the controls change</h2>
          <div><i className="system-icon system-icon--flaps" /><p><strong>Flaps reshape the wing.</strong><span>More curve makes more lift at low speed, but also much more drag.</span></p></div>
          <div><i className="system-icon system-icon--aileron" /><p><strong>Ailerons roll the airplane.</strong><span>The left and right panels move oppositely, changing lift across the span and starting a bank.</span></p></div>
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

import { Edges, Line } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'

const COLORS = {
  fixed: '#f2d6de',
  fixedTop: '#fff5e7',
  flap: '#e1b94f',
  elevator: '#76569b',
  rudder: '#e45845',
  hinge: '#304b53',
  track: '#b47d25',
  ghost: '#93a1a4',
}

function PaintedBox({
  size,
  color,
  opacity = 1,
  edgeColor = COLORS.hinge,
  edgeOpacity = 0.9,
  castShadow = false,
}) {
  return (
    <mesh castShadow={castShadow}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={0.7}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={opacity > 0.45}
      />
      <Edges
        color={edgeColor}
        scale={1.008}
        threshold={12}
        transparent={edgeOpacity < 1}
        opacity={edgeOpacity}
      />
    </mesh>
  )
}

function HingeBar({ position, length, vertical = false }) {
  return (
    <mesh
      position={position}
      rotation={vertical ? [0, 0, 0] : [0, 0, Math.PI / 2]}
    >
      <cylinderGeometry args={[0.035, 0.035, length, 12]} />
      <meshStandardMaterial color={COLORS.hinge} roughness={0.52} />
    </mesh>
  )
}

function FixedWingSection() {
  const shape = useMemo(() => {
    const wing = new THREE.Shape()
    wing.moveTo(-3.05, -0.82)
    wing.quadraticCurveTo(0, -1.12, 3.05, -0.82)
    wing.lineTo(2.88, 0.34)
    wing.lineTo(-2.88, 0.34)
    wing.closePath()
    return wing
  }, [])

  return (
    <mesh position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <extrudeGeometry args={[shape, { depth: 0.11, bevelEnabled: false }]} />
      <meshStandardMaterial color={COLORS.fixedTop} roughness={0.73} side={THREE.DoubleSide} />
      <Edges color={COLORS.hinge} threshold={12} opacity={0.82} transparent />
    </mesh>
  )
}

function FlapLeaf({ width, index, deployment, angle, ghost = false }) {
  const aft = 0.55 + index * 0.055 + deployment * (0.09 + index * 0.27)
  const down = -0.01 - index * 0.018 - deployment * (0.06 + index * 0.1)
  const leafAngle = ghost ? 0 : angle * (0.72 + index * 0.14)

  return (
    <group position={[0, down, aft]} rotation={[leafAngle, 0, 0]}>
      <group position={[0, 0, 0.12]}>
        <PaintedBox
          size={[width, 0.085, 0.27]}
          color={ghost ? COLORS.ghost : COLORS.flap}
          opacity={ghost ? 0.15 : 1}
          edgeColor={ghost ? COLORS.ghost : COLORS.hinge}
          edgeOpacity={ghost ? 0.38 : 0.95}
          castShadow={!ghost}
        />
      </group>
    </group>
  )
}

function TripleSlottedFlap({ center, width, deployment, angle }) {
  const showingGhost = deployment > 0.025
  return (
    <group position={[center, 0.08, 0]}>
      {showingGhost && [0, 1, 2].map((index) => (
        <FlapLeaf key={`ghost-${index}`} width={width} index={index} deployment={0} angle={0} ghost />
      ))}
      {[0, 1, 2].map((index) => (
        <FlapLeaf key={index} width={width} index={index} deployment={deployment} angle={angle} />
      ))}
      {[-width * 0.34, width * 0.34].map((x) => (
        <Line
          key={x}
          points={[
            [x, -0.03, 0.38],
            [x, -0.03 - deployment * 0.31, 0.62 + deployment * 0.85],
          ]}
          color={COLORS.track}
          lineWidth={2.1}
          transparent
          opacity={0.25 + deployment * 0.57}
        />
      ))}
    </group>
  )
}

/** A schematic aft-looking wing section. The three leaves translate aft and rotate down on tracks. */
export function FlapStudyModel({ flaps = 0 }) {
  const flapDegrees = THREE.MathUtils.clamp(flaps, 0, 30)
  const deployment = flapDegrees / 30
  const angle = THREE.MathUtils.degToRad(-flapDegrees)

  return (
    <group position={[0, 0.18, -0.2]} rotation={[-0.08, 0, 0]}>
      <FixedWingSection />
      <HingeBar position={[-1.52, 0.12, 0.36]} length={2.7} />
      <HingeBar position={[1.52, 0.12, 0.36]} length={2.7} />
      <TripleSlottedFlap center={-1.52} width={2.64} deployment={deployment} angle={angle} />
      <TripleSlottedFlap center={1.52} width={2.64} deployment={deployment} angle={angle} />
    </group>
  )
}

function HorizontalStabilizerPlanform() {
  const shape = useMemo(() => {
    const stabilizer = new THREE.Shape()
    stabilizer.moveTo(-3.05, -0.82)
    stabilizer.lineTo(0, -1.08)
    stabilizer.lineTo(3.05, -0.82)
    stabilizer.lineTo(2.72, 0.18)
    stabilizer.lineTo(0, 0.38)
    stabilizer.lineTo(-2.72, 0.18)
    stabilizer.closePath()
    return stabilizer
  }, [])

  return (
    <mesh position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <extrudeGeometry args={[shape, { depth: 0.1, bevelEnabled: false }]} />
      <meshStandardMaterial color={COLORS.fixed} roughness={0.72} side={THREE.DoubleSide} />
      <Edges color={COLORS.hinge} threshold={12} transparent opacity={0.84} />
    </mesh>
  )
}

const ELEVATOR_PANELS = [
  { x: -2.22, width: 1.3 },
  { x: -0.76, width: 1.18 },
  { x: 0.76, width: 1.18 },
  { x: 2.22, width: 1.3 },
]

function ElevatorPanel({ x, width, angle, ghost = false }) {
  return (
    <group position={[x, 0.09, 0.2]} rotation={[ghost ? 0 : angle, 0, 0]}>
      <group position={[0, 0, 0.39]}>
        <PaintedBox
          size={[width, 0.09, 0.72]}
          color={ghost ? COLORS.ghost : COLORS.elevator}
          opacity={ghost ? 0.14 : 1}
          edgeColor={ghost ? COLORS.ghost : COLORS.hinge}
          edgeOpacity={ghost ? 0.4 : 0.96}
          castShadow={!ghost}
        />
      </group>
    </group>
  )
}

/** Four elevators share a hinge line on the fixed horizontal stabilizer and move together. */
export function ElevatorStudyModel({ elevator = 0 }) {
  const elevatorDegrees = THREE.MathUtils.clamp(elevator, -20, 20)
  const angle = THREE.MathUtils.degToRad(elevatorDegrees)
  const deflected = Math.abs(elevatorDegrees) > 0.25

  return (
    <group position={[0, 0.08, -0.18]} rotation={[-0.08, 0, 0]}>
      <HorizontalStabilizerPlanform />
      <PaintedBox size={[0.46, 0.32, 2.35]} color="#dfe8e8" opacity={0.72} edgeOpacity={0.62} />
      <HingeBar position={[0, 0.13, 0.2]} length={5.86} />
      {deflected && ELEVATOR_PANELS.map(({ x, width }) => (
        <ElevatorPanel key={`ghost-${x}`} x={x} width={width} angle={0} ghost />
      ))}
      {ELEVATOR_PANELS.map(({ x, width }) => (
        <ElevatorPanel key={x} x={x} width={width} angle={angle} />
      ))}
    </group>
  )
}

function FinPanel({ shape, color, opacity = 1, edgeColor = COLORS.hinge, edgeOpacity = 0.9 }) {
  return (
    <mesh rotation={[0, Math.PI / 2, 0]} castShadow={opacity === 1}>
      <extrudeGeometry args={[shape, { depth: 0.12, bevelEnabled: false }]} />
      <meshStandardMaterial
        color={color}
        roughness={0.7}
        side={THREE.DoubleSide}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={opacity > 0.45}
      />
      <Edges color={edgeColor} threshold={12} transparent={edgeOpacity < 1} opacity={edgeOpacity} />
    </mesh>
  )
}

function FixedVerticalFin() {
  const shape = useMemo(() => {
    const fin = new THREE.Shape()
    fin.moveTo(-1.25, 0)
    fin.lineTo(0, 0)
    fin.lineTo(0, 2.65)
    fin.lineTo(-0.42, 2.42)
    fin.closePath()
    return fin
  }, [])

  return <FinPanel shape={shape} color={COLORS.fixed} />
}

function SplitRudderPanel({ lower, upper, angle, ghost = false }) {
  const isUpper = lower > 0.9
  const shape = useMemo(() => {
    const panel = new THREE.Shape()
    panel.moveTo(0, lower)
    panel.lineTo(isUpper ? 0.42 : 0.46, lower)
    panel.lineTo(isUpper ? 0.27 : 0.4, upper)
    panel.lineTo(0, upper)
    panel.closePath()
    return panel
  }, [isUpper, lower, upper])

  return (
    <group rotation={[0, ghost ? 0 : angle, 0]}>
      <FinPanel
        shape={shape}
        color={ghost ? COLORS.ghost : COLORS.rudder}
        opacity={ghost ? 0.14 : 1}
        edgeColor={ghost ? COLORS.ghost : COLORS.hinge}
        edgeOpacity={ghost ? 0.4 : 0.96}
      />
    </group>
  )
}

/** The 747-400 has independently powered upper and lower rudders that turn together here. */
export function RudderStudyModel({ rudder = 0 }) {
  const rudderDegrees = THREE.MathUtils.clamp(rudder, -25, 25)
  const angle = THREE.MathUtils.degToRad(rudderDegrees)
  const deflected = Math.abs(rudderDegrees) > 0.25

  return (
    <group position={[0, -1.28, -0.18]} rotation={[-0.05, -0.18, 0]}>
      <FixedVerticalFin />
      <PaintedBox
        size={[0.62, 0.34, 2.35]}
        color="#dfe8e8"
        opacity={0.72}
        edgeOpacity={0.62}
      />
      <HingeBar position={[0.07, 1.32, 0]} length={2.56} vertical />
      {deflected && (
        <>
          <SplitRudderPanel lower={0.06} upper={0.88} angle={0} ghost />
          <SplitRudderPanel lower={0.98} upper={2.62} angle={0} ghost />
        </>
      )}
      <SplitRudderPanel lower={0.06} upper={0.88} angle={angle} />
      <SplitRudderPanel lower={0.98} upper={2.62} angle={angle} />
    </group>
  )
}

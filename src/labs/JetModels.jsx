import { useFrame } from '@react-three/fiber'
import { Billboard, Edges, Line, Text } from '@react-three/drei'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

const ENGINE_POSITIONS = [
  [-2.45, -0.42, 0.1],
  [-1.2, -0.46, -0.25],
  [1.2, -0.46, -0.25],
  [2.45, -0.42, 0.1],
]

const ELEVATOR_SEGMENTS = [
  { x: -1.32, width: 0.52 },
  { x: -0.84, width: 0.4 },
  { x: 0.84, width: 0.4 },
  { x: 1.32, width: 0.52 },
]

const CONTROL_COLORS = {
  flap: '#e1b94f',
  aileron: '#2d9eaa',
  elevator: '#76569b',
  rudder: '#e45845',
  edge: '#304b53',
  ghost: '#87979b',
}

// The 747-400 trailing edge reads root-to-tip as flap, aileron, flap, aileron.
const TRAILING_EDGE_LAYOUT = [
  { kind: 'flap', name: 'inboard', center: 1.25, width: 1.18 },
  { kind: 'aileron', name: 'inboard', center: 2.18, width: 0.42 },
  { kind: 'flap', name: 'outboard', center: 3.08, width: 1.04 },
  { kind: 'aileron', name: 'outboard', center: 4.02, width: 0.58 },
]

const prefersReducedMotion = () => typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function OutlinedBox({ size, color, opacity = 1, edgeColor = CONTROL_COLORS.edge, castShadow = false }) {
  return (
    <mesh castShadow={castShadow}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={0.67}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={opacity > 0.45}
      />
      <Edges
        color={edgeColor}
        scale={1.012}
        threshold={12}
        transparent={opacity < 1}
        opacity={opacity < 0.5 ? 0.42 : 1}
      />
    </mesh>
  )
}

function WingPlanform({ color, opacity = 1 }) {
  const shape = useMemo(() => {
    const wing = new THREE.Shape()
    wing.moveTo(-4.65, 0.42)
    wing.lineTo(0, -0.66)
    wing.lineTo(4.65, 0.42)
    wing.lineTo(4.42, 1.18)
    wing.lineTo(0, 1.04)
    wing.lineTo(-4.42, 1.18)
    wing.closePath()
    return wing
  }, [])

  return (
    <mesh position={[0, 0.06, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <extrudeGeometry args={[shape, { depth: 0.1, bevelEnabled: false }]} />
      <meshStandardMaterial color={color} roughness={0.72} transparent={opacity < 1} opacity={opacity} depthWrite={opacity > 0.5} side={THREE.DoubleSide} />
      <Edges color={CONTROL_COLORS.edge} threshold={12} transparent={opacity < 1} opacity={opacity < 0.5 ? 0.32 : 0.8} />
    </mesh>
  )
}

function HorizontalStabilizer({ color, opacity }) {
  const shape = useMemo(() => {
    const stabilizer = new THREE.Shape()
    stabilizer.moveTo(-1.72, -0.3)
    stabilizer.lineTo(0, -0.42)
    stabilizer.lineTo(1.72, -0.3)
    stabilizer.lineTo(1.56, 0.12)
    stabilizer.lineTo(0, 0.2)
    stabilizer.lineTo(-1.56, 0.12)
    stabilizer.closePath()
    return stabilizer
  }, [])

  return (
    <mesh position={[0, 0.12, 2.92]} rotation={[Math.PI / 2, 0, 0]}>
      <extrudeGeometry args={[shape, { depth: 0.08, bevelEnabled: false }]} />
      <meshStandardMaterial color={color} roughness={0.72} transparent={opacity < 1} opacity={opacity} depthWrite={opacity > 0.45} side={THREE.DoubleSide} />
      <Edges color={CONTROL_COLORS.edge} threshold={12} transparent={opacity < 1} opacity={opacity < 0.5 ? 0.35 : 0.82} />
    </mesh>
  )
}

function FlapAssembly({ side, center, width, angle, opacity = 1, ghost = false }) {
  return (
    <group position={[side * center, 0.1, 0.72]} rotation={[angle, 0, 0]}>
      {[0.08, 0.25, 0.42].map((z, index) => (
        <group key={z} position={[0, index * -0.018, z]}>
          <OutlinedBox
            size={[width, 0.062, 0.13]}
            color={ghost ? CONTROL_COLORS.ghost : CONTROL_COLORS.flap}
            opacity={ghost ? 0.24 : opacity}
            edgeColor={ghost ? '#76878b' : CONTROL_COLORS.edge}
            castShadow={!ghost}
          />
        </group>
      ))}
    </group>
  )
}

function AileronPanel({ side, center, width, angle, opacity = 1, ghost = false }) {
  return (
    <group position={[side * center, 0.1, 0.93]} rotation={[angle, 0, 0]}>
      <group position={[0, 0, 0.17]}>
        <OutlinedBox
          size={[width, 0.07, 0.27]}
          color={ghost ? CONTROL_COLORS.ghost : CONTROL_COLORS.aileron}
          opacity={ghost ? 0.24 : opacity}
          edgeColor={ghost ? '#76878b' : CONTROL_COLORS.edge}
          castShadow={!ghost}
        />
      </group>
    </group>
  )
}

function VerticalFin({ opacity }) {
  const shape = useMemo(() => {
    const fin = new THREE.Shape()
    fin.moveTo(-0.08, 0)
    fin.lineTo(0.58, 0)
    fin.lineTo(0.2, 1.72)
    fin.lineTo(-0.1, 1.5)
    fin.closePath()
    return fin
  }, [])

  return (
    <mesh position={[0, 0.18, 3.08]} rotation={[0, Math.PI / 2, 0]}>
      <extrudeGeometry args={[shape, { depth: 0.1, bevelEnabled: false }]} />
      <meshStandardMaterial color="#e9cdc9" roughness={0.7} transparent={opacity < 1} opacity={opacity} depthWrite={opacity > 0.45} side={THREE.DoubleSide} />
      <Edges color={CONTROL_COLORS.edge} threshold={12} transparent={opacity < 1} opacity={opacity < 0.5 ? 0.4 : 0.9} />
    </mesh>
  )
}

function RudderPanel({ height, chord, angle, opacity = 1, ghost = false }) {
  const shape = useMemo(() => {
    const panel = new THREE.Shape()
    panel.moveTo(0, -height / 2)
    panel.lineTo(-chord * 0.78, -height / 2)
    panel.lineTo(-chord, height / 2)
    panel.lineTo(0, height / 2)
    panel.closePath()
    return panel
  }, [chord, height])

  return (
    <group rotation={[0, angle, 0]}>
      <mesh rotation={[0, Math.PI / 2, 0]} castShadow={!ghost}>
        <extrudeGeometry args={[shape, { depth: 0.075, bevelEnabled: false }]} />
        <meshStandardMaterial
          color={ghost ? CONTROL_COLORS.ghost : CONTROL_COLORS.rudder}
          roughness={0.66}
          transparent={ghost || opacity < 1}
          opacity={ghost ? 0.24 : opacity}
          depthWrite={!ghost && opacity > 0.45}
          side={THREE.DoubleSide}
        />
        <Edges
          color={ghost ? '#76878b' : CONTROL_COLORS.edge}
          threshold={12}
          transparent={ghost || opacity < 1}
          opacity={ghost || opacity < 0.5 ? 0.42 : 1}
        />
      </mesh>
    </group>
  )
}

function FanRotor({ thrust, highlighted }) {
  const rotor = useRef()
  const reducedMotion = useRef(prefersReducedMotion())
  useFrame((_, delta) => {
    if (!rotor.current || reducedMotion.current) return
    rotor.current.rotation.z += delta * thrust * 0.1
  })
  return (
    <group ref={rotor} position={[0, -0.565, 0]} rotation={[Math.PI / 2, 0, 0]}>
      {Array.from({ length: 8 }, (_, index) => (
        <mesh key={index} rotation={[0, 0, (index / 8) * Math.PI]} position={[0, 0.12, 0]}>
          <boxGeometry args={[0.035, 0.25, 0.025]} />
          <meshStandardMaterial color={highlighted ? '#56b9c5' : '#304b53'} metalness={0.35} />
        </mesh>
      ))}
    </group>
  )
}

function Engine({ position, mode, thrust }) {
  const faded = mode === 'surfaces'
  const highlighted = mode === 'fuel'
  const opacity = faded ? 0.24 : 1
  return (
    <group position={position} rotation={[Math.PI / 2, 0, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.34, 0.46, 1.05, 24]} />
        <meshStandardMaterial color={highlighted ? '#f2c54a' : '#e8c66f'} roughness={0.5} transparent={opacity < 1} opacity={opacity} depthWrite={!faded} />
      </mesh>
      <mesh position={[0, -0.53, 0]}>
        <torusGeometry args={[0.34, 0.07, 10, 24]} />
        <meshStandardMaterial color={highlighted ? '#e45845' : '#9d4438'} metalness={0.25} transparent={opacity < 1} opacity={opacity} />
      </mesh>
      <mesh position={[0, -0.55, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.3, 20]} />
        <meshStandardMaterial color="#304b53" transparent={opacity < 1} opacity={opacity} />
      </mesh>
      <FanRotor thrust={thrust} highlighted={highlighted} />
    </group>
  )
}

function FuelTank({ position, size, color = '#2b9db0', rotation = [0, 0, 0], optional = false }) {
  return (
    <mesh position={position} rotation={rotation} renderOrder={3}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.68} transparent opacity={optional ? 0.46 : 0.88} depthWrite={false} wireframe={optional} />
    </mesh>
  )
}

function FuelOverlay() {
  return (
    <group>
      <FuelTank position={[0, 0.19, 0.28]} size={[1.15, 0.23, 0.92]} color="#e4ac32" />
      {[-1, 1].flatMap((side) => [
        <FuelTank key={`inboard-${side}`} position={[side * 1.45, 0.17, 0.25]} size={[1.5, 0.2, 0.82]} rotation={[0, side * 0.1, 0]} />,
        <FuelTank key={`outboard-${side}`} position={[side * 3.05, 0.15, 0.57]} size={[1.15, 0.17, 0.58]} rotation={[0, side * 0.18, 0]} color="#55b9c2" />,
        <FuelTank key={`reserve-${side}`} position={[side * 4.02, 0.14, 0.85]} size={[0.48, 0.15, 0.42]} rotation={[0, side * 0.2, 0]} color="#7ac8c7" />,
      ])}
      <FuelTank position={[0, 0.18, 3.05]} size={[1.8, 0.13, 0.34]} color="#76569b" optional />

      <Line points={[[-3.48, 0.02, 0.38], [3.48, 0.02, 0.38]]} color="#e4ac32" lineWidth={3} />
      {ENGINE_POSITIONS.map((engine, index) => (
        <Line key={index} points={[[engine[0], 0.02, 0.38], [engine[0], -0.36, engine[2]]]} color="#f2c54a" lineWidth={2.3} />
      ))}
      {[-3.48, -1.72, 0, 1.72, 3.48].map((x) => (
        <mesh key={x} position={[x, 0.03, 0.38]}>
          <sphereGeometry args={[0.075, 12, 8]} />
          <meshStandardMaterial color="#e45845" emissive="#9f2f24" emissiveIntensity={0.4} />
        </mesh>
      ))}
      <Billboard position={[0, 0.75, 0.35]}><Text fontSize={0.2} color="#226779" outlineWidth={0.014} outlineColor="#fff5e7">INTEGRAL WING + CENTER TANKS</Text></Billboard>
      <Billboard position={[0, 0.46, 3.35]}><Text fontSize={0.15} color="#65448c" outlineWidth={0.012} outlineColor="#fff5e7">OPTIONAL STABILIZER TRANSFER TANK</Text></Billboard>
    </group>
  )
}

export function JumboModel({ pitch, bank, flaps, elevator, rudder, thrust, time, mode = 'flight' }) {
  const flapAngle = (flaps * Math.PI) / 180
  const elevatorAngle = (elevator * Math.PI) / 180
  const rudderAngle = (rudder * Math.PI) / 180
  const night = time === 'night'
  const inspecting = mode !== 'flight'
  const shellOpacity = mode === 'surfaces' ? 0.24 : inspecting ? 0.16 : 1
  const controlOpacity = mode === 'fuel' ? 0.18 : 1
  const shellColor = night ? '#dfe8f2' : '#fff8e9'
  const wingColor = '#f0a9bd'
  const flapDeflected = Math.abs(flapAngle) > THREE.MathUtils.degToRad(0.5)
  const elevatorDeflected = Math.abs(elevatorAngle) > THREE.MathUtils.degToRad(0.5)
  const rudderDeflected = Math.abs(rudderAngle) > THREE.MathUtils.degToRad(0.5)

  const aileronAngle = (side, name) => {
    const command = THREE.MathUtils.clamp((bank / 24) * side, -1, 1)
    const differentialLimit = command > 0 ? 18 : 11
    const authority = name === 'outboard' ? 1 : 0.72
    return THREE.MathUtils.degToRad(command * differentialLimit * authority)
  }

  return (
    <group rotation={[(pitch * Math.PI) / 180, 0, (-bank * Math.PI) / 180]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <capsuleGeometry args={[0.62, 6.1, 12, 28]} />
        <meshStandardMaterial color={shellColor} roughness={0.58} transparent={inspecting} opacity={shellOpacity} depthWrite={!inspecting} />
      </mesh>
      <mesh position={[0, 0.32, -1.4]} rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.5, 1.7, 8, 20]} />
        <meshStandardMaterial color={shellColor} transparent={inspecting} opacity={shellOpacity} depthWrite={!inspecting} />
      </mesh>
      <WingPlanform color={wingColor} opacity={shellOpacity} />
      {[-1, 1].flatMap((side) => TRAILING_EDGE_LAYOUT.map((surface) => {
        if (surface.kind === 'flap') {
          return (
            <group key={`${side}-${surface.name}-flap`}>
              {mode === 'surfaces' && flapDeflected && (
                <FlapAssembly side={side} center={surface.center} width={surface.width} angle={0} ghost />
              )}
              <FlapAssembly
                side={side}
                center={surface.center}
                width={surface.width}
                angle={flapAngle}
                opacity={controlOpacity}
              />
              <mesh position={[side * surface.center, 0.105, 0.75]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.023, 0.023, surface.width * 0.96, 10]} />
                <meshStandardMaterial color={CONTROL_COLORS.edge} transparent={controlOpacity < 1} opacity={controlOpacity} />
              </mesh>
            </group>
          )
        }

        const angle = aileronAngle(side, surface.name)
        const isDeflected = Math.abs(angle) > THREE.MathUtils.degToRad(0.5)
        return (
          <group key={`${side}-${surface.name}-aileron`}>
            {mode === 'surfaces' && isDeflected && (
              <AileronPanel side={side} center={surface.center} width={surface.width} angle={0} ghost />
            )}
            <AileronPanel
              side={side}
              center={surface.center}
              width={surface.width}
              angle={angle}
              opacity={controlOpacity}
            />
            <mesh position={[side * surface.center, 0.105, 0.95]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.023, 0.023, surface.width * 0.94, 10]} />
              <meshStandardMaterial color={CONTROL_COLORS.edge} transparent={controlOpacity < 1} opacity={controlOpacity} />
            </mesh>
          </group>
        )
      }))}

      <HorizontalStabilizer color="#edcad5" opacity={shellOpacity} />
      {mode === 'surfaces' && elevatorDeflected && ELEVATOR_SEGMENTS.map(({ x, width }) => (
        <group key={`ghost-elevator-${x}`} position={[x, 0.12, 3.09]}>
          <group position={[0, 0, 0.17]}>
            <OutlinedBox size={[width, 0.07, 0.28]} color={CONTROL_COLORS.ghost} opacity={0.24} edgeColor="#76878b" />
          </group>
        </group>
      ))}
      {ELEVATOR_SEGMENTS.map(({ x, width }) => (
        <group key={x} position={[x, 0.12, 3.09]} rotation={[elevatorAngle, 0, 0]}>
          <group position={[0, 0, 0.17]}>
            <OutlinedBox
              size={[width, 0.075, 0.28]}
              color={CONTROL_COLORS.elevator}
              opacity={controlOpacity}
              castShadow
            />
          </group>
        </group>
      ))}
      {ELEVATOR_SEGMENTS.map(({ x, width }) => (
        <mesh key={`elevator-hinge-${x}`} position={[x, 0.13, 3.1]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.024, 0.024, width * 0.92, 10]} />
          <meshStandardMaterial color={CONTROL_COLORS.edge} transparent={controlOpacity < 1} opacity={controlOpacity} />
        </mesh>
      ))}

      <VerticalFin opacity={shellOpacity} />
      {mode === 'surfaces' && rudderDeflected && (
        <>
          <group position={[0, 0.57, 3.16]}><RudderPanel height={0.62} chord={0.36} angle={0} ghost /></group>
          <group position={[0, 1.3, 3.16]}><RudderPanel height={0.8} chord={0.46} angle={0} ghost /></group>
        </>
      )}
      <group position={[0, 0.57, 3.16]}>
        <RudderPanel height={0.62} chord={0.36} angle={rudderAngle} opacity={controlOpacity} />
      </group>
      <group position={[0, 1.3, 3.16]}>
        <RudderPanel height={0.8} chord={0.46} angle={rudderAngle} opacity={controlOpacity} />
      </group>
      {[{ y: 0.57, height: 0.62 }, { y: 1.3, height: 0.8 }].map(({ y, height }) => (
        <mesh key={`rudder-hinge-${y}`} position={[0.01, y, 3.16]}>
          <cylinderGeometry args={[0.024, 0.024, height * 0.94, 10]} />
          <meshStandardMaterial color={CONTROL_COLORS.edge} transparent={controlOpacity < 1} opacity={controlOpacity} />
        </mesh>
      ))}

      <mesh position={[0, -0.42, -0.6]}>
        <boxGeometry args={[0.83, 0.08, 5.45]} />
        <meshStandardMaterial color="#e45845" transparent={inspecting} opacity={inspecting ? 0.16 : 1} depthWrite={!inspecting} />
      </mesh>
      {ENGINE_POSITIONS.map((position, index) => <Engine key={index} position={position} mode={mode} thrust={thrust} />)}

      {Array.from({ length: 14 }, (_, index) => (
        <mesh key={index} position={[(index % 2 ? 1 : -1) * 0.6, 0.14, -2.5 + Math.floor(index / 2) * 0.65]}>
          <circleGeometry args={[0.035, 10]} />
          <meshStandardMaterial color={night ? '#fff2a8' : '#245c6b'} emissive={night ? '#ffd968' : '#000000'} emissiveIntensity={night ? 2 : 0} transparent={inspecting} opacity={inspecting ? 0.18 : 1} />
        </mesh>
      ))}
      <mesh position={[-0.25, 0.26, -3.46]} rotation={[Math.PI / 2, 0, 0]}><circleGeometry args={[0.1, 12]} /><meshBasicMaterial color="#254c59" transparent={inspecting} opacity={inspecting ? 0.18 : 1} /></mesh>
      <mesh position={[0.25, 0.26, -3.46]} rotation={[Math.PI / 2, 0, 0]}><circleGeometry args={[0.1, 12]} /><meshBasicMaterial color="#254c59" transparent={inspecting} opacity={inspecting ? 0.18 : 1} /></mesh>

      {mode === 'fuel' && <FuelOverlay />}
      {mode === 'surfaces' && (
        <>
          <Billboard position={[-2.05, 0.72, 0.78]}><Text fontSize={0.18} color="#9b6b00" outlineWidth={0.014} outlineColor="#fff5e7" renderOrder={20} material-depthTest={false}>TRIPLE-SLOTTED FLAPS</Text></Billboard>
          <Billboard position={[2.15, 0.62, 1.24]}><Text fontSize={0.18} color="#187481" outlineWidth={0.014} outlineColor="#fff5e7" renderOrder={20} material-depthTest={false}>AILERONS · ROLL</Text></Billboard>
          <Billboard position={[-0.2, -0.45, 3.5]}><Text fontSize={0.18} color="#65448c" outlineWidth={0.014} outlineColor="#fff5e7" renderOrder={20} material-depthTest={false}>ELEVATORS · PITCH</Text></Billboard>
          <Billboard position={[0.35, 2.08, 3.3]}><Text fontSize={0.18} color="#a43e33" outlineWidth={0.014} outlineColor="#fff5e7" renderOrder={20} material-depthTest={false}>2 RUDDERS · YAW</Text></Billboard>
        </>
      )}
    </group>
  )
}

function StudyFan({ thrust }) {
  const fan = useRef()
  const reducedMotion = useRef(prefersReducedMotion())
  useFrame((_, delta) => {
    if (!fan.current || reducedMotion.current) return
    fan.current.rotation.z -= delta * thrust * 0.13
  })
  return (
    <group ref={fan} position={[-1.88, -1.15, 0.2]}>
      {Array.from({ length: 10 }, (_, index) => (
        <mesh key={index} rotation={[0, 0, (index / 10) * Math.PI]} position={[0, 0.18, 0]}>
          <boxGeometry args={[0.035, 0.34, 0.03]} />
          <meshStandardMaterial color="#27829c" />
        </mesh>
      ))}
      <mesh><circleGeometry args={[0.09, 16]} /><meshStandardMaterial color="#315964" /></mesh>
    </group>
  )
}

function StudyFlow({ thrust }) {
  const fuel = useRef()
  const bypass = useRef()
  const exhaust = useRef()
  const reducedMotion = useRef(prefersReducedMotion())
  useFrame((state) => {
    const speed = thrust / 100
    fuel.current?.children.forEach((particle, index) => {
      const progress = reducedMotion.current ? index / 8 : (state.clock.elapsedTime * (0.2 + speed * 1.3) + index / 8) % 1
      particle.position.y = 0.42 - progress * 1.15
      particle.visible = thrust > 0
    })
    bypass.current?.children.forEach((particle, index) => {
      const progress = reducedMotion.current ? (index % 10) / 10 : (state.clock.elapsedTime * (0.2 + speed * 1.45) + (index % 10) / 10) % 1
      particle.position.x = -2.5 + progress * (4.75 + speed * 0.7)
      particle.visible = thrust > 0
    })
    exhaust.current?.children.forEach((particle, index) => {
      const progress = reducedMotion.current ? index / 12 : (state.clock.elapsedTime * (0.25 + speed * 1.7) + index / 12) % 1
      particle.position.x = 1.18 + progress * (0.55 + speed * 1.25)
      particle.scale.x = 0.5 + speed
      particle.visible = thrust > 0
    })
  })
  return (
    <>
      <group ref={fuel}>
        {Array.from({ length: 8 }, (_, index) => (
          <mesh key={index} position={[0, 0.42 - index * 0.12, 0.26]}>
            <sphereGeometry args={[0.045, 9, 7]} />
            <meshBasicMaterial color="#e4ac32" />
          </mesh>
        ))}
      </group>
      <group ref={bypass}>
        {Array.from({ length: 20 }, (_, index) => (
          <mesh key={index} position={[-2.5 + (index % 10) * 0.45, index < 10 ? -0.86 : -1.44, 0.14]}>
            <boxGeometry args={[0.16, 0.035, 0.025]} />
            <meshBasicMaterial color="#62b9c7" transparent opacity={0.78} />
          </mesh>
        ))}
      </group>
      <group ref={exhaust}>
        {Array.from({ length: 12 }, (_, index) => (
          <mesh key={index} position={[1.18 + index * 0.08, -1.15 + ((index % 3) - 1) * 0.08, 0.15]}>
            <boxGeometry args={[0.13, 0.025, 0.025]} />
            <meshBasicMaterial color={index % 2 ? '#f4c247' : '#f08b59'} transparent opacity={0.78} />
          </mesh>
        ))}
      </group>
    </>
  )
}

function StudyPlanform() {
  const shape = useMemo(() => {
    const wing = new THREE.Shape()
    wing.moveTo(-2.95, 0.2)
    wing.lineTo(0, -0.45)
    wing.lineTo(2.95, 0.2)
    wing.lineTo(2.75, 0.72)
    wing.lineTo(0, 0.58)
    wing.lineTo(-2.75, 0.72)
    wing.closePath()
    return wing
  }, [])
  return (
    <mesh position={[0, 1.2, 0]}>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color="#efb1c2" transparent opacity={0.34} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  )
}

export function FuelSystemStudyModel({ thrust }) {
  const flow = thrust / 100
  return (
    <group>
      <StudyPlanform />
      <mesh position={[0, 1.45, 0.04]}><boxGeometry args={[0.42, 1.75, 0.08]} /><meshStandardMaterial color="#fff8e9" transparent opacity={0.54} depthWrite={false} /></mesh>
      <FuelTank position={[0, 1.2, 0.1]} size={[0.72, 0.45, 0.09]} color="#e4ac32" />
      {[-1, 1].flatMap((side) => [
        <FuelTank key={`study-main-${side}`} position={[side * 1.12, 1.28, 0.1]} size={[1.3, 0.38, 0.09]} color="#2b9db0" />,
        <FuelTank key={`study-out-${side}`} position={[side * 2.18, 1.42, 0.1]} size={[0.68, 0.27, 0.09]} color="#55b9c2" />,
      ])}
      <Line points={[[-2.5, 0.92, 0.16], [2.5, 0.92, 0.16]]} color="#e4ac32" lineWidth={3} />
      {[-2.2, -0.95, 0.95, 2.2].map((x) => (
        <group key={x}>
          <Line points={[[x, 1.25, 0.14], [x, 0.78, 0.14]]} color="#f2c54a" lineWidth={2} />
          <mesh position={[x, 0.75, 0.15]}><circleGeometry args={[0.09, 14]} /><meshStandardMaterial color="#e45845" /></mesh>
        </group>
      ))}

      <Line points={[[0, 0.92, 0.18], [0, -0.72, 0.18]]} color="#e4ac32" lineWidth={3.2} />
      <mesh position={[0, 0.38, 0.2]}><torusGeometry args={[0.1, 0.035, 8, 16]} /><meshStandardMaterial color="#e45845" metalness={0.25} /></mesh>
      <mesh position={[0, -0.18, 0.2]}><boxGeometry args={[0.2, 0.13, 0.08]} /><meshStandardMaterial color="#76569b" /></mesh>
      <mesh position={[0, -1.15, 0]}>
        <boxGeometry args={[4.8, 0.82, 0.14]} />
        <meshStandardMaterial color="#dfe9e7" transparent opacity={0.24} depthWrite={false} />
      </mesh>
      <Line points={[[-2.55, -0.86, 0.1], [2.35, -0.86, 0.1]]} color="#7bc7d0" lineWidth={3.4} />
      <Line points={[[-2.55, -1.44, 0.1], [2.35, -1.44, 0.1]]} color="#7bc7d0" lineWidth={3.4} />
      <Line points={[[-1.55, -1.15, 0.16], [1.55, -1.15, 0.16]]} color="#ef8d55" lineWidth={4} />
      <StudyFan thrust={thrust} />
      {[-1.35, -1.1, -0.85].map((x) => (
        <mesh key={x} position={[x, -1.15, 0.2]}><torusGeometry args={[0.2, 0.035, 8, 18]} /><meshStandardMaterial color="#57737a" metalness={0.32} /></mesh>
      ))}
      <mesh position={[0.05, -1.15, 0.2]}>
        <sphereGeometry args={[0.28, 16, 12]} />
        <meshStandardMaterial color="#f2a23b" emissive="#f0783d" emissiveIntensity={flow > 0 ? 0.2 + flow * 1.4 : 0} />
      </mesh>
      {[0.58, 0.82, 1.04].map((x) => (
        <mesh key={x} position={[x, -1.15, 0.2]}><torusGeometry args={[0.2, 0.035, 8, 18]} /><meshStandardMaterial color="#8c5d58" metalness={0.3} /></mesh>
      ))}
      <mesh position={[1.52, -1.15, 0.08]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.34, 0.8, 20, 1, true]} />
        <meshStandardMaterial color="#9e6b55" side={THREE.DoubleSide} transparent opacity={0.66} />
      </mesh>
      <StudyFlow thrust={thrust} />
    </group>
  )
}

export function TailControlStudyModel({ elevator, rudder }) {
  const elevatorAngle = (elevator * Math.PI) / 180
  const rudderAngle = (rudder * Math.PI) / 180
  return (
    <group>
      <group position={[-2.62, -0.92, 0.28]} rotation={[0, 0, elevatorAngle * 0.45]}>
        <mesh position={[0, 0.24, 0]}><boxGeometry args={[0.07, 0.52, 0.08]} /><meshStandardMaterial color="#76569b" /></mesh>
        <mesh position={[0, 0.52, 0]}><boxGeometry args={[0.32, 0.07, 0.08]} /><meshStandardMaterial color="#76569b" /></mesh>
      </group>
      <group position={[-2.05, -1.02, 0.28]} rotation={[0, rudderAngle * 0.4, 0]}>
        <mesh position={[-0.16, 0, 0]}><boxGeometry args={[0.25, 0.1, 0.16]} /><meshStandardMaterial color="#e45845" /></mesh>
        <mesh position={[0.16, 0, 0]}><boxGeometry args={[0.25, 0.1, 0.16]} /><meshStandardMaterial color="#e45845" /></mesh>
      </group>
      <Line points={[[-2.62, -0.68, 0.25], [-1.2, -0.86, 0.25], [-0.2, -0.86, 0.25]]} color="#76569b" lineWidth={2.2} />
      <Line points={[[-2.05, -1.02, 0.22], [-1.1, -1.08, 0.22], [-0.2, -0.86, 0.25]]} color="#e45845" lineWidth={2.2} />
      <mesh position={[-0.2, -0.86, 0.25]}><torusGeometry args={[0.11, 0.035, 8, 18]} /><meshStandardMaterial color="#4f6570" metalness={0.3} /></mesh>
      <Line points={[[-0.1, -0.84, 0.25], [-1.52, -0.42, 0.2]]} color="#d4a12f" lineWidth={2.5} />
      <Line points={[[-0.1, -0.88, 0.25], [1.58, -0.45, 0.2]]} color="#d4a12f" lineWidth={2.5} />
      <mesh position={[-1.52, -0.42, 0.2]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.055, 0.055, 0.42, 10]} /><meshStandardMaterial color="#e4ac32" /></mesh>
      <mesh position={[1.58, -0.45, 0.2]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.055, 0.055, 0.42, 10]} /><meshStandardMaterial color="#e4ac32" /></mesh>

      <group position={[-1.55, 0, 0]} rotation={[-0.18, 0.28, 0]}>
        <mesh><boxGeometry args={[2.55, 0.09, 0.62]} /><meshStandardMaterial color="#ead5dc" /></mesh>
        <mesh position={[0, 0, 0.49]}><boxGeometry args={[2.45, 0.065, 0.28]} /><meshStandardMaterial color="#9cabb0" transparent opacity={0.18} depthWrite={false} /></mesh>
        {ELEVATOR_SEGMENTS.map(({ x, width }) => (
          <group key={x} position={[x * 0.76, 0, 0.34]} rotation={[elevatorAngle, 0, 0]}>
            <mesh position={[0, 0, 0.14]}><boxGeometry args={[width * 0.75, 0.07, 0.28]} /><meshStandardMaterial color="#76569b" /></mesh>
            <mesh position={[0, -0.09, 0]}><cylinderGeometry args={[0.035, 0.035, 0.2, 10]} /><meshStandardMaterial color="#e4ac32" /></mesh>
          </group>
        ))}
        <mesh position={[0, -0.22, -0.2]}><boxGeometry args={[0.42, 0.35, 1.35]} /><meshStandardMaterial color="#fff8e9" transparent opacity={0.55} /></mesh>
      </group>

      <group position={[1.65, 0.05, 0]} rotation={[-0.16, -0.32, 0]}>
        <mesh position={[0, 0.42, -0.15]}><boxGeometry args={[0.12, 1.7, 0.72]} /><meshStandardMaterial color="#efd6d1" /></mesh>
        {[-0.4, 0.4].map((y) => (
          <mesh key={`ghost-${y}`} position={[0, 0.42 + y, 0.36]}><boxGeometry args={[0.1, 0.68, 0.32]} /><meshStandardMaterial color="#9cabb0" transparent opacity={0.18} depthWrite={false} /></mesh>
        ))}
        {[-0.4, 0.4].map((y) => (
          <group key={y} position={[0, 0.42 + y, 0.2]} rotation={[0, rudderAngle, 0]}>
            <mesh position={[0, 0, 0.16]}><boxGeometry args={[0.1, 0.68, 0.32]} /><meshStandardMaterial color="#e45845" /></mesh>
            <mesh position={[-0.09, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.035, 0.035, 0.2, 10]} /><meshStandardMaterial color="#e4ac32" /></mesh>
          </group>
        ))}
        <mesh position={[0, -0.42, -0.38]}><boxGeometry args={[0.48, 0.38, 1.55]} /><meshStandardMaterial color="#fff8e9" transparent opacity={0.55} /></mesh>
      </group>
    </group>
  )
}

import { Canvas, useFrame } from '@react-three/fiber'
import { Billboard, Line, Stars, Text } from '@react-three/drei'
import { Plane, PlaneTakeoff } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Cloud, ForceArrow, StudioLights } from '../components/SceneKit.jsx'
import { Equation, Metric, Note, ResetButton, SceneBadge, SectionHeader, Slider } from '../components/LabUI.jsx'
import { useTimeOfDay } from '../hooks/useTimeOfDay.js'
import { clamp, formatForce } from '../physics.js'
import {
  createFlyerState,
  flyerTelemetry,
  FLYER_AREA,
  FLYER_MASS,
  FLYER_WEIGHT,
  MAX_FLYER_ALTITUDE,
  stepFlyer,
} from './wrightFlight.js'

const MODE_SHORT = { flight: 'FLIGHT', wings: 'WING FORCES', propulsion: 'PROPULSION', controls: 'CONTROLS' }
const INITIAL_TELEMETRY = flyerTelemetry(createFlyerState({ airborne: true }))
const WRIGHT_ATMOSPHERE = {
  day: { sky: '#8dcedc', fog: '#8dcedc', cloud: '#fff9ed', ground: '#e8b47d' },
  evening: { sky: '#a496c9', fog: '#c7a3bf', cloud: '#efd5e7', ground: '#b88dac', fields: ['#c7a6d6', '#db91aa', '#8fa6bc', '#e5b078', '#9a8fc1'] },
  night: { sky: '#182f55', fog: '#29466c', cloud: '#7588aa', ground: '#263d5a', fields: ['#314a68', '#3d4669', '#285264', '#544663', '#354d73'] },
}

function wingCamber(z, chord, amount) {
  const progress = clamp((z + chord / 2) / chord, 0, 1)
  return Math.sin(progress * Math.PI) * amount
}

function CamberedSurface({ width, chord, camber = 0.14, color, opacity = 0.92, position, rotation = [0, 0, 0], ribs = true, warp = 0 }) {
  const geometry = useMemo(() => {
    const spanSegments = 24
    const chordSegments = 8
    const positions = []
    const indices = []
    for (let zi = 0; zi <= chordSegments; zi++) {
      const z = -chord / 2 + (zi / chordSegments) * chord
      for (let xi = 0; xi <= spanSegments; xi++) {
        const x = -width / 2 + (xi / spanSegments) * width
        const droop = -0.025 * (Math.abs(x) / (width / 2)) ** 2
        const tipInfluence = clamp((Math.abs(x) / (width / 2) - 0.52) / 0.48, 0, 1) ** 2
        const twist = Math.tan((warp * Math.PI) / 180) * z * tipInfluence * Math.sign(x)
        positions.push(x, wingCamber(z, chord, camber) + droop + twist, z)
      }
    }
    for (let zi = 0; zi < chordSegments; zi++) {
      for (let xi = 0; xi < spanSegments; xi++) {
        const row = spanSegments + 1
        const a = zi * row + xi
        const b = a + 1
        const c = a + row
        const d = c + 1
        indices.push(a, c, b, b, c, d)
      }
    }
    const built = new THREE.BufferGeometry()
    built.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    built.setIndex(indices)
    built.computeVertexNormals()
    return built
  }, [width, chord, camber, warp])

  const ribXs = useMemo(() => {
    const count = Math.max(5, Math.round(width / 0.48))
    return Array.from({ length: count }, (_, index) => -width / 2 + (index / (count - 1)) * width)
  }, [width])
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.9} transparent opacity={opacity} />
      </mesh>
      <Line points={[[-width / 2, 0, -chord / 2], [width / 2, 0, -chord / 2]]} color="#a44f3e" lineWidth={2.2} />
      <Line points={[[-width / 2, 0, chord / 2], [width / 2, 0, chord / 2]]} color="#a44f3e" lineWidth={1.8} />
      {ribs && ribXs.map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <Line points={Array.from({ length: 13 }, (_, index) => {
            const z = -chord / 2 + (index / 12) * chord
            const tipInfluence = clamp((Math.abs(x) / (width / 2) - 0.52) / 0.48, 0, 1) ** 2
            const twist = Math.tan((warp * Math.PI) / 180) * z * tipInfluence * Math.sign(x)
            return [0, wingCamber(z, chord, camber) + 0.018 + twist, z]
          })} color="#a96148" lineWidth={1.15} transparent opacity={0.72} />
        </group>
      ))}
    </group>
  )
}

function Beam({ from, to, radius = 0.025, color = '#8c503a' }) {
  const transform = useMemo(() => {
    const start = new THREE.Vector3(...from)
    const end = new THREE.Vector3(...to)
    const direction = end.clone().sub(start)
    const length = direction.length()
    return {
      length,
      midpoint: start.add(end).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()),
    }
  }, [from, to])

  return (
    <mesh position={transform.midpoint} quaternion={transform.quaternion} castShadow>
      <cylinderGeometry args={[radius, radius, transform.length, 8]} />
      <meshStandardMaterial color={color} roughness={0.86} />
    </mesh>
  )
}

function Propeller({ throttle, position, highlighted, direction = 1 }) {
  const prop = useRef()
  useFrame((_, delta) => {
    if (prop.current) prop.current.rotation.z += direction * delta * (3 + throttle * 0.28)
  })
  return (
    <group ref={prop} position={position}>
      <mesh><capsuleGeometry args={[0.07, 1.82, 6, 12]} /><meshStandardMaterial color={highlighted ? '#f3c84b' : '#9b5a3c'} roughness={0.75} /></mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.13, 0.13, 0.18, 16]} /><meshStandardMaterial color="#4f5853" metalness={0.3} /></mesh>
    </group>
  )
}

function FlyerModel({ pitch, warp, yaw, throttle, mode, activeControl }) {
  const model = useRef()
  const frameColor = '#8c503a'
  const fabric = '#f3d267'
  const pitchRotation = (-pitch * Math.PI) / 60
  const yawRotation = (yaw * Math.PI) / 75
  const controlsMode = mode === 'controls'
  const propulsionMode = mode === 'propulsion'
  const strutXs = [-3.25, -2.05, -0.85, 0.85, 2.05, 3.25]
  const wireColor = '#76584b'

  useEffect(() => {
    if (!model.current) return
    model.current.traverse((object) => {
      if (!object.material) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      let node = object
      let mechanism = null
      while (node && node !== model.current) {
        if (node.userData.mechanism) {
          mechanism = node.userData.mechanism
          break
        }
        node = node.parent
      }
      materials.forEach((material) => {
        if (material.userData.baseOpacity === undefined) material.userData.baseOpacity = material.opacity
        const relevantMechanisms = activeControl === 'turn' ? ['warp', 'yaw'] : [activeControl]
        const dimmed = activeControl && !relevantMechanisms.includes(mechanism)
        material.transparent = dimmed || material.userData.baseOpacity < 1
        material.opacity = dimmed ? material.userData.baseOpacity * 0.14 : material.userData.baseOpacity
        material.depthWrite = !dimmed
        material.needsUpdate = true
      })
    })
  }, [activeControl])

  return (
    <group ref={model} scale={0.86}>
      {[0.68, -0.68].map((y) => (
        <group key={y} userData={{ mechanism: 'warp' }}>
          <CamberedSurface width={7.2} chord={1.55} camber={0.15} color={fabric} position={[0, y, 0]} warp={warp} />
          {controlsMode && (
            <>
              <Line points={[[-3.58, y, -0.7], [-3.58, y, 0.7]]} color="#2e8ba0" lineWidth={4} />
              <Line points={[[3.58, y, -0.7], [3.58, y, 0.7]]} color="#2e8ba0" lineWidth={4} />
            </>
          )}
        </group>
      ))}

      {strutXs.flatMap((x) => [-0.48, 0.48].map((z) => (
        <Beam key={`strut-${x}-${z}`} from={[x, -0.65, z]} to={[x, 0.69, z]} radius={0.022} color={frameColor} />
      )))}
      {strutXs.slice(0, -1).flatMap((x, index) => {
        const nextX = strutXs[index + 1]
        return [-0.5, 0.5].flatMap((z) => [
          <Line key={`wire-up-${x}-${z}`} points={[[x, -0.62, z], [nextX, 0.65, z]]} color={wireColor} lineWidth={0.7} transparent opacity={0.65} />,
          <Line key={`wire-down-${x}-${z}`} points={[[x, 0.65, z], [nextX, -0.62, z]]} color={wireColor} lineWidth={0.7} transparent opacity={0.65} />,
        ])
      })}

      <Beam from={[-1.45, -0.8, -0.62]} to={[1.45, -0.8, -0.62]} radius={0.04} />
      <Beam from={[-1.3, -0.86, 0.62]} to={[1.3, -0.86, 0.62]} radius={0.038} />

      <group position={[0, 0, -2.55]} rotation={[pitchRotation, 0, 0]} userData={{ mechanism: 'pitch' }}>
        <CamberedSurface width={2.2} chord={0.58} camber={0.05} color={controlsMode ? '#76569b' : fabric} position={[0, 0.32, 0]} ribs={false} />
        <CamberedSurface width={2.2} chord={0.58} camber={0.05} color={controlsMode ? '#76569b' : fabric} position={[0, -0.08, 0]} ribs={false} />
        {[-0.95, 0.95].map((x) => <Beam key={x} from={[x, -0.08, -0.23]} to={[x, 0.34, -0.23]} radius={0.022} />)}
      </group>
      {[-0.82, 0.82].flatMap((x) => [
        <Beam key={`canard-low-${x}`} from={[x, -0.62, -0.48]} to={[x * 1.12, -0.1, -2.55]} radius={0.025} />,
        <Beam key={`canard-high-${x}`} from={[x, 0.62, -0.48]} to={[x * 1.12, 0.34, -2.55]} radius={0.023} />,
        <Line key={`canard-wire-${x}`} points={[[x, -0.58, -0.42], [x * 1.12, 0.32, -2.52]]} color={wireColor} lineWidth={0.8} />,
      ])}
      <Beam from={[-0.92, -0.12, -2.72]} to={[-0.7, -1.02, -1.35]} radius={0.025} />
      <Beam from={[0.92, -0.12, -2.72]} to={[0.7, -1.02, -1.35]} radius={0.025} />

      <group position={[0, 0.05, 1.9]} rotation={[0, yawRotation, 0]} userData={{ mechanism: 'yaw' }}>
        {[-0.31, 0.31].map((x) => (
          <mesh key={x} position={[x, 0, 0]} castShadow>
            <boxGeometry args={[0.045, 1.08, 0.62]} />
            <meshStandardMaterial color={controlsMode ? '#e65a45' : fabric} roughness={0.92} />
          </mesh>
        ))}
        <Beam from={[-0.36, -0.54, -0.3]} to={[0.36, -0.54, -0.3]} radius={0.022} />
        <Beam from={[-0.36, 0.54, -0.3]} to={[0.36, 0.54, -0.3]} radius={0.022} />
      </group>
      {[-0.48, 0.48].flatMap((x) => [
        <Beam key={`tail-low-${x}`} from={[x, -0.58, 0.55]} to={[x * 0.72, -0.49, 1.88]} radius={0.024} />,
        <Beam key={`tail-high-${x}`} from={[x, 0.6, 0.55]} to={[x * 0.72, 0.57, 1.88]} radius={0.022} />,
        <Line key={`tail-wire-${x}`} points={[[x, -0.54, 0.55], [x * 0.72, 0.54, 1.86]]} color={wireColor} lineWidth={0.8} />,
      ])}

      <mesh position={[0.62, -0.43, -0.02]} castShadow>
        <boxGeometry args={[0.58, 0.3, 0.5]} />
        <meshStandardMaterial color={propulsionMode ? '#e65a45' : '#6f6a58'} metalness={0.3} />
      </mesh>
      {[-0.18, -0.05, 0.08, 0.21].map((z) => (
        <mesh key={z} position={[0.62, -0.21, z - 0.02]}><cylinderGeometry args={[0.055, 0.055, 0.22, 10]} /><meshStandardMaterial color="#4f5853" metalness={0.4} /></mesh>
      ))}
      <mesh position={[0.1, 0.02, -0.12]}><boxGeometry args={[0.12, 1.12, 0.38]} /><meshStandardMaterial color="#aa7650" metalness={0.25} /></mesh>
      <mesh position={[0.88, 0.4, -0.06]}><capsuleGeometry args={[0.08, 0.32, 6, 10]} /><meshStandardMaterial color="#d2a64d" /></mesh>

      <Propeller throttle={throttle} position={[-1.42, 0, 0.92]} highlighted={propulsionMode} direction={1} />
      <Propeller throttle={throttle} position={[1.42, 0, 0.92]} highlighted={propulsionMode} direction={-1} />
      <Beam from={[-1.42, 0, 0.55]} to={[-1.42, 0, 1.18]} radius={0.035} color="#555a55" />
      <Beam from={[1.42, 0, 0.55]} to={[1.42, 0, 1.18]} radius={0.035} color="#555a55" />
      {[-1.42, 1.42].map((x) => <Beam key={x} from={[x, 0, 0.92]} to={[x * 0.62, -0.43, 0.25]} radius={0.018} color="#5c5149" />)}

      <mesh position={[-0.48, -0.43, -0.28]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <capsuleGeometry args={[0.14, 0.7, 6, 12]} /><meshStandardMaterial color="#344e57" />
      </mesh>
      <mesh position={[-0.48, -0.34, -0.82]}><sphereGeometry args={[0.18, 16, 12]} /><meshStandardMaterial color="#c27b5c" /></mesh>
      <mesh position={[-0.48, -0.55, -0.16]} userData={{ mechanism: 'warp' }}><boxGeometry args={[0.55, 0.12, 0.68]} /><meshStandardMaterial color={controlsMode ? '#2e8ba0' : '#9f694d'} /></mesh>

      {[-0.68, 0.68].map((x) => (
        <group key={x}>
          <Beam from={[x, -1.03, -1.55]} to={[x, -1.03, 1.38]} radius={0.035} />
          <Beam from={[x, -0.76, -0.7]} to={[x, -1.03, -1.42]} radius={0.03} />
          <Beam from={[x, -0.76, 0.62]} to={[x, -1.03, 1.28]} radius={0.03} />
        </group>
      ))}
      <Beam from={[-0.7, -1.02, -1.45]} to={[0.7, -1.02, -1.45]} radius={0.03} />
      <Beam from={[-0.7, -1.02, 1.28]} to={[0.7, -1.02, 1.28]} radius={0.03} />

      {propulsionMode && (
        <group>
          <Line points={[[0.62, -0.28, 0.05], [-1.42, 0, 0.92]]} color="#e65a45" lineWidth={3} />
          <Line points={[[0.62, -0.28, 0.05], [1.42, 0, 0.92]]} color="#e65a45" lineWidth={3} />
          <Billboard position={[0.62, 0.08, -0.18]}><Text fontSize={0.2} color="#7a3c33" outlineWidth={0.014} outlineColor="#fff6e8">ENGINE</Text></Billboard>
          <Billboard position={[0.25, 0.18, 0.58]}><Text fontSize={0.18} color="#7a3c33" outlineWidth={0.014} outlineColor="#fff6e8">CHAIN DRIVE</Text></Billboard>
        </group>
      )}
    </group>
  )
}

function FlyerWingPressure() {
  const dots = useRef()
  const startTime = useRef(null)
  const samples = useMemo(() => {
    const xs = Array.from({ length: 11 }, (_, index) => -3.2 + index * 0.64)
    const zs = [-0.58, -0.2, 0.2, 0.58]
    return ['upper', 'lower'].flatMap((side) => xs.flatMap((x, xIndex) => zs.map((z, zIndex) => ({
      x,
      y: side === 'upper'
        ? 0.72 + wingCamber(z, 1.55, 0.15) + 0.04
        : -0.72 + wingCamber(z, 1.55, 0.15) - 0.04,
      z,
      side,
      delay: xIndex * 0.025 + zIndex * 0.02 + (side === 'lower' ? 0.16 : 0),
    }))))
  }, [])

  useFrame((state) => {
    if (!dots.current) return
    if (startTime.current === null) startTime.current = state.clock.elapsedTime
    const elapsed = state.clock.elapsedTime - startTime.current
    dots.current.children.forEach((dot) => {
      const progress = clamp((elapsed - dot.userData.delay) * 5, 0.001, 1)
      dot.scale.setScalar(1 - (1 - progress) ** 3)
    })
  })

  return (
    <group>
      <group ref={dots} scale={0.86}>
        {samples.map((sample, index) => {
          const upper = sample.side === 'upper'
          return (
            <mesh key={index} position={[sample.x, sample.y, sample.z]} scale={0.001} userData={{ delay: sample.delay }}>
              <sphereGeometry args={[upper ? 0.05 : 0.06, 10, 8]} />
              <meshBasicMaterial color={upper ? '#27829c' : '#e0a522'} />
            </mesh>
          )
        })}
      </group>
      {[-2, 0, 2].map((x) => <ForceArrow key={`top-${x}`} from={[x, 1.35, 1.25]} direction={[0, -1, 0]} length={0.38} color="#27829c" />)}
      {[-2, 0, 2].map((x) => <ForceArrow key={`bottom-${x}`} from={[x, -1.35, 1.25]} direction={[0, 1, 0]} length={0.72} color="#f0c43f" />)}
      <Billboard position={[0, 1.7, 1.3]}><Text fontSize={0.22} color="#226579" outlineWidth={0.015} outlineColor="#fff5e7">LOW PRESSURE</Text></Billboard>
      <Billboard position={[0, -1.65, 1.3]}><Text fontSize={0.22} color="#8b6415" outlineWidth={0.015} outlineColor="#fff5e7">HIGH PRESSURE</Text></Billboard>
    </group>
  )
}

function PropWash({ throttle }) {
  const particles = useRef()
  useFrame((_, delta) => {
    if (!particles.current) return
    particles.current.children.forEach((particle) => {
      particle.position.z += delta * (1.1 + throttle / 17)
      if (particle.position.z > 5.2) particle.position.z = 0.8
    })
  })
  return (
    <group ref={particles}>
      {Array.from({ length: 30 }, (_, index) => {
        const side = index % 2 ? 1 : -1
        return (
          <mesh key={index} position={[side * (1.15 + (index % 3) * 0.16), ((index * 7) % 9) * 0.08 - 0.32, 0.8 + (index / 30) * 4.4]}>
            <boxGeometry args={[0.025, 0.025, 0.38]} /><meshBasicMaterial color="#fff3d2" transparent opacity={0.78} />
          </mesh>
        )
      })}
      <Billboard position={[0, 0.9, 3.35]}><Text fontSize={0.23} color="#315964" outlineWidth={0.014} outlineColor="#fff5e7">AIR PUSHED BACK</Text></Billboard>
    </group>
  )
}

function ControlGuides({ activeControl }) {
  const visible = (control) => !activeControl || activeControl === control || (activeControl === 'turn' && ['warp', 'yaw'].includes(control))
  return (
    <group>
      {visible('pitch') && <Billboard position={[0, 0.75, -2.55]}><Text fontSize={0.25} color="#65448c" outlineWidth={0.016} outlineColor="#fff5e7">ELEVATOR · PITCH</Text></Billboard>}
      {visible('warp') && <Billboard position={[-3.1, 1.25, 0]}><Text fontSize={0.24} color="#1e7287" outlineWidth={0.016} outlineColor="#fff5e7">WING WARP · ROLL</Text></Billboard>}
      {visible('yaw') && <Billboard position={[0, 1.25, 1.8]}><Text fontSize={0.24} color="#a43e33" outlineWidth={0.016} outlineColor="#fff5e7">TWIN RUDDER · YAW</Text></Billboard>}
    </group>
  )
}

const FIELD_COLORS = ['#efc45b', '#e98b72', '#91b68d', '#e9b1be', '#d99061']
const WORLD_HORIZONTAL_SCALE = 0.18
const FLYER_GROUND_HEIGHT = 1.02
const SIMULATION_STEP = 1 / 120
const altitudeToWorld = (altitude) => Math.sqrt(Math.max(0, altitude)) * 0.65
const LANDSCAPE_CELL_SIZE = 48
const LANDSCAPE_CELLS = [-2, -1, 0, 1, 2].flatMap((x) => [-2, -1, 0, 1, 2].map((z) => [x, z]))
const FIELD_TILES = Array.from({ length: 16 }, (_, index) => {
  const column = index % 4
  const row = Math.floor(index / 4)
  return [
    -18 + column * 12 + (row % 2) * 0.6,
    -18 + row * 12,
    10.4 + (index % 3) * 0.25,
    10.2 + (index % 4) * 0.2,
    FIELD_COLORS[index % FIELD_COLORS.length],
  ]
})
const DISTANT_FIELD_TILES = [[-12, -12], [12, -12], [-12, 12], [12, 12]]

function LandscapeCell({ cellX, cellZ, atmosphere, time, detail }) {
  return (
    <group position={[cellX * LANDSCAPE_CELL_SIZE, 0, cellZ * LANDSCAPE_CELL_SIZE]}>
      {detail ? FIELD_TILES.map(([x, z, width, depth, color], index) => (
        <mesh key={`field-${index}`} position={[x, 0.015, z]} rotation={[-Math.PI / 2, 0, (index % 3 - 1) * 0.035]} receiveShadow>
          <planeGeometry args={[width, depth]} />
          <meshStandardMaterial color={atmosphere.fields?.[index % atmosphere.fields.length] || color} roughness={1} transparent opacity={time === 'night' ? 0.76 : 0.9} />
        </mesh>
      )) : DISTANT_FIELD_TILES.map(([x, z], index) => {
        const colorIndex = Math.abs(cellX * 3 + cellZ * 5 + index) % FIELD_COLORS.length
        return (
          <mesh key={`distant-field-${index}`} position={[x, 0.01, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[23.2, 23.2]} />
            <meshStandardMaterial color={atmosphere.fields?.[colorIndex] || FIELD_COLORS[colorIndex]} roughness={1} transparent opacity={time === 'night' ? 0.62 : 0.82} />
          </mesh>
        )
      })}
      {detail && Array.from({ length: 8 }, (_, index) => (
        <group key={`fence-${index}`} position={[-18 + (index % 2) * 36, 0.36, -20 + Math.floor(index / 2) * 13]}>
          <mesh><boxGeometry args={[0.08, 0.75, 0.08]} /><meshStandardMaterial color="#8d513d" /></mesh>
          <mesh position={[0, 0.14, 0]} rotation={[0, 0, Math.PI / 2]}><boxGeometry args={[0.045, 2.1, 0.045]} /><meshStandardMaterial color="#b66a49" /></mesh>
        </group>
      ))}
      {detail && Array.from({ length: 12 }, (_, index) => (
        <mesh key={`streak-${index}`} position={[-18 + (index % 4) * 12, 0.075, -18 + Math.floor(index / 4) * 18]}>
          <boxGeometry args={[0.035, 0.018, 0.75 + (index % 3) * 0.22]} />
          <meshBasicMaterial color={index % 2 ? '#fff0c6' : '#d96c5b'} transparent opacity={0.68} />
        </mesh>
      ))}
    </group>
  )
}

function InfiniteLandscape({ stateRef, time }) {
  const world = useRef()
  const shadow = useRef()
  const atmosphere = WRIGHT_ATMOSPHERE[time]

  useFrame(() => {
    const state = stateRef.current
    const aircraftX = state.positionX * WORLD_HORIZONTAL_SCALE
    const aircraftZ = state.positionZ * WORLD_HORIZONTAL_SCALE
    if (world.current) {
      world.current.position.x = Math.round(aircraftX / LANDSCAPE_CELL_SIZE) * LANDSCAPE_CELL_SIZE
      world.current.position.z = Math.round(aircraftZ / LANDSCAPE_CELL_SIZE) * LANDSCAPE_CELL_SIZE
    }
    if (shadow.current) {
      const shadowOpacity = clamp(0.34 - state.altitude * 0.004, 0.04, 0.34)
      const shadowScale = 1 + Math.min(state.altitude, 40) * 0.03
      shadow.current.position.x = aircraftX
      shadow.current.position.z = aircraftZ
      shadow.current.scale.set(shadowScale * 2.2, shadowScale, 1)
      shadow.current.material.opacity = shadowOpacity
    }
  })

  return (
    <group>
      <group ref={world}>
        <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[LANDSCAPE_CELL_SIZE * 5.4, LANDSCAPE_CELL_SIZE * 5.4]} />
          <meshStandardMaterial color={atmosphere.ground} roughness={1} />
        </mesh>
        {LANDSCAPE_CELLS.map(([cellX, cellZ]) => (
          <LandscapeCell key={`${cellX}-${cellZ}`} cellX={cellX} cellZ={cellZ} atmosphere={atmosphere} time={time} detail={Math.abs(cellX) <= 1 && Math.abs(cellZ) <= 1} />
        ))}
      </group>
      <group position={[0, 0.09, -34]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[4.8, 82]} /><meshStandardMaterial color="#d8b28f" roughness={1} /></mesh>
        {[-1.05, 1.05].map((x) => <mesh key={x} position={[x, 0.035, 0]}><boxGeometry args={[0.045, 0.035, 82]} /><meshStandardMaterial color="#80513e" /></mesh>)}
      </group>
      <mesh ref={shadow} position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.9, 40]} />
        <meshBasicMaterial color="#6e5260" transparent opacity={0.34} depthWrite={false} />
      </mesh>
    </group>
  )
}

function SkyLayer({ stateRef, time }) {
  const sky = useRef()
  const atmosphere = WRIGHT_ATMOSPHERE[time]
  useFrame(() => {
    if (!sky.current) return
    sky.current.position.x = stateRef.current.positionX * WORLD_HORIZONTAL_SCALE * 0.86
    sky.current.position.z = stateRef.current.positionZ * WORLD_HORIZONTAL_SCALE * 0.86
  })
  return (
    <group ref={sky}>
      <Cloud position={[-13, 8, -18]} scale={1.1} color={atmosphere.cloud} opacity={time === 'night' ? 0.72 : 1} />
      <Cloud position={[15, 10, -25]} scale={1.45} color={atmosphere.cloud} opacity={time === 'night' ? 0.72 : 1} />
      <Cloud position={[6, 6, 13]} scale={0.75} color={atmosphere.cloud} opacity={time === 'night' ? 0.72 : 1} />
      {time === 'evening' && <mesh position={[-17, 12, -30]}><sphereGeometry args={[1.2, 24, 18]} /><meshBasicMaterial color="#ffd0aa" /></mesh>}
      {time === 'night' && <><Stars radius={80} depth={22} count={900} factor={3} saturation={0.1} fade speed={0.25} /><mesh position={[-17, 14, -32]}><sphereGeometry args={[0.8, 24, 18]} /><meshBasicMaterial color="#dce8ff" /></mesh></>}
    </group>
  )
}

function FlyerScene({ throttle, inputRef, stateRef, simulationAccumulatorRef, telemetry, onTelemetry, liftRatio, mode, time, activeControl }) {
  const plane = useRef()
  const aerodynamicForces = useRef()
  const worldForces = useRef()
  const publishElapsed = useRef(0)
  const cameraTarget = useRef(new THREE.Vector3(0, FLYER_GROUND_HEIGHT, -3))
  const nextCameraTarget = useRef(new THREE.Vector3())
  const aircraftPosition = useRef(new THREE.Vector3())
  const desiredCamera = useRef(new THREE.Vector3())
  const forward = useRef(new THREE.Vector3(0, 0, -1))
  const atmosphere = WRIGHT_ATMOSPHERE[time]

  useFrame(({ camera }, delta) => {
    const frameDelta = Math.min(delta, 0.2)
    simulationAccumulatorRef.current += frameDelta
    let state = stateRef.current
    let stepCount = 0
    while (simulationAccumulatorRef.current >= SIMULATION_STEP && stepCount < 24) {
      state = stepFlyer(state, { ...inputRef.current, throttle: throttle / 100 }, SIMULATION_STEP)
      simulationAccumulatorRef.current -= SIMULATION_STEP
      stepCount += 1
    }
    stateRef.current = state

    aircraftPosition.current.set(
      state.positionX * WORLD_HORIZONTAL_SCALE,
      FLYER_GROUND_HEIGHT + altitudeToWorld(state.altitude),
      state.positionZ * WORLD_HORIZONTAL_SCALE,
    )
    if (plane.current) {
      plane.current.position.copy(aircraftPosition.current)
      plane.current.rotation.set(state.pitch, -state.heading, -state.bank, 'YXZ')
    }
    if (aerodynamicForces.current) {
      aerodynamicForces.current.position.copy(aircraftPosition.current)
      aerodynamicForces.current.rotation.set(state.flightPathAngle, -state.heading, -state.bank, 'YXZ')
    }
    if (worldForces.current) worldForces.current.position.copy(aircraftPosition.current)

    forward.current.set(Math.sin(state.heading), 0, -Math.cos(state.heading))
    desiredCamera.current.copy(aircraftPosition.current)
      .addScaledVector(forward.current, -11.5)
    desiredCamera.current.y += 5.2
    const cameraBlend = 1 - Math.exp(-3.2 * frameDelta)
    camera.position.lerp(desiredCamera.current, cameraBlend)
    const lookY = 0.55 + Math.sin(state.pitch) * 3
    nextCameraTarget.current.copy(aircraftPosition.current).addScaledVector(forward.current, 4.5)
    nextCameraTarget.current.y += lookY
    cameraTarget.current.lerp(nextCameraTarget.current, 1 - Math.exp(-4.4 * frameDelta))
    camera.lookAt(cameraTarget.current)

    publishElapsed.current += frameDelta
    if (publishElapsed.current >= 0.065) {
      onTelemetry(flyerTelemetry(state))
      publishElapsed.current = 0
    }
  })

  return (
    <>
      <color attach="background" args={[atmosphere.sky]} />
      <fog attach="fog" args={[atmosphere.fog, 42, 105]} />
      <StudioLights time={time} />
      <InfiniteLandscape stateRef={stateRef} time={time} />
      <SkyLayer stateRef={stateRef} time={time} />
      <group ref={plane} position={[0, FLYER_GROUND_HEIGHT, 0]}>
        <FlyerModel pitch={telemetry.elevator} warp={telemetry.warp} yaw={telemetry.rudder} throttle={throttle} mode={mode} activeControl={activeControl} />

        {mode === 'wings' && (
          <FlyerWingPressure />
        )}

        {mode === 'propulsion' && (
          <>
            <PropWash throttle={throttle} />
            <ForceArrow from={[0, 1.45, 0.3]} direction={[0, 0, -1]} length={Math.min(2.4, 0.8 + telemetry.thrust / 220)} color="#f2c746" label={`THRUST · ${formatForce(telemetry.thrust)}`} />
          </>
        )}

        {mode === 'controls' && <ControlGuides activeControl={activeControl} />}
      </group>
      <group ref={aerodynamicForces}>
        {mode === 'wings' && (
          <>
            <ForceArrow from={[0, 0.8, 0]} direction={[0, 1, 0]} length={Math.min(2.25, 0.6 + liftRatio)} color="#e6543f" label={`LIFT · ${formatForce(telemetry.lift)}`} />
            <ForceArrow from={[2.65, 0.15, 0.25]} direction={[0, 0, 1]} length={1.55} color="#76569b" label={`DRAG · ${formatForce(telemetry.drag)}`} />
          </>
        )}
        {mode === 'propulsion' && <ForceArrow from={[2.65, 0.15, 0.25]} direction={[0, 0, 1]} length={1.25} color="#76569b" label="DRAG" />}
      </group>
      <group ref={worldForces}>
        {mode === 'wings' && <ForceArrow from={[0, -0.75, 0]} direction={[0, -1, 0]} length={1.45} color="#2d6171" label="WEIGHT" />}
      </group>
    </>
  )
}

export function WrightLab() {
  const [throttle, setThrottle] = useState(78)
  const [startMode, setStartMode] = useState('airborne')
  const [mode, setMode] = useState('flight')
  const [telemetry, setTelemetry] = useState(INITIAL_TELEMETRY)
  const [pressedKeys, setPressedKeys] = useState({ w: false, a: false, s: false, d: false })
  const [simulatorFocused, setSimulatorFocused] = useState(false)
  const simulator = useRef()
  const inputRef = useRef({ pitch: 0, roll: 0 })
  const heldKeysRef = useRef({ w: false, a: false, s: false, d: false })
  const flightStateRef = useRef(createFlyerState({ airborne: true }))
  const simulationAccumulatorRef = useRef(0)
  const time = useTimeOfDay()
  const wingSection = useRef()
  const propulsionSection = useRef()
  const controlsSection = useRef()
  const lastAutoMode = useRef(null)
  const speed = telemetry.speed
  const weight = FLYER_WEIGHT
  const liftRatio = clamp(telemetry.lift / weight, 0, 2.2)
  const thrust = telemetry.thrust
  const propwashDeltaV = 5 + throttle * 0.09
  const propwashMassFlow = thrust / propwashDeltaV
  const altitudeFeet = telemetry.altitude * 3.28084
  const headingDegrees = telemetry.headingDegrees
  const flightPath = telemetry.turnRate > 0.015 ? 'CURVING RIGHT ↷' : telemetry.turnRate < -0.015 ? 'CURVING LEFT ↶' : 'STRAIGHT AHEAD'
  const flightPhase = telemetry.altitude >= MAX_FLYER_ALTITUDE - 0.1 ? 'At 1,000 ft ceiling'
    : telemetry.stall ? 'Wing stalled'
    : telemetry.altitude < 0.05
    ? telemetry.lift >= weight ? 'Lifting off' : speed < 8 ? 'Takeoff roll' : 'Building lift'
    : telemetry.verticalSpeed > 0.2 ? 'Climbing' : telemetry.verticalSpeed < -0.2 ? 'Descending' : 'Airborne'
  const activeControl = mode === 'controls'
    ? pressedKeys.w || pressedKeys.s ? 'pitch' : pressedKeys.a || pressedKeys.d ? 'turn' : null
    : null

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return undefined
    const sections = [wingSection.current, propulsionSection.current, controlsSection.current].filter(Boolean)
    const observer = new IntersectionObserver((entries) => {
      const active = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (active) {
        const nextMode = active.target.dataset.sceneMode
        if (lastAutoMode.current !== nextMode) {
          lastAutoMode.current = nextMode
          setMode(nextMode)
        }
      }
    }, { threshold: [0.01, 0.25], rootMargin: '-22% 0px -44% 0px' })
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    document.body.dataset.flightTime = time
    return () => {
      if (document.body.dataset.flightTime === time) delete document.body.dataset.flightTime
    }
  }, [time])

  useEffect(() => {
    const focusFrame = requestAnimationFrame(() => simulator.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(focusFrame)
  }, [])

  const updateFlightKey = (code, pressed) => {
    const key = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd' }[code]
    if (!key) return false
    if (heldKeysRef.current[key] === pressed) return pressed
    const next = { ...heldKeysRef.current, [key]: pressed }
    heldKeysRef.current = next
    inputRef.current = {
      pitch: (next.w ? 1 : 0) - (next.s ? 1 : 0),
      roll: (next.d ? 1 : 0) - (next.a ? 1 : 0),
    }
    setPressedKeys(next)
    return true
  }

  const clearFlightKeys = () => {
    heldKeysRef.current = { w: false, a: false, s: false, d: false }
    inputRef.current = { pitch: 0, roll: 0 }
    setPressedKeys({ w: false, a: false, s: false, d: false })
  }

  const handleKeyDown = (event) => {
    if (event.target.matches('input, button, select, textarea, [contenteditable="true"]')) return
    if (updateFlightKey(event.code, true)) event.preventDefault()
  }

  const handleControlPointerDown = (event, code) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    updateFlightKey(code, true)
  }

  const handleControlPointerUp = (event, code) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    updateFlightKey(code, false)
  }

  useEffect(() => {
    const handleKeyUp = (event) => {
      if (updateFlightKey(event.code, false)) event.preventDefault()
    }
    const handleWindowBlur = () => clearFlightKeys()
    const handleVisibility = () => {
      if (document.hidden) clearFlightKeys()
    }
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleWindowBlur)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleWindowBlur)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  const chooseMode = (nextMode) => {
    setMode(nextMode)
    requestAnimationFrame(() => simulator.current?.focus({ preventScroll: true }))
  }

  const restoreFlight = (nextStartMode) => {
    flightStateRef.current = createFlyerState({ airborne: nextStartMode === 'airborne' })
    simulationAccumulatorRef.current = 0
    setTelemetry(flyerTelemetry(flightStateRef.current))
  }

  const reset = () => {
    setThrottle(78)
    clearFlightKeys()
    restoreFlight(startMode)
    requestAnimationFrame(() => simulator.current?.focus({ preventScroll: true }))
  }

  const chooseStartMode = (nextMode) => {
    setStartMode(nextMode)
    clearFlightKeys()
    restoreFlight(nextMode)
    requestAnimationFrame(() => simulator.current?.focus({ preventScroll: true }))
  }

  return (
    <div className={`lab-layout lab-layout--cake-box lab-layout--time-${time}`}>
      <section
        ref={simulator}
        className={`demo-pane demo-pane--wright flyer-simulator${simulatorFocused ? ' is-focused' : ''}`}
        aria-label="Interactive Wright Flyer flight simulator"
        aria-describedby="flyer-keyboard-description"
        data-testid="flyer-simulator"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onFocus={(event) => {
          const ownsFocus = event.target === event.currentTarget
          setSimulatorFocused(ownsFocus)
          if (!ownsFocus) clearFlightKeys()
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setSimulatorFocused(false)
            clearFlightKeys()
          }
        }}
        onPointerDown={(event) => {
          if (event.target.tagName === 'CANVAS') simulator.current?.focus({ preventScroll: true })
        }}
      >
        <span id="flyer-keyboard-description" className="sr-only">Use W to pitch up, S to pitch down, A to bank left, and D to bank right. Release the keys to return the controls toward neutral.</span>
        <div className="scene-toolbar"><SceneBadge>{flightPhase} · {MODE_SHORT[mode]}</SceneBadge><ResetButton onClick={reset} /></div>
        <div className="scene-mode flyer-scene-mode" aria-label="Wright Flyer visualization mode">
          <button type="button" aria-pressed={mode === 'flight'} className={mode === 'flight' ? 'is-active' : ''} onClick={() => chooseMode('flight')}>Fly</button>
          <button type="button" aria-pressed={mode === 'wings'} className={mode === 'wings' ? 'is-active' : ''} onClick={() => chooseMode('wings')}>Wing forces</button>
          <button type="button" aria-pressed={mode === 'propulsion'} className={mode === 'propulsion' ? 'is-active' : ''} onClick={() => chooseMode('propulsion')}>Propellers</button>
          <button type="button" aria-pressed={mode === 'controls'} className={mode === 'controls' ? 'is-active' : ''} onClick={() => chooseMode('controls')}>Pilot controls</button>
        </div>
        <div className="motion-reference" aria-label="Motion reference frame">
          <span data-testid="telemetry-heading" data-value={headingDegrees}><small>Flyer heading</small><b>{String(Math.round(headingDegrees)).padStart(3, '0')}° · {speed.toFixed(1)} m/s</b></span>
          <span data-testid="telemetry-flight-path" data-value={telemetry.flightPathDegrees}><small>Flight path</small><b>{flightPath}</b></span>
        </div>
        <Canvas camera={{ position: [0, 5.5, 13], fov: 48, near: 0.1, far: 240 }} shadows dpr={[1, 1.75]} gl={{ preserveDrawingBuffer: true }}>
          <FlyerScene throttle={throttle} inputRef={inputRef} stateRef={flightStateRef} simulationAccumulatorRef={simulationAccumulatorRef} telemetry={telemetry} onTelemetry={setTelemetry} liftRatio={liftRatio} mode={mode} time={time} activeControl={activeControl} />
        </Canvas>
        <div className="flight-keys" aria-label="Flight controls">
          {[
            ['w', 'KeyW', 'Pitch up'],
            ['a', 'KeyA', 'Bank left'],
            ['s', 'KeyS', 'Pitch down'],
            ['d', 'KeyD', 'Bank right'],
          ].map(([key, code, label]) => (
            <button
              key={key}
              type="button"
              aria-label={`${label} (${key.toUpperCase()})`}
              className={pressedKeys[key] ? 'is-active' : ''}
              onPointerDown={(event) => handleControlPointerDown(event, code)}
              onPointerUp={(event) => handleControlPointerUp(event, code)}
              onPointerCancel={(event) => handleControlPointerUp(event, code)}
              onLostPointerCapture={() => updateFlightKey(code, false)}
            >{key.toUpperCase()}</button>
          ))}
        </div>
        <div className="instrument-cluster instrument-cluster--wright">
          <div className="dial" data-testid="telemetry-speed" data-value={speed} style={{ '--needle': `${-110 + (speed / 31) * 220}deg` }}><i /><span>{Math.round(speed * 2.237)}</span><small>MPH</small></div>
          <div className="attitude" data-testid="telemetry-attitude" data-pitch={telemetry.pitchDegrees} data-bank={telemetry.bankDegrees}><span style={{ transform: `rotate(${-telemetry.bankDegrees}deg) translateY(${telemetry.pitchDegrees * 1.2}px)` }} /><b>HDG {String(Math.round(headingDegrees)).padStart(3, '0')}°</b></div>
          <div className="altimeter" data-testid="telemetry-altitude" data-value={altitudeFeet}><span>{Math.round(altitudeFeet).toLocaleString()}</span><small>FEET · {telemetry.verticalSpeed >= 0 ? '+' : ''}{(telemetry.verticalSpeed * 196.85).toFixed(0)} FPM</small><b>{flightPhase.toUpperCase()}</b></div>
        </div>
      </section>

      <aside className="lesson-pane">
        <SectionHeader kicker="Experiment 02 · 1903" title="Control was the real breakthrough.">
          The Flyer combined two lifting wings, twin propellers, and three-axis control into one aircraft the pilot could balance.
        </SectionHeader>

        <div className="control-group">
          <div className="group-title"><span>Flight setup</span><small>Propeller thrust</small></div>
          <div className="flight-start-mode" aria-label="Starting position">
            <button type="button" aria-pressed={startMode === 'airborne'} className={startMode === 'airborne' ? 'is-active' : ''} onClick={() => chooseStartMode('airborne')}><Plane size={15} /> In flight</button>
            <button type="button" aria-pressed={startMode === 'takeoff'} className={startMode === 'takeoff' ? 'is-active' : ''} onClick={() => chooseStartMode('takeoff')}><PlaneTakeoff size={15} /> Takeoff run</button>
          </div>
          <Slider label="Engine throttle" value={throttle} min={0} max={100} unit="%" onChange={setThrottle} />
        </div>

        <div className="metric-grid">
          <Metric label="Lift" value={formatForce(telemetry.lift)} />
          <Metric label="Weight" value={formatForce(weight)} tone="blue" />
          <Metric label="Thrust" value={formatForce(thrust)} tone="yellow" />
          <Metric label="Drag" value={formatForce(telemetry.drag)} tone="violet" />
          <Metric label="Airspeed" value={`${speed.toFixed(1)} m/s`} tone="blue" />
          <Metric label="Altitude" value={`${Math.round(altitudeFeet)} ft`} tone="yellow" />
        </div>

        <section ref={wingSection} data-scene-mode="wings" className="lesson-section">
          <h2>How the two wings make lift</h2>
          <p className="body-copy">Each fabric-covered wing creates lower pressure above and higher pressure below. The blue and yellow points show those distributed surface forces; adding them across both wings produces the net lift arrow.</p>
          <Equation caption="The Flyer used a very large total wing area because its speed was low. Speed still matters twice because v is squared."
            values={`½ × 1.225 × ${speed.toFixed(1)}² × ${FLYER_AREA} × ${telemetry.liftCoefficient.toFixed(2)} = ${formatForce(telemetry.lift)}`}>
            L = ½ ρ v² S C<sub>L</sub>
          </Equation>
          <Note>Drag has two main sources here: making lift tilts some aerodynamic force backward, while struts, wires, and the pilot also push directly against the air.</Note>
        </section>

        <section className="lesson-section">
          <h2>Takeoff is a force contest</h2>
          <Equation caption="Net vertical force creates vertical acceleration. The simulation integrates that acceleration into climb rate and altitude every frame."
            values={`(L cos ${Math.abs(telemetry.bankDegrees).toFixed(0)}° cos ${Math.abs(telemetry.flightPathDegrees).toFixed(0)}° + T sin ${telemetry.pitchDegrees.toFixed(0)}° − D sin ${telemetry.flightPathDegrees.toFixed(0)}° − W) ÷ ${FLYER_MASS} kg = ${(telemetry.netVerticalForce / FLYER_MASS).toFixed(2)} m/s²`}>
            a<sub>vertical</sub> = (L<sub>vertical</sub> + T<sub>vertical</sub> − D<sub>vertical</sub> − W) ÷ m
          </Equation>
          <Note>Watch the speed build during the takeoff roll. When lift exceeds weight near cycling speed, the aircraft leaves the ground. Increase pitch to climb; reduce pitch until lift matches weight to hold altitude; reduce it further to descend.</Note>
        </section>

        <section ref={propulsionSection} data-scene-mode="propulsion" className="lesson-section">
          <h2>How the twin propellers make thrust</h2>
          <p className="body-copy">The engine turned two pusher propellers through bicycle-style chain drives. Each propeller is a rotating wing: its angled blades create a pressure difference that accelerates a tube of air backward. The equal reaction pushes the Flyer forward.</p>
          <Equation caption="Thrust grows when the propellers move more air each second or give that air a larger backward velocity change."
            values={`${propwashMassFlow.toFixed(1)} kg/s × ${propwashDeltaV.toFixed(1)} m/s = ${formatForce(thrust)}`}>
            T = ṁ Δv
          </Equation>
          <Note>The two propellers rotated in opposite directions. That cancelled much of their twisting reaction so the fragile aircraft did not roll from engine torque.</Note>
        </section>

        <section ref={controlsSection} data-scene-mode="controls" className="lesson-section control-mechanics">
          <h2>Three motions, three mechanisms</h2>
          <p className="body-copy">The Flyer did not have a modern control wheel. A hand lever and a sliding hip cradle pulled cables through its open wooden frame.</p>

          <article className="control-mechanic control-mechanic--pitch">
            <header><span className="axis-chip axis-chip--pitch">PITCH</span><h3>The forward elevator</h3></header>
            <div className="mechanism-chain"><span>Hand lever</span><i>→</i><span>Control cables</span><i>→</i><span>Double canard tilts</span></div>
            <p>The pilot moved a lever to rotate the two fabric surfaces ahead of the wings. Their aerodynamic force acts far in front of the center of mass, creating a nose-up or nose-down moment. Nose-up pitch increases wing angle of attack and lift; nose-down pitch reduces it.</p>
            <Equation caption="A modest elevator force can rotate the aircraft because the forward outriggers give it a long lever arm."
              values={`elevator command ${telemetry.elevator.toFixed(1)}° · vertical speed ${telemetry.verticalSpeed >= 0 ? '+' : ''}${telemetry.verticalSpeed.toFixed(1)} m/s`}>
              τ<sub>pitch</sub> = F<sub>elevator</sub> × lever arm
            </Equation>
          </article>

          <article className="control-mechanic control-mechanic--warp">
            <header><span className="axis-chip axis-chip--roll">ROLL</span><h3>Wing warping and the hip cradle</h3></header>
            <div className="mechanism-chain"><span>Pilot shifts hips</span><i>→</i><span>Cables pull corners</span><i>→</i><span>Wing tips twist oppositely</span></div>
            <p>The pilot slid the cradle sideways. Cables increased the angle of attack at one pair of wing tips while decreasing it at the other, producing unequal lift and rolling the Flyer into a bank. Once banked, part of lift points sideways and bends the flight path into a turn. Holding the bank intentionally produces a circle; leveling the wings preserves the new heading.</p>
            <Equation caption="Differential lift across the wide span produces roll torque. Banking also reduces the upward share of lift, so pitch may be needed to hold altitude."
              values={`warp ${telemetry.warp.toFixed(1)}° · bank ${telemetry.bankDegrees.toFixed(1)}°`}>
              τ<sub>roll</sub> ≈ (L<sub>right</sub> − L<sub>left</sub>) × half-span
            </Equation>
          </article>

          <article className="control-mechanic control-mechanic--yaw">
            <header><span className="axis-chip axis-chip--yaw">YAW</span><h3>The linked twin rudders</h3></header>
            <div className="mechanism-chain"><span>Warp linkage</span><i>→</i><span>Twin rudders pivot</span><i>→</i><span>Tail force yaws nose</span></div>
            <p>The two rear rudders redirected airflow sideways. On the 1903 Flyer they were linked to wing warping, helping the nose follow the bank and countering adverse yaw from the more strongly lifted wing. The simulator preserves that linkage so a bank command also coordinates the rudders.</p>
            <Equation caption="The rudder's sideways force acts behind the center of mass. Its long tail arm turns the nose and changes the direction of ground flow."
              values={`rudder ${telemetry.rudder.toFixed(1)}° · heading ${String(Math.round(headingDegrees)).padStart(3, '0')}°`}>
              τ<sub>yaw</sub> = F<sub>rudder</sub> × tail arm
            </Equation>
          </article>

          <Note>A coordinated turn combines warp and rudder, then adds enough elevator to replace the vertical lift lost in the bank. The aircraft and chase camera move through one world, so every field and fence keeps the same position relative to its neighbors.</Note>
        </section>
      </aside>
    </div>
  )
}

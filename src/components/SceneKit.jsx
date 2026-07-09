import { Billboard, Line, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

const LIGHTING = {
  day: { ambient: 1.7, ambientColor: '#ffffff', key: 2.2, keyColor: '#ffffff', fill: 0.9, fillColor: '#f9cbd8' },
  evening: { ambient: 1.15, ambientColor: '#d9d2ff', key: 1.8, keyColor: '#ffd09f', fill: 1.15, fillColor: '#d28dca' },
  night: { ambient: 0.55, ambientColor: '#8ca8d8', key: 1.25, keyColor: '#b9d6ff', fill: 0.55, fillColor: '#e6a9c3' },
}

export function StudioLights({ time = 'day' }) {
  const lighting = LIGHTING[time] || LIGHTING.day
  return (
    <>
      <ambientLight intensity={lighting.ambient} color={lighting.ambientColor} />
      <directionalLight position={[7, 10, 8]} intensity={lighting.key} color={lighting.keyColor} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-8, 3, -5]} intensity={lighting.fill} color={lighting.fillColor} />
    </>
  )
}

export function Ground({ color = '#f4d87a', size = 50, y = -2.5 }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} receiveShadow>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color={color} roughness={0.92} />
    </mesh>
  )
}

export function ForceArrow({ from = [0, 0, 0], direction = [0, 1, 0], length = 2, color = '#e5533d', label }) {
  const end = useMemo(() => {
    const vector = new THREE.Vector3(...direction).normalize().multiplyScalar(length)
    return [from[0] + vector.x, from[1] + vector.y, from[2] + vector.z]
  }, [from, direction, length])
  const arrowRotation = useMemo(() => new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(...direction).normalize(),
  ), [direction])
  const labelPosition = [end[0] + direction[0] * 0.18, end[1] + direction[1] * 0.18, end[2] + direction[2] * 0.18]

  return (
    <group>
      <Line points={[from, end]} color={color} lineWidth={4} />
      <mesh position={end} quaternion={arrowRotation}>
        <coneGeometry args={[0.13, 0.38, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {label && (
        <Billboard position={labelPosition}>
          <Text fontSize={0.24} color={color} anchorX="center" outlineWidth={0.018} outlineColor="#fff9ef">
            {label}
          </Text>
        </Billboard>
      )}
    </group>
  )
}

export function Airflow({ speed = 20, y = 0, count = 26, length = 12, color = '#fffdf4' }) {
  const group = useRef()
  const lines = useMemo(() => Array.from({ length: count }, (_, index) => ({
    x: (index * 1.73) % length - length / 2,
    y: y + ((index * 2.31) % 4 - 2),
    z: ((index * 3.17) % 7 - 3.5),
    width: 0.18 + (index % 4) * 0.08,
  })), [count, length, y])

  useFrame((_, delta) => {
    if (!group.current) return
    group.current.children.forEach((line) => {
      line.position.x += delta * (0.7 + speed / 12)
      if (line.position.x > length / 2) line.position.x = -length / 2
    })
  })

  return (
    <group ref={group}>
      {lines.map((line, index) => (
        <mesh key={index} position={[line.x, line.y, line.z]}>
          <boxGeometry args={[line.width, 0.018, 0.018]} />
          <meshBasicMaterial color={color} transparent opacity={0.82} />
        </mesh>
      ))}
    </group>
  )
}

export function Cloud({ position, scale = 1, color = '#fff9ed', opacity = 1 }) {
  return (
    <group position={position} scale={scale}>
      {[[0, 0, 0, 0.72], [0.65, 0.05, 0, 0.54], [-0.58, -0.03, 0, 0.48], [0.1, 0.34, 0, 0.5]].map(([x, y, z, radius], i) => (
        <mesh key={i} position={[x, y, z]}>
          <sphereGeometry args={[radius, 20, 14]} />
          <meshStandardMaterial color={color} roughness={1} transparent opacity={opacity} />
        </mesh>
      ))}
    </group>
  )
}

export function MovingGroundStripes({ speed = 1, y = -2.49 }) {
  const ref = useRef()
  useFrame((_, delta) => {
    if (!ref.current) return
    ref.current.position.z += delta * speed
    if (ref.current.position.z > 4) ref.current.position.z = -4
  })
  return (
    <group ref={ref} position={[0, y, 0]}>
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, i * 2 - 8]}>
          <planeGeometry args={[30, 0.08]} />
          <meshBasicMaterial color="#dfa45f" transparent opacity={0.48} />
        </mesh>
      ))}
    </group>
  )
}

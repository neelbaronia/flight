export const AIR_DENSITY = 1.225
export const GRAVITY = 9.81

export function liftCoefficient(angleDeg, flapBoost = 0, stallAngle = 15) {
  const radians = (angleDeg * Math.PI) / 180
  const linear = 2 * Math.PI * radians + flapBoost
  const stallFade = Math.max(0.28, 1 - Math.max(0, Math.abs(angleDeg) - stallAngle) * 0.075)
  return linear * stallFade
}

export function flightForces({ speed, area, angle, dragCoefficient = 0.035, flapBoost = 0, density = AIR_DENSITY, stallAngle = 15 }) {
  const dynamicPressure = 0.5 * density * speed ** 2
  const cl = liftCoefficient(angle, flapBoost, stallAngle)
  const inducedDrag = 0.045 * cl ** 2
  return {
    cl,
    dynamicPressure,
    lift: dynamicPressure * area * cl,
    drag: dynamicPressure * area * (dragCoefficient + inducedDrag),
  }
}

export const formatForce = (newtons) => {
  const magnitude = Math.abs(newtons)
  if (magnitude >= 1_000_000) return `${(newtons / 1_000_000).toFixed(2)} MN`
  if (magnitude >= 1_000) return `${(newtons / 1_000).toFixed(1)} kN`
  return `${newtons.toFixed(0)} N`
}

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

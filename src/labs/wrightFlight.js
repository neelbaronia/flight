import { clamp, GRAVITY } from '../physics.js'

export const FLYER_MASS = 340
export const FLYER_AREA = 47.4
export const MAX_FLYER_ALTITUDE = 304.8
export const FLYER_WEIGHT = FLYER_MASS * GRAVITY

const AIR_DENSITY = 1.225
const MAX_THRUST = 760
const STALL_ANGLE = 16 * Math.PI / 180
const MAX_PITCH = 18 * Math.PI / 180
const MIN_PITCH = -12 * Math.PI / 180
const MAX_BANK = 22 * Math.PI / 180
const TRIM_PITCH = 4 * Math.PI / 180

const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle))

export function createFlyerState({ airborne = false } = {}) {
  return {
    speed: airborne ? 13.2 : 8.5,
    altitude: airborne ? 18 : 0,
    heading: 0,
    pitch: TRIM_PITCH,
    bank: 0,
    flightPathAngle: 0,
    pitchRate: 0,
    rollRate: 0,
    turnRate: 0,
    positionX: 0,
    positionZ: airborne ? -60 : 0,
    elevator: 0,
    warp: 0,
    rudder: 0,
    angleOfAttack: TRIM_PITCH,
    lift: 0,
    drag: 0,
    thrust: 0,
    liftCoefficient: 0.38 + 4.6 * TRIM_PITCH,
    dynamicPressure: 0,
    verticalSpeed: 0,
    netVerticalForce: -FLYER_WEIGHT,
    stall: false,
    grounded: !airborne,
  }
}

function aerodynamicForces(speed, angleOfAttack, throttle) {
  const dynamicPressure = 0.5 * AIR_DENSITY * speed ** 2
  const absoluteAlpha = Math.abs(angleOfAttack)
  const stallDepth = clamp((absoluteAlpha - STALL_ANGLE) / (18 * Math.PI / 180), 0, 1)
  const linearLift = 0.38 + 4.6 * angleOfAttack
  const liftCoefficient = linearLift * (1 - stallDepth * 0.68)
  const dragCoefficient = 0.065 + 0.075 * liftCoefficient ** 2 + 0.52 * stallDepth ** 2
  const propellerEfficiency = clamp(1 - speed / 70, 0.64, 1)

  return {
    lift: dynamicPressure * FLYER_AREA * liftCoefficient,
    drag: dynamicPressure * FLYER_AREA * dragCoefficient,
    thrust: MAX_THRUST * clamp(throttle, 0, 1) * propellerEfficiency,
    liftCoefficient,
    dynamicPressure,
    stall: stallDepth > 0,
  }
}

export function stepFlyer(previous, input, delta) {
  const state = { ...previous }
  const dt = clamp(delta, 0, 1 / 30)
  const pitchInput = clamp(input.pitch || 0, -1, 1)
  const rollInput = clamp(input.roll || 0, -1, 1)
  const controlAuthority = clamp((state.speed - 2) / 9, 0.12, 1)

  state.elevator += (pitchInput * 12 - state.elevator) * (1 - Math.exp(-8 * dt))
  state.warp += (rollInput * 10 - state.warp) * (1 - Math.exp(-9 * dt))
  state.rudder += (rollInput * 11 - state.rudder) * (1 - Math.exp(-7 * dt))

  const pitchTarget = clamp(TRIM_PITCH + pitchInput * 8 * Math.PI / 180, MIN_PITCH, MAX_PITCH)
  const pitchAcceleration = (pitchTarget - state.pitch) * 5.2 * controlAuthority - state.pitchRate * 3.4
  state.pitchRate += pitchAcceleration * dt
  state.pitch = clamp(state.pitch + state.pitchRate * dt, MIN_PITCH, MAX_PITCH)

  const bankTarget = rollInput * MAX_BANK
  const rollAcceleration = (bankTarget - state.bank) * 6.4 * controlAuthority - state.rollRate * 3.8
  state.rollRate += rollAcceleration * dt
  state.bank = clamp(state.bank + state.rollRate * dt, -MAX_BANK, MAX_BANK)

  state.angleOfAttack = clamp(state.pitch - state.flightPathAngle, -28 * Math.PI / 180, 32 * Math.PI / 180)
  const forces = aerodynamicForces(state.speed, state.angleOfAttack, input.throttle)
  state.lift = forces.lift
  state.drag = forces.drag
  state.thrust = forces.thrust
  state.liftCoefficient = forces.liftCoefficient
  state.dynamicPressure = forces.dynamicPressure
  state.stall = forces.stall

  const rollingResistance = state.grounded && state.speed > 0.2 ? 42 : 0
  const alongPathForce = state.thrust * Math.cos(state.angleOfAttack)
    - state.drag
    - FLYER_WEIGHT * Math.sin(state.flightPathAngle)
    - rollingResistance
  state.speed = clamp(state.speed + (alongPathForce / FLYER_MASS) * dt, 0, 31)

  const verticalLift = state.lift * Math.cos(state.bank)
  const normalForce = verticalLift
    + state.thrust * Math.sin(state.angleOfAttack)
    - FLYER_WEIGHT * Math.cos(state.flightPathAngle)
  state.netVerticalForce = verticalLift * Math.cos(state.flightPathAngle)
    + state.thrust * Math.sin(state.pitch)
    - state.drag * Math.sin(state.flightPathAngle)
    - FLYER_WEIGHT

  const canRotateFlightPath = state.speed > 2.5
  if (canRotateFlightPath && (!state.grounded || normalForce > 0)) {
    const flightPathRate = normalForce / (FLYER_MASS * Math.max(state.speed, 4))
    state.flightPathAngle = clamp(
      state.flightPathAngle + clamp(flightPathRate, -0.7, 0.55) * dt,
      -32 * Math.PI / 180,
      24 * Math.PI / 180,
    )
  } else if (state.grounded) {
    state.flightPathAngle = 0
  }

  if (!state.grounded && state.speed > 4) {
    const horizontalSpeed = Math.max(state.speed * Math.cos(state.flightPathAngle), 4)
    const bankTurn = (state.lift * Math.sin(state.bank)) / (FLYER_MASS * horizontalSpeed)
    const linkedRudderTurn = rollInput * controlAuthority * 0.025
    state.turnRate = clamp(bankTurn + linkedRudderTurn, -0.22, 0.22)
    state.heading = wrapAngle(state.heading + state.turnRate * dt)
  } else {
    state.turnRate = 0
  }

  const horizontalSpeed = state.speed * Math.cos(state.flightPathAngle)
  state.verticalSpeed = state.speed * Math.sin(state.flightPathAngle)
  state.positionX += Math.sin(state.heading) * horizontalSpeed * dt
  state.positionZ -= Math.cos(state.heading) * horizontalSpeed * dt
  state.altitude += state.verticalSpeed * dt

  if (state.altitude <= 0) {
    state.altitude = 0
    const touchingDown = state.verticalSpeed <= 0
    state.grounded = touchingDown || normalForce <= 0 || state.speed < 2.5
    if (state.grounded) {
      state.flightPathAngle = 0
      state.verticalSpeed = 0
      state.bank *= Math.exp(-7 * dt)
      state.rollRate *= Math.exp(-7 * dt)
    }
  } else {
    state.grounded = false
  }

  if (state.altitude >= MAX_FLYER_ALTITUDE) {
    state.altitude = MAX_FLYER_ALTITUDE
    state.flightPathAngle = Math.min(state.flightPathAngle, 0)
    state.verticalSpeed = Math.min(state.verticalSpeed, 0)
  }

  return state
}

export function flyerTelemetry(state) {
  return {
    ...state,
    pitchDegrees: state.pitch * 180 / Math.PI,
    bankDegrees: state.bank * 180 / Math.PI,
    headingDegrees: (state.heading * 180 / Math.PI + 360) % 360,
    flightPathDegrees: state.flightPathAngle * 180 / Math.PI,
    angleOfAttackDegrees: state.angleOfAttack * 180 / Math.PI,
  }
}

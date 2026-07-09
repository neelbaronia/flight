import { useCallback, useEffect, useRef, useState } from 'react'

export function getLocalTimeOfDay(date = new Date()) {
  const hour = date.getHours()
  if (hour >= 7 && hour < 17) return 'day'
  if (hour >= 17 && hour < 21) return 'evening'
  return 'night'
}

export function useTimeOfDay() {
  const [value, setValue] = useState(getLocalTimeOfDay)
  const manuallySelected = useRef(false)

  useEffect(() => {
    const syncToClock = () => {
      if (!manuallySelected.current) setValue(getLocalTimeOfDay())
    }
    const interval = window.setInterval(syncToClock, 60_000)
    window.addEventListener('focus', syncToClock)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', syncToClock)
    }
  }, [])

  const select = useCallback((nextValue) => {
    manuallySelected.current = true
    setValue(nextValue)
  }, [])

  return [value, select]
}

import { useCallback, useEffect, useRef } from 'react'

const ARROW_KEYS = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
}

const createKeyState = () => ({ left: false, right: false, up: false, down: false })
const INTERACTIVE_SELECTOR = 'input, button, select, textarea, [contenteditable="true"]'

export function useArrowOrbit({ autoFocus = false } = {}) {
  const rootRef = useRef()
  const keysRef = useRef(createKeyState())

  const clearKeys = useCallback(() => {
    keysRef.current = createKeyState()
  }, [])

  const onKeyDown = useCallback((event) => {
    if (event.target.closest?.(INTERACTIVE_SELECTOR)) return
    const key = ARROW_KEYS[event.code]
    if (!key) return
    keysRef.current[key] = true
    event.preventDefault()
  }, [])

  const onBlur = useCallback((event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) clearKeys()
  }, [clearKeys])

  const onPointerDown = useCallback((event) => {
    if (event.target.closest?.(INTERACTIVE_SELECTOR)) return
    rootRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    const handleKeyUp = (event) => {
      const key = ARROW_KEYS[event.code]
      if (key) keysRef.current[key] = false
    }
    const handleVisibility = () => {
      if (document.hidden) clearKeys()
    }
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', clearKeys)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', clearKeys)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [clearKeys])

  useEffect(() => {
    if (!autoFocus) return undefined
    const frame = requestAnimationFrame(() => rootRef.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [autoFocus])

  return { rootRef, keysRef, onKeyDown, onBlur, onPointerDown }
}

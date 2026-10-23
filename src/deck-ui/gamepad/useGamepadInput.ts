import { useEffect, useRef } from 'react'
import { GamepadAction, GamepadButtonStates } from './types'

const STICK_DEADZONE = 0.4
const INITIAL_REPEAT_MS = 220
const REPEAT_INTERVAL_MS = 90
const Y_HOLD_THRESHOLD_MS = 180

interface UseGamepadInputOptions {
  enabled: boolean
  onAction: (action: GamepadAction) => void
  onYHoldStart?: () => void
  onYHoldEnd?: () => void
  onGamepadActivity?: () => void
}

const defaultButtonStates: GamepadButtonStates = {
  up: false,
  down: false,
  left: false,
  right: false,
  confirm: false,
  cancel: false,
  summary: false,
  select: false,
  prevBox: false,
  nextBox: false,
  prevPane: false,
  nextPane: false,
  saveChanges: false,
  openSave: false,
  toggleZoom: false,
  quickMenu: false,
}

export function useGamepadInput(options: UseGamepadInputOptions) {
  const { enabled, onAction, onYHoldStart, onYHoldEnd, onGamepadActivity } = options

  const callbacksRef = useRef({ onAction, onYHoldStart, onYHoldEnd, onGamepadActivity })
  useEffect(() => {
    callbacksRef.current = { onAction, onYHoldStart, onYHoldEnd, onGamepadActivity }
  }, [onAction, onYHoldStart, onYHoldEnd, onGamepadActivity])

  const prevButtonsRef = useRef<GamepadButtonStates>({ ...defaultButtonStates })
  const repeatTimersRef = useRef<Record<string, number>>({})
  const yPressTimestampRef = useRef<number | null>(null)
  const isYHoldingRef = useRef(false)

  // RAF Gamepad Polling
  useEffect(() => {
    if (!enabled) return

    let animationFrameId: number

    const pollGamepad = (timestamp: number) => {
      const gamepads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : []
      let activeGamepad: Gamepad | null = null

      for (let i = 0; i < gamepads.length; i++) {
        const gp = gamepads[i]
        if (gp && gp.connected) {
          activeGamepad = gp
          break
        }
      }

      if (activeGamepad) {
        const btns = activeGamepad.buttons
        const axes = activeGamepad.axes

        const rawAxisX = axes[0] ?? 0
        const rawAxisY = axes[1] ?? 0

        const isStickUp = rawAxisY < -STICK_DEADZONE
        const isStickDown = rawAxisY > STICK_DEADZONE
        const isStickLeft = rawAxisX < -STICK_DEADZONE
        const isStickRight = rawAxisX > STICK_DEADZONE

        const currentStates: GamepadButtonStates = {
          up: Boolean(btns[12]?.pressed || isStickUp),
          down: Boolean(btns[13]?.pressed || isStickDown),
          left: Boolean(btns[14]?.pressed || isStickLeft),
          right: Boolean(btns[15]?.pressed || isStickRight),
          confirm: Boolean(btns[0]?.pressed), // A
          cancel: Boolean(btns[1]?.pressed), // B
          select: Boolean(btns[2]?.pressed), // Y (flipped on Linux/Deck controller mapping)
          summary: Boolean(btns[3]?.pressed), // X (flipped on Linux/Deck controller mapping)
          prevBox: Boolean(btns[4]?.pressed), // LB
          nextBox: Boolean(btns[5]?.pressed), // RB
          prevPane: Boolean(btns[6]?.pressed || (btns[6]?.value ?? 0) > 0.5), // LT
          nextPane: Boolean(btns[7]?.pressed || (btns[7]?.value ?? 0) > 0.5), // RT
          openSave: Boolean(btns[8]?.pressed), // Select / Back / View
          saveChanges: Boolean(btns[9]?.pressed), // Start / Menu
          quickMenu: Boolean(btns[10]?.pressed), // L3
          toggleZoom: Boolean(btns[11]?.pressed), // R3
        }

        const prev = prevButtonsRef.current

        // Check if any button or axis is active
        const hasActivity = Object.values(currentStates).some(Boolean)
        if (hasActivity) {
          callbacksRef.current.onGamepadActivity?.()
        }

        // Handle Y Hold tracking (for Lasso)
        if (currentStates.select && !prev.select) {
          yPressTimestampRef.current = timestamp
          isYHoldingRef.current = false
        } else if (currentStates.select && yPressTimestampRef.current !== null) {
          if (
            !isYHoldingRef.current &&
            timestamp - yPressTimestampRef.current >= Y_HOLD_THRESHOLD_MS
          ) {
            isYHoldingRef.current = true
            callbacksRef.current.onYHoldStart?.()
          }
        } else if (!currentStates.select && prev.select) {
          if (isYHoldingRef.current) {
            callbacksRef.current.onYHoldEnd?.()
          } else {
            // Short tap: trigger normal select action
            callbacksRef.current.onAction('select')
          }
          yPressTimestampRef.current = null
          isYHoldingRef.current = false
        }

        // Directional actions with repeat timing
        const directionalActions: { key: keyof GamepadButtonStates; action: GamepadAction }[] = [
          { key: 'up', action: 'up' },
          { key: 'down', action: 'down' },
          { key: 'left', action: 'left' },
          { key: 'right', action: 'right' },
        ]

        for (const { key, action } of directionalActions) {
          const isPressed = currentStates[key]
          const wasPressed = prev[key]

          if (isPressed && !wasPressed) {
            // Initial press
            callbacksRef.current.onAction(action)
            repeatTimersRef.current[key] = timestamp + INITIAL_REPEAT_MS
          } else if (isPressed && wasPressed) {
            // Sustained press
            const nextFire = repeatTimersRef.current[key] ?? 0
            if (timestamp >= nextFire) {
              callbacksRef.current.onAction(action)
              repeatTimersRef.current[key] = timestamp + REPEAT_INTERVAL_MS
            }
          } else if (!isPressed && wasPressed) {
            delete repeatTimersRef.current[key]
          }
        }

        // Edge-triggered discrete actions (excluding 'select' which is handled above)
        const discreteActions: { key: keyof GamepadButtonStates; action: GamepadAction }[] = [
          { key: 'confirm', action: 'confirm' },
          { key: 'cancel', action: 'cancel' },
          { key: 'summary', action: 'summary' },
          { key: 'prevBox', action: 'prevBox' },
          { key: 'nextBox', action: 'nextBox' },
          { key: 'prevPane', action: 'prevPane' },
          { key: 'nextPane', action: 'nextPane' },
          { key: 'openSave', action: 'openSave' },
          { key: 'saveChanges', action: 'saveChanges' },
          { key: 'toggleZoom', action: 'toggleZoom' },
          { key: 'quickMenu', action: 'quickMenu' },
        ]

        for (const { key, action } of discreteActions) {
          if (currentStates[key] && !prev[key]) {
            callbacksRef.current.onAction(action)
          }
        }

        prevButtonsRef.current = currentStates
      }

      animationFrameId = requestAnimationFrame(pollGamepad)
    }

    animationFrameId = requestAnimationFrame(pollGamepad)
    return () => cancelAnimationFrame(animationFrameId)
  }, [enabled])

  // SteamInput Keyboard Fallback Handler
  useEffect(() => {
    if (!enabled) return

    const isEditableElement = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false
      return (
        el.matches(':read-write, select, input[type="range"], [role="slider"]') ||
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.isContentEditable
      )
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = (e.composedPath?.()[0] as EventTarget | null) ?? e.target
      if (isEditableElement(target)) return

      callbacksRef.current.onGamepadActivity?.()

      // System shortcuts
      if ((e.ctrlKey && e.key.toLowerCase() === 's') || e.key === 'F5') {
        e.preventDefault()
        callbacksRef.current.onAction('saveChanges')
        return
      }
      if ((e.ctrlKey && e.key.toLowerCase() === 'o') || e.key === 'F2') {
        e.preventDefault()
        callbacksRef.current.onAction('openSave')
        return
      }

      // Ignore if modifier key other than shift is held
      if (e.altKey || e.metaKey || (e.ctrlKey && e.key !== 'Control')) return

      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
          e.preventDefault()
          callbacksRef.current.onAction('up')
          break
        case 'ArrowDown':
        case 'KeyS':
          e.preventDefault()
          callbacksRef.current.onAction('down')
          break
        case 'ArrowLeft':
        case 'KeyA':
          e.preventDefault()
          callbacksRef.current.onAction('left')
          break
        case 'ArrowRight':
        case 'KeyD':
          e.preventDefault()
          callbacksRef.current.onAction('right')
          break
        case 'Enter':
        case 'Space':
          e.preventDefault()
          callbacksRef.current.onAction('confirm')
          break
        case 'Escape':
        case 'Backspace':
          e.preventDefault()
          callbacksRef.current.onAction('cancel')
          break
        case 'KeyX':
        case 'KeyI':
          e.preventDefault()
          callbacksRef.current.onAction('summary')
          break
        case 'KeyY':
        case 'ShiftLeft':
        case 'ShiftRight':
          if (!isYHoldingRef.current) {
            isYHoldingRef.current = true
            yPressTimestampRef.current = performance.now()
            callbacksRef.current.onYHoldStart?.()
          }
          break
        case 'KeyQ':
        case 'BracketLeft':
        case 'PageUp':
          e.preventDefault()
          callbacksRef.current.onAction('prevBox')
          break
        case 'KeyE':
        case 'BracketRight':
        case 'PageDown':
          e.preventDefault()
          callbacksRef.current.onAction('nextBox')
          break
        case 'Tab':
        case 'Digit1':
          e.preventDefault()
          callbacksRef.current.onAction('prevPane')
          break
        case 'Digit2':
          e.preventDefault()
          callbacksRef.current.onAction('nextPane')
          break
        case 'KeyZ':
          e.preventDefault()
          callbacksRef.current.onAction('toggleZoom')
          break
        case 'KeyM':
        case 'F1':
          e.preventDefault()
          callbacksRef.current.onAction('quickMenu')
          break
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const target = (e.composedPath?.()[0] as EventTarget | null) ?? e.target
      if (isEditableElement(target)) return

      if (e.code === 'KeyY' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        const pressDuration =
          yPressTimestampRef.current !== null ? performance.now() - yPressTimestampRef.current : 0

        if (isYHoldingRef.current) {
          callbacksRef.current.onYHoldEnd?.()
        }

        // If it was just a quick tap, trigger single select toggle
        if (pressDuration < Y_HOLD_THRESHOLD_MS) {
          callbacksRef.current.onAction('select')
        }

        isYHoldingRef.current = false
        yPressTimestampRef.current = null
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [enabled])
}

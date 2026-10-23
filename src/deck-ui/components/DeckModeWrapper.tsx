import { ReactNode } from 'react'
import { useLocation } from 'react-router'
import '../deck-ui.css'
import { GamepadNavigationProvider, useGamepadNavigation } from '../state/GamepadNavigationContext'
import ControllerHudBar from './ControllerHudBar'
import DeckHomeView from './DeckHomeView'

interface DeckModeWrapperProps {
  children: ReactNode
}

export default function DeckModeWrapper({ children }: DeckModeWrapperProps) {
  return (
    <GamepadNavigationProvider>
      <DeckModeWrapperInner>{children}</DeckModeWrapperInner>
    </GamepadNavigationProvider>
  )
}

function DeckModeWrapperInner({ children }: { children: ReactNode }) {
  const { deckModeEnabled, toggleDeckMode } = useGamepadNavigation()
  const location = useLocation()
  const isHomeRoute = location.pathname === '/' || location.pathname === '/home'

  if (deckModeEnabled && isHomeRoute) {
    return (
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
        <DeckHomeView />
        <ControllerHudBar />
      </div>
    )
  }

  return (
    <>
      {children}
      {isHomeRoute && (
        <button
          className="deck-floating-toggle"
          onClick={toggleDeckMode}
          title="Switch to SteamOS Controller / 1280x800 Deck Mode"
        >
          🎮 Deck Mode
        </button>
      )}
    </>
  )
}

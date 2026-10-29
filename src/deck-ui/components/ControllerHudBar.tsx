import { useGamepadNavigation } from '../state/GamepadNavigationContext'

export default function ControllerHudBar() {
  const { heldPayload, activePane, bankZoomed, activeCursor, quickMenuOpen, activeModalKind } =
    useGamepadNavigation()

  const isHeaderFocused = activeCursor.row === -1

  if (activeModalKind === 'saves') {
    return (
      <div className="deck-hud-bar">
        <div className="deck-hud-item">
          <span className="deck-glyph deck-glyph-pill">LB / RB</span>
          <span>Switch Tab (Recents / Suggested / Folders)</span>
        </div>
        <div className="deck-hud-item">
          <span className="deck-glyph deck-glyph-pill">D-Pad</span>
          <span>Navigate Saves</span>
        </div>
        <div className="deck-hud-item">
          <span className="deck-glyph deck-glyph-a">A</span>
          <span>Open Save</span>
        </div>
        <div className="deck-hud-item">
          <span className="deck-glyph deck-glyph-b">B</span>
          <span>Close</span>
        </div>
      </div>
    )
  }

  if (activeModalKind === 'popup') {
    return (
      <div className="deck-hud-bar">
        <div className="deck-hud-item">
          <span className="deck-glyph deck-glyph-pill">D-Pad</span>
          <span>Select Option</span>
        </div>
        <div className="deck-hud-item">
          <span className="deck-glyph deck-glyph-a">A</span>
          <span>Confirm / OK</span>
        </div>
        <div className="deck-hud-item">
          <span className="deck-glyph deck-glyph-b">B</span>
          <span>Cancel / Dismiss</span>
        </div>
      </div>
    )
  }

  if (activeModalKind === 'details') {
    return (
      <div className="deck-hud-bar">
        <div className="deck-hud-item">
          <span className="deck-glyph deck-glyph-pill">LB / RB</span>
          <span>Switch Page / Tab</span>
        </div>
        <div className="deck-hud-item">
          <span className="deck-glyph deck-glyph-b">B / X</span>
          <span>Close Details</span>
        </div>
      </div>
    )
  }

  return (
    <div className="deck-hud-bar">
      <div className="deck-hud-item">
        <span className="deck-glyph deck-glyph-pill">LT / RT</span>
        <span>Switch Pane</span>
      </div>

      <div className="deck-hud-item">
        <span className="deck-glyph deck-glyph-pill">LB / RB</span>
        <span>Change Box</span>
      </div>

      <div className="deck-hud-item">
        <span className="deck-glyph deck-glyph-a">A</span>
        <span>
          {quickMenuOpen || isHeaderFocused
            ? 'Run Action'
            : heldPayload
              ? 'Place Pokémon'
              : 'Pick Up'}
        </span>
      </div>

      <div className="deck-hud-item">
        <span className="deck-glyph deck-glyph-b">B</span>
        <span>
          {quickMenuOpen
            ? 'Close Menu'
            : isHeaderFocused
              ? 'Back to Grid'
              : heldPayload
                ? 'Drop / Cancel'
                : 'Deselect'}
        </span>
      </div>

      <div className="deck-hud-item">
        <span className="deck-glyph deck-glyph-x">X</span>
        <span>Summary</span>
      </div>

      <div className="deck-hud-item">
        <span className="deck-glyph deck-glyph-y">Y</span>
        <span>Select / Lasso</span>
      </div>

      <div className="deck-hud-item">
        <span className="deck-glyph deck-glyph-pill">L3 / ↑</span>
        <span>Living Dex & Transfer</span>
      </div>

      {activePane === 'bank' && (
        <div className="deck-hud-item">
          <span className="deck-glyph deck-glyph-pill">R3 / Z</span>
          <span>{bankZoomed ? 'Zoom Out' : 'Zoom 6×5'}</span>
        </div>
      )}

      <div className="deck-hud-item">
        <span className="deck-glyph deck-glyph-pill">Select</span>
        <span>Open Save</span>
      </div>

      <div className="deck-hud-item">
        <span className="deck-glyph deck-glyph-pill">Start</span>
        <span>Save All</span>
      </div>
    </div>
  )
}

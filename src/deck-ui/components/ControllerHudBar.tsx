import { useGamepadNavigation } from '../state/GamepadNavigationContext'

export default function ControllerHudBar() {
  const { heldPayload, activePane, bankZoomed } = useGamepadNavigation()

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
        <span>{heldPayload ? 'Place Pokémon' : 'Pick Up'}</span>
      </div>

      <div className="deck-hud-item">
        <span className="deck-glyph deck-glyph-b">B</span>
        <span>{heldPayload ? 'Drop / Cancel' : 'Deselect'}</span>
      </div>

      <div className="deck-hud-item">
        <span className="deck-glyph deck-glyph-x">X</span>
        <span>Summary</span>
      </div>

      <div className="deck-hud-item">
        <span className="deck-glyph deck-glyph-y">Y</span>
        <span>Select / Lasso</span>
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

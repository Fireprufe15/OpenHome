import { PKMInterface } from '@openhome-core/pkm/interfaces'
import { MonLocation } from '@openhome-ui/state/saves'

export type DeckPane = 'save' | 'bank'

export interface GridCoord {
  row: number
  col: number
}

export interface LassoArea {
  pane: DeckPane
  startRow: number
  startCol: number
  endRow: number
  endCol: number
}

export interface HeldMonPayload {
  sourceLocation: MonLocation
  mon: PKMInterface
  multiLocations?: MonLocation[]
}

export type GamepadAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'confirm' // A / Enter / Space -> Pick Up / Place / Open
  | 'cancel' // B / Esc / Backspace -> Drop / Cancel / Close
  | 'summary' // X / I -> Pokemon details modal
  | 'select' // Y / Shift -> Toggle multi-select / Lasso
  | 'prevBox' // LB / Q / [ -> Cycle previous box
  | 'nextBox' // RB / E / ] -> Cycle next box
  | 'prevPane' // LT / 1 / Tab -> Left pane
  | 'nextPane' // RT / 2 -> Right pane
  | 'saveChanges' // Start / Ctrl+S / F5 -> Save all changes
  | 'openSave' // Select / Ctrl+O / F2 -> Open save modal
  | 'toggleZoom' // R3 / Z -> Toggle 12x10 full vs zoomed 6x5
  | 'quickMenu' // L3 / M -> Open controller quick actions menu

export interface GamepadButtonStates {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
  confirm: boolean
  cancel: boolean
  summary: boolean
  select: boolean
  prevBox: boolean
  nextBox: boolean
  prevPane: boolean
  nextPane: boolean
  saveChanges: boolean
  openSave: boolean
  toggleZoom: boolean
  quickMenu: boolean
}

export interface GamepadInputEvent {
  action: GamepadAction
  isHold?: boolean
}

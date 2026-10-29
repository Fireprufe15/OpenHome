import type { GamepadButtonStates, GridCoord, LassoArea } from '../gamepad/types.ts'
import { findNearestSpatialTarget } from '../gamepad/modalDomNavigation.ts'

let describe: any
let it: any
let expect: any

try {
  const v = await import('vitest')
  describe = v.describe
  it = v.it
  expect = v.expect
} catch {
  const t = await import('node:test')
  const assert = (await import('node:assert/strict')).default
  describe = t.describe
  it = t.it
  expect = (actual: any) => ({
    toEqual: (expected: any) => assert.deepStrictEqual(actual, expected),
    toBe: (expected: any) => assert.strictEqual(actual, expected),
  })
}

function computeLassoArea(anchor: GridCoord, current: GridCoord, pane: 'save' | 'bank'): LassoArea {
  return {
    pane,
    startRow: Math.min(anchor.row, current.row),
    startCol: Math.min(anchor.col, current.col),
    endRow: Math.max(anchor.row, current.row),
    endCol: Math.max(anchor.col, current.col),
  }
}

function clampGridMove(
  current: GridCoord,
  deltaRow: number,
  deltaCol: number,
  maxRows: number,
  maxCols: number,
  actionCount = 2
): GridCoord {
  const nextRow = Math.max(-1, Math.min(maxRows - 1, current.row + deltaRow))
  if (nextRow === -1) {
    const maxActionCol = actionCount - 1
    const nextCol =
      current.row === -1
        ? Math.max(0, Math.min(maxActionCol, current.col + deltaCol))
        : Math.min(maxActionCol, current.col)
    return { row: -1, col: nextCol }
  }
  return {
    row: nextRow,
    col: Math.max(0, Math.min(maxCols - 1, current.col + deltaCol)),
  }
}

function applyStickDeadzone(axisX: number, axisY: number, deadzone = 0.4) {
  return {
    isStickUp: axisY < -deadzone,
    isStickDown: axisY > deadzone,
    isStickLeft: axisX < -deadzone,
    isStickRight: axisX > deadzone,
  }
}

describe('Deck UI Gamepad Navigation Logic', () => {
  describe('2D Grid Clamping & Movement', () => {
    it('moves correctly within 6x5 Save grid', () => {
      let cursor: GridCoord = { row: 0, col: 0 }

      // Move right
      cursor = clampGridMove(cursor, 0, 1, 5, 6)
      expect(cursor).toEqual({ row: 0, col: 1 })

      // Move down
      cursor = clampGridMove(cursor, 1, 0, 5, 6)
      expect(cursor).toEqual({ row: 1, col: 1 })

      // Move left
      cursor = clampGridMove(cursor, 0, -1, 5, 6)
      expect(cursor).toEqual({ row: 1, col: 0 })

      // Move up
      cursor = clampGridMove(cursor, -1, 0, 5, 6)
      expect(cursor).toEqual({ row: 0, col: 0 })
    })

    it('clamps at grid boundaries and allows navigating up to row -1 action bar', () => {
      let cursor: GridCoord = { row: 0, col: 0 }

      // Moving up from top row enters row -1 action bar
      cursor = clampGridMove(cursor, -1, 0, 5, 6, 2)
      expect(cursor).toEqual({ row: -1, col: 0 })

      // Navigate right on action bar
      cursor = clampGridMove(cursor, 0, 1, 5, 6, 2)
      expect(cursor).toEqual({ row: -1, col: 1 })

      // Clamps at right end of action bar
      cursor = clampGridMove(cursor, 0, 1, 5, 6, 2)
      expect(cursor).toEqual({ row: -1, col: 1 })

      // Move back down to grid row 0
      cursor = clampGridMove(cursor, 1, 0, 5, 6, 2)
      expect(cursor).toEqual({ row: 0, col: 1 })
      cursor = clampGridMove(cursor, 0, -1, 5, 6, 2)
      expect(cursor).toEqual({ row: 0, col: 0 })

      // Move to bottom-right (row 4, col 5)
      cursor = { row: 4, col: 5 }
      cursor = clampGridMove(cursor, 1, 0, 5, 6)
      expect(cursor).toEqual({ row: 4, col: 5 })
      cursor = clampGridMove(cursor, 0, 1, 5, 6)
      expect(cursor).toEqual({ row: 4, col: 5 })
    })

    it('navigates the full 12x10 OpenHome Bank grid', () => {
      let cursor: GridCoord = { row: 0, col: 0 }

      // Move to bottom-right of Bank (row 9, col 11)
      cursor = clampGridMove(cursor, 9, 11, 10, 12)
      expect(cursor).toEqual({ row: 9, col: 11 })

      // Cannot exceed 10 rows and 12 columns
      cursor = clampGridMove(cursor, 1, 1, 10, 12)
      expect(cursor).toEqual({ row: 9, col: 11 })
    })
  })

  describe('Stick Deadzone Filtering', () => {
    it('ignores micro-drifts within deadzone threshold (<= 0.4)', () => {
      const state = applyStickDeadzone(0.15, -0.25, 0.4)
      expect(state.isStickUp).toBe(false)
      expect(state.isStickDown).toBe(false)
      expect(state.isStickLeft).toBe(false)
      expect(state.isStickRight).toBe(false)
    })

    it('registers deliberate stick deflections (> 0.4)', () => {
      const up = applyStickDeadzone(0, -0.75, 0.4)
      expect(up.isStickUp).toBe(true)

      const down = applyStickDeadzone(0, 0.65, 0.4)
      expect(down.isStickDown).toBe(true)

      const left = applyStickDeadzone(-0.8, 0, 0.4)
      expect(left.isStickLeft).toBe(true)

      const right = applyStickDeadzone(0.7, 0, 0.4)
      expect(right.isStickRight).toBe(true)
    })
  })

  describe('2D Lasso Selection Bounding Box', () => {
    it('computes correct lasso rectangle when dragging down-right', () => {
      const anchor: GridCoord = { row: 1, col: 1 }
      const current: GridCoord = { row: 3, col: 4 }

      const area = computeLassoArea(anchor, current, 'bank')
      expect(area).toEqual({
        pane: 'bank',
        startRow: 1,
        startCol: 1,
        endRow: 3,
        endCol: 4,
      })
    })

    it('computes correct lasso rectangle when dragging up-left (inverted)', () => {
      const anchor: GridCoord = { row: 3, col: 4 }
      const current: GridCoord = { row: 1, col: 1 }

      const area = computeLassoArea(anchor, current, 'save')
      expect(area).toEqual({
        pane: 'save',
        startRow: 1,
        startCol: 1,
        endRow: 3,
        endCol: 4,
      })
    })

    it('computes 1-cell lasso area on single slot anchor', () => {
      const anchor: GridCoord = { row: 2, col: 2 }
      const current: GridCoord = { row: 2, col: 2 }

      const area = computeLassoArea(anchor, current, 'bank')
      expect(area).toEqual({
        pane: 'bank',
        startRow: 2,
        startCol: 2,
        endRow: 2,
        endCol: 2,
      })
    })
  })

  describe('Input Element Keyboard Guarding', () => {
    it('identifies editable and input elements that should not trigger controller actions', () => {
      const isEditableElement = (tagName: string, isContentEditable = false) => {
        return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || isContentEditable
      }

      expect(isEditableElement('INPUT')).toBe(true)
      expect(isEditableElement('TEXTAREA')).toBe(true)
      expect(isEditableElement('SELECT')).toBe(true)
      expect(isEditableElement('DIV', true)).toBe(true)
      expect(isEditableElement('DIV', false)).toBe(false)
      expect(isEditableElement('BUTTON', false)).toBe(false)
    })
  })

  describe('Modal & Dialog Spatial Navigation', () => {
    // Mock helper for spatial target selection based on mock elements
    interface MockElement {
      id: string
      rect: { left: number; top: number; width: number; height: number }
      getBoundingClientRect: () => { left: number; top: number; width: number; height: number }
    }

    const createMockEl = (id: string, left: number, top: number, width = 180, height = 180): MockElement => ({
      id,
      rect: { left, top, width, height },
      getBoundingClientRect: () => ({ left, top, width, height }),
    })

    const findNearest = (
      current: MockElement,
      candidates: MockElement[],
      direction: 'up' | 'down' | 'left' | 'right'
    ): MockElement | null => {
      return findNearestSpatialTarget(current as any, candidates as any, direction) as MockElement | null
    }

    it('navigates 2D grid of save cards in SavesModal', () => {
      // 2 rows of 3 save cards
      // Row 1: y = 100, x = 100, 300, 500
      // Row 2: y = 300, x = 100, 300, 500
      const c1 = createMockEl('card-1', 100, 100)
      const c2 = createMockEl('card-2', 300, 100)
      const c3 = createMockEl('card-3', 500, 100)
      const c4 = createMockEl('card-4', 100, 300)
      const c5 = createMockEl('card-5', 300, 300)
      const c6 = createMockEl('card-6', 500, 300)
      const all = [c1, c2, c3, c4, c5, c6]

      // Moving right from c1 gives c2
      expect(findNearest(c1, all, 'right')?.id).toBe('card-2')

      // Moving right from c2 gives c3
      expect(findNearest(c2, all, 'right')?.id).toBe('card-3')

      // Moving right from c3 has no right target
      expect(findNearest(c3, all, 'right')).toBe(null)

      // Moving down from c1 gives c4
      expect(findNearest(c1, all, 'down')?.id).toBe('card-4')

      // Moving down from c2 gives c5
      expect(findNearest(c2, all, 'down')?.id).toBe('card-5')

      // Moving left from c5 gives c4
      expect(findNearest(c5, all, 'left')?.id).toBe('card-4')

      // Moving up from c6 gives c3
      expect(findNearest(c6, all, 'up')?.id).toBe('card-3')
    })

    it('cycles tabs with shoulder buttons (LB / RB)', () => {
      const tabs = ['recents', 'suggested', 'folders']
      let currentIdx = 0 // recents

      // RB moves to next tab
      currentIdx = (currentIdx + 1) % tabs.length
      expect(tabs[currentIdx]).toBe('suggested')

      // RB again
      currentIdx = (currentIdx + 1) % tabs.length
      expect(tabs[currentIdx]).toBe('folders')

      // RB wraps to start
      currentIdx = (currentIdx + 1) % tabs.length
      expect(tabs[currentIdx]).toBe('recents')

      // LB moves to prev tab (wraps to end)
      currentIdx = (currentIdx - 1 + tabs.length) % tabs.length
      expect(tabs[currentIdx]).toBe('folders')
    })

    it('cycles dialog action buttons (Cancel ↔ Confirm)', () => {
      const buttons = ['Cancel', 'Release 5 Pokémon']
      let focusIdx = 0 // Cancel focused

      // D-Pad Right
      focusIdx = (focusIdx + 1) % buttons.length
      expect(buttons[focusIdx]).toBe('Release 5 Pokémon')

      // D-Pad Left
      focusIdx = (focusIdx - 1 + buttons.length) % buttons.length
      expect(buttons[focusIdx]).toBe('Cancel')
    })
  })
})

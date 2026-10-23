import useBackend from '@openhome-core/backend/useBackend'
import { PKMInterface } from '@openhome-core/pkm/interfaces'
import { monSupportedBySave } from '@openhome-core/save/util'
import { R } from '@openhome-core/util/functional'
import useDisplayError from '@openhome-ui/hooks/displayError'
import {
  OPENHOME_BOX_COLUMNS,
  OPENHOME_BOX_ROWS,
  OPENHOME_BOX_SLOTS,
  useBanksAndBoxes,
} from '@openhome-ui/state-zustand/banks-and-boxes/store'
import { useDragStore } from '@openhome-ui/state-zustand/drag-and-drop/dragStore'
import useMultiSelect from '@openhome-ui/state/drag-and-drop/useMultiSelect'
import { HomeMonLocation, MonLocation, SaveMonLocation, useSaves } from '@openhome-ui/state/saves'
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { DeckPane, GridCoord, HeldMonPayload, LassoArea } from '../gamepad/types'
import { useGamepadInput } from '../gamepad/useGamepadInput'

interface GamepadNavigationContextType {
  deckModeEnabled: boolean
  setDeckModeEnabled: (enabled: boolean) => void
  toggleDeckMode: () => void

  activePane: DeckPane
  setActivePane: (pane: DeckPane) => void

  saveCursor: GridCoord
  bankCursor: GridCoord
  activeCursor: GridCoord

  activeSaveIndex: number
  setActiveSaveIndex: (index: number) => void

  bankZoomed: boolean
  toggleBankZoom: () => void

  heldPayload: HeldMonPayload | null
  lassoArea: LassoArea | null

  detailsModalMon: PKMInterface | null
  setDetailsModalMon: (mon: PKMInterface | null) => void

  saveModalOpen: boolean
  setSaveModalOpen: (open: boolean) => void

  activeLocation: MonLocation | null
}

const GamepadNavigationContext = createContext<GamepadNavigationContextType | null>(null)

export function useGamepadNavigation() {
  const ctx = useContext(GamepadNavigationContext)
  if (!ctx) {
    throw new Error('useGamepadNavigation must be used within GamepadNavigationProvider')
  }
  return ctx
}

export function GamepadNavigationProvider({ children }: { children: ReactNode }) {
  const backend = useBackend()
  const displayError = useDisplayError()
  const savesManager = useSaves()
  const { allOpenSaves, saveBoxNavigateLeft, saveBoxNavigateRight, moveMon, getMonAtLocation } =
    savesManager
  const banksAndBoxes = useBanksAndBoxes()
  const {
    getCurrentBank,
    getCurrentBox,
    switchToPreviousBox,
    switchToNextBox,
    homeLocationIsEmpty,
  } = banksAndBoxes
  const {
    multiSelectState,
    toggleSelection,
    clearSelections,
    setMultiSelectEnabled,
    isSelected,
  } = useMultiSelect()

  // Deck mode initial detection: SteamOS Gamescope is typically 1280x800
  const [deckModeEnabled, setDeckModeEnabledState] = useState(() => {
    if (typeof window === 'undefined') return false
    const saved = localStorage.getItem('openhome_deck_mode')
    if (saved !== null) return saved === 'true'
    return window.innerWidth <= 1280 && window.innerHeight <= 820
  })

  const setDeckModeEnabled = useCallback((enabled: boolean) => {
    setDeckModeEnabledState(enabled)
    try {
      localStorage.setItem('openhome_deck_mode', String(enabled))
    } catch {
      // ignore
    }
  }, [])

  const toggleDeckMode = useCallback(() => {
    setDeckModeEnabled(!deckModeEnabled)
  }, [deckModeEnabled, setDeckModeEnabled])

  // Active state
  const [activePane, setActivePane] = useState<DeckPane>('bank')
  const [activeSaveIndex, setActiveSaveIndex] = useState(0)
  const [saveCursor, setSaveCursor] = useState<GridCoord>({ row: 0, col: 0 })
  const [bankCursor, setBankCursor] = useState<GridCoord>({ row: 0, col: 0 })
  const [bankZoomed, setBankZoomed] = useState(false)
  const [heldPayload, setHeldPayload] = useState<HeldMonPayload | null>(null)
  const [lassoAnchor, setLassoAnchor] = useState<GridCoord | null>(null)
  const [detailsModalMon, setDetailsModalMon] = useState<PKMInterface | null>(null)
  const [saveModalOpen, setSaveModalOpen] = useState(false)

  const activeSave = allOpenSaves[activeSaveIndex] ?? allOpenSaves[0]
  const saveCols = activeSave ? activeSave.boxColumns : 6
  const saveRows = activeSave ? activeSave.boxRows : 5

  const bankCols = OPENHOME_BOX_COLUMNS // 12
  const bankRows = OPENHOME_BOX_ROWS // 10

  const activeCursor = activePane === 'save' ? saveCursor : bankCursor

  // Compute active MonLocation based on active pane and cursor
  const activeLocation = useMemo<MonLocation | null>(() => {
    if (activePane === 'save') {
      if (!activeSave) return null
      const boxSlot = saveCursor.row * saveCols + saveCursor.col
      const loc: SaveMonLocation = {
        isHome: false,
        saveIdentifier: activeSave.identifier,
        box: activeSave.currentPCBox,
        boxSlot,
      }
      return loc
    } else {
      const currentBank = getCurrentBank()
      const currentBox = getCurrentBox()
      const boxSlot = bankCursor.row * bankCols + bankCursor.col
      const loc: HomeMonLocation = {
        isHome: true,
        bank: currentBank.index,
        box: currentBox.index,
        boxSlot,
      }
      return loc
    }
  }, [activePane, activeSave, saveCursor, saveCols, getCurrentBank, getCurrentBox, bankCursor, bankCols])

  // Compute current lasso area if dragging with Y held
  const lassoArea = useMemo<LassoArea | null>(() => {
    if (!lassoAnchor) return null
    const current = activePane === 'save' ? saveCursor : bankCursor
    return {
      pane: activePane,
      startRow: Math.min(lassoAnchor.row, current.row),
      startCol: Math.min(lassoAnchor.col, current.col),
      endRow: Math.max(lassoAnchor.row, current.row),
      endCol: Math.max(lassoAnchor.col, current.col),
    }
  }, [lassoAnchor, activePane, saveCursor, bankCursor])

  // Pick up & Drop execution
  const handleConfirmAction = useCallback(async () => {
    if (!activeLocation) return

    // If nothing currently held, pick up mon(s)
    if (!heldPayload) {
      // Case A: Batch pick-up from multi-select
      if (multiSelectState.selectedLocations.length > 0) {
        const firstLoc = multiSelectState.selectedLocations[0]
        const firstMon = await getMonAtLocation(firstLoc)
        if (firstMon) {
          const payload: HeldMonPayload = {
            sourceLocation: firstLoc,
            mon: firstMon,
            multiLocations: [...multiSelectState.selectedLocations],
          }
          setHeldPayload(payload)
          useDragStore.setState({
            payload: {
              kind: 'multi-mon',
              monData: multiSelectState.selectedLocations.map((loc) => ({
                ...loc,
                mon: firstMon,
              })),
            },
          })
        }
        return
      }

      // Case B: Single mon pick-up
      const currentMon = await getMonAtLocation(activeLocation)
      if (currentMon) {
        const payload: HeldMonPayload = {
          sourceLocation: activeLocation,
          mon: currentMon,
        }
        setHeldPayload(payload)
        useDragStore.setState({
          payload: {
            kind: 'mon',
            monData: { ...activeLocation, mon: currentMon },
          },
        })
      }
      return
    }

    // Placing held mon(s) at activeLocation
    const dest = activeLocation
    const source = heldPayload.sourceLocation

    // If target save doesn't support the mon, block placement
    if (!dest.isHome) {
      const targetSave = savesManager.saveFromIdentifier(dest.saveIdentifier)
      if (!monSupportedBySave(targetSave, heldPayload.mon)) {
        displayError('Unsupported Pokémon', `${heldPayload.mon.nickname} cannot be moved into ${targetSave.gameNameFull}`)
        return
      }
    }

    // Batch placement
    if (heldPayload.multiLocations && heldPayload.multiLocations.length > 0) {
      const targetSave = dest.isHome ? undefined : savesManager.saveFromIdentifier(dest.saveIdentifier)

      const nextSaveDestination = (startBox: number, startSlot: number): MonLocation | null => {
        if (!targetSave) return null
        for (let box = startBox; box < targetSave.getBoxCount(); box++) {
          const slotStart = box === startBox ? startSlot : 0
          for (let boxSlot = slotStart; boxSlot < targetSave.boxSlotCount; boxSlot++) {
            if (!targetSave.getMonAt(box, boxSlot)) {
              return { isHome: false, saveIdentifier: targetSave.identifier, box, boxSlot }
            }
          }
        }
        return null
      }

      const nextHomeDestination = (startBox: number, startSlot: number): MonLocation | null => {
        if (!dest.isHome) return null
        const currentBank = getCurrentBank()
        const bank = dest.bank
        for (let box = startBox; box < currentBank.boxes.size; box++) {
          const slotStart = box === startBox ? startSlot : 0
          for (let boxSlot = slotStart; boxSlot < OPENHOME_BOX_SLOTS; boxSlot++) {
            const loc = { bank, box, boxSlot }
            if (homeLocationIsEmpty(loc)) return { isHome: true, ...loc }
          }
        }
        return null
      }

      let nextDest: MonLocation | null = dest.isHome
        ? nextHomeDestination(dest.box, dest.boxSlot)
        : nextSaveDestination(dest.box, dest.boxSlot)

      for (const srcLoc of heldPayload.multiLocations) {
        if (!nextDest) break
        const currMon = await getMonAtLocation(srcLoc)
        if (!currMon) continue

        if (!dest.isHome && targetSave && !targetSave.supportsMon(currMon.nationalDex, currMon.formIndex)) {
          continue
        }

        if (currMon.heldItemIndex && !dest.isHome && targetSave && !targetSave.supportsItem(currMon.heldItemIndex)) {
          await savesManager.moveMonItemToBag(srcLoc)
        }

        await moveMon({ ...srcLoc, mon: currMon }, nextDest).then(
          R.mapErr((err) => displayError('Could not move Pokémon', err))
        )

        nextDest = nextDest.isHome
          ? nextHomeDestination(nextDest.box, nextDest.boxSlot + 1)
          : nextSaveDestination(nextDest.box, nextDest.boxSlot + 1)
      }

      clearSelections()
      setHeldPayload(null)
      useDragStore.setState({ payload: undefined, overId: undefined })
      return
    }

    // Single mon placement
    if (
      heldPayload.mon.heldItemIndex &&
      !dest.isHome &&
      !savesManager.saveFromIdentifier(dest.saveIdentifier).supportsItem(heldPayload.mon.heldItemIndex)
    ) {
      await savesManager.moveMonItemToBag(source)
    }

    await moveMon({ ...source, mon: heldPayload.mon }, dest).then(
      R.mapErr((err) => displayError('Could not move Pokémon', err))
    )

    setHeldPayload(null)
    useDragStore.setState({ payload: undefined, overId: undefined })
  }, [
    activeLocation,
    heldPayload,
    multiSelectState.selectedLocations,
    getMonAtLocation,
    savesManager,
    displayError,
    getCurrentBank,
    homeLocationIsEmpty,
    moveMon,
    clearSelections,
  ])

  // Cancel action
  const handleCancelAction = useCallback(() => {
    if (detailsModalMon) {
      setDetailsModalMon(null)
      return
    }
    if (heldPayload) {
      setHeldPayload(null)
      useDragStore.setState({ payload: undefined, overId: undefined })
      return
    }
    if (multiSelectState.selectedLocations.length > 0) {
      clearSelections()
      setMultiSelectEnabled(false)
      return
    }
  }, [detailsModalMon, heldPayload, multiSelectState.selectedLocations.length, clearSelections, setMultiSelectEnabled])

  // Move grid cursor with bounds checking
  const moveCursor = useCallback(
    (deltaRow: number, deltaCol: number) => {
      if (activePane === 'save') {
        setSaveCursor((prev) => ({
          row: Math.max(0, Math.min(saveRows - 1, prev.row + deltaRow)),
          col: Math.max(0, Math.min(saveCols - 1, prev.col + deltaCol)),
        }))
      } else {
        setBankCursor((prev) => ({
          row: Math.max(0, Math.min(bankRows - 1, prev.row + deltaRow)),
          col: Math.max(0, Math.min(bankCols - 1, prev.col + deltaCol)),
        }))
      }
    },
    [activePane, saveRows, saveCols, bankRows, bankCols]
  )

  // Lasso start and end handlers
  const handleYHoldStart = useCallback(() => {
    setMultiSelectEnabled(true)
    const current = activePane === 'save' ? saveCursor : bankCursor
    setLassoAnchor({ ...current })
  }, [activePane, saveCursor, bankCursor, setMultiSelectEnabled])

  const handleYHoldEnd = useCallback(async () => {
    if (!lassoAnchor) return
    const current = activePane === 'save' ? saveCursor : bankCursor
    const minRow = Math.min(lassoAnchor.row, current.row)
    const maxRow = Math.max(lassoAnchor.row, current.row)
    const minCol = Math.min(lassoAnchor.col, current.col)
    const maxCol = Math.max(lassoAnchor.col, current.col)

    const cols = activePane === 'save' ? saveCols : bankCols

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const slot = r * cols + c
        let loc: MonLocation
        if (activePane === 'save') {
          if (!activeSave) continue
          loc = {
            isHome: false,
            saveIdentifier: activeSave.identifier,
            box: activeSave.currentPCBox,
            boxSlot: slot,
          }
        } else {
          loc = {
            isHome: true,
            bank: getCurrentBank().index,
            box: getCurrentBox().index,
            boxSlot: slot,
          }
        }
        const mon = await getMonAtLocation(loc)
        if (mon && !isSelected(loc)) {
          toggleSelection(loc)
        }
      }
    }

    setLassoAnchor(null)
  }, [
    lassoAnchor,
    activePane,
    saveCursor,
    bankCursor,
    saveCols,
    bankCols,
    activeSave,
    getCurrentBank,
    getCurrentBox,
    getMonAtLocation,
    isSelected,
    toggleSelection,
  ])

  // Single select tap
  const handleSelectAction = useCallback(() => {
    if (!activeLocation) return
    setMultiSelectEnabled(true)
    toggleSelection(activeLocation)
  }, [activeLocation, setMultiSelectEnabled, toggleSelection])

  // Open Pokemon summary modal
  const handleSummaryAction = useCallback(async () => {
    if (!activeLocation) return
    const mon = await getMonAtLocation(activeLocation)
    if (mon) {
      setDetailsModalMon(mon)
    }
  }, [activeLocation, getMonAtLocation])

  // Gamepad action dispatcher
  const handleAction = useCallback(
    (action: string) => {
      switch (action) {
        case 'up':
          moveCursor(-1, 0)
          break
        case 'down':
          moveCursor(1, 0)
          break
        case 'left':
          moveCursor(0, -1)
          break
        case 'right':
          moveCursor(0, 1)
          break
        case 'confirm':
          void handleConfirmAction()
          break
        case 'cancel':
          handleCancelAction()
          break
        case 'select':
          handleSelectAction()
          break
        case 'summary':
          void handleSummaryAction()
          break
        case 'prevBox':
          if (activePane === 'save') {
            if (activeSave) saveBoxNavigateLeft(activeSave)
          } else {
            switchToPreviousBox()
          }
          break
        case 'nextBox':
          if (activePane === 'save') {
            if (activeSave) saveBoxNavigateRight(activeSave)
          } else {
            switchToNextBox()
          }
          break
        case 'prevPane':
          setActivePane('save')
          break
        case 'nextPane':
          setActivePane('bank')
          break
        case 'toggleZoom':
          setBankZoomed((z) => !z)
          break
        case 'openSave':
          setSaveModalOpen((o) => !o)
          break
        case 'saveChanges':
          backend.emitMenuEvent('save')
          break
      }
    },
    [
      moveCursor,
      handleConfirmAction,
      handleCancelAction,
      handleSelectAction,
      handleSummaryAction,
      activePane,
      activeSave,
      saveBoxNavigateLeft,
      saveBoxNavigateRight,
      switchToPreviousBox,
      switchToNextBox,
      backend,
    ]
  )

  const handleGamepadActivity = useCallback(() => {
    if (!deckModeEnabled) {
      // Auto-enable deck mode upon detecting gamepad input if preferred
    }
  }, [deckModeEnabled])

  // Register gamepad & keyboard input engine
  useGamepadInput({
    enabled: true,
    onAction: handleAction,
    onYHoldStart: handleYHoldStart,
    onYHoldEnd: () => void handleYHoldEnd(),
    onGamepadActivity: handleGamepadActivity,
  })

  // Keep held mon visual over active cursor for drag compatibility styling
  const activeLocationRef = useRef(activeLocation)
  activeLocationRef.current = activeLocation

  useEffect(() => {
    if (heldPayload && activeLocationRef.current) {
      const dropID = activeLocationRef.current.isHome
        ? `home_${activeLocationRef.current.box}_${activeLocationRef.current.boxSlot}`
        : `${activeLocationRef.current.saveIdentifier}_${activeLocationRef.current.box}_${activeLocationRef.current.boxSlot}`
      useDragStore.setState({ overId: dropID })
    }
  }, [heldPayload, saveCursor, bankCursor, activePane])

  const contextValue: GamepadNavigationContextType = useMemo(
    () => ({
      deckModeEnabled,
      setDeckModeEnabled,
      toggleDeckMode,
      activePane,
      setActivePane,
      saveCursor,
      bankCursor,
      activeCursor,
      activeSaveIndex,
      setActiveSaveIndex,
      bankZoomed,
      toggleBankZoom: () => setBankZoomed((z) => !z),
      heldPayload,
      lassoArea,
      detailsModalMon,
      setDetailsModalMon,
      saveModalOpen,
      setSaveModalOpen,
      activeLocation,
    }),
    [
      deckModeEnabled,
      setDeckModeEnabled,
      toggleDeckMode,
      activePane,
      saveCursor,
      bankCursor,
      activeCursor,
      activeSaveIndex,
      bankZoomed,
      heldPayload,
      lassoArea,
      detailsModalMon,
      saveModalOpen,
      activeLocation,
    ]
  )

  return (
    <GamepadNavigationContext value={contextValue}>
      {children}
    </GamepadNavigationContext>
  )
}

import useBackend from '@openhome-core/backend/useBackend'
import { PKMInterface } from '@openhome-core/pkm/interfaces'
import { monSupportedBySave } from '@openhome-core/save/util'
import { R } from '@openhome-core/util/functional'
import useDisplayError from '@openhome-ui/hooks/displayError'
import {
  bankNameOrDefault,
  OPENHOME_BOX_COLUMNS,
  OPENHOME_BOX_ROWS,
  OPENHOME_BOX_SLOTS,
  useBanksAndBoxes,
} from '@openhome-ui/state-zustand/banks-and-boxes/store'
import { useDragStore } from '@openhome-ui/state-zustand/drag-and-drop/dragStore'
import useMultiSelect from '@openhome-ui/state/drag-and-drop/useMultiSelect'
import { HomeMonLocation, MonLocation, SaveMonLocation, useSaves } from '@openhome-ui/state/saves'
import {
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

export interface QuickMenuItem {
  id: string
  label: string
  description: string
  disabled?: boolean
  action: () => void | Promise<void>
}

interface GamepadNavigationContextType {
  deckModeEnabled: boolean
  setDeckModeEnabled: (enabled: boolean) => void
  toggleDeckMode: () => void

  activePane: DeckPane
  setActivePane: (pane: DeckPane) => void

  saveCursor: GridCoord
  setSaveCursor: (coord: GridCoord) => void
  bankCursor: GridCoord
  setBankCursor: (coord: GridCoord) => void
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

  quickMenuOpen: boolean
  setQuickMenuOpen: (open: boolean) => void
  quickMenuIndex: number
  setQuickMenuIndex: (index: number) => void
  quickMenuItems: QuickMenuItem[]
  executeQuickMenuItem: (index: number) => void
  statusMessage: string | null

  activeLocation: MonLocation | null
  handleCellClick: (pane: DeckPane, row: number, col: number) => void
  releaseActiveOrSelectedMons: () => Promise<void>
  triggerSavePaneAction: (actionCol: number) => Promise<void>
  triggerBankPaneAction: (actionCol: number) => Promise<void>
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
  const {
    allOpenSaves,
    saveBoxNavigateLeft,
    saveBoxNavigateRight,
    moveMon,
    moveMissingToBank,
    getMonAtLocation,
    releaseMonAtLocation,
  } = savesManager
  const banksAndBoxes = useBanksAndBoxes()
  const {
    banks,
    getCurrentBank,
    getCurrentBox,
    switchToBank,
    switchToPreviousBox,
    switchToNextBox,
    sortHomeBox,
    sortAllHomeBoxesLivingDex,
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
    try {
      const saved = localStorage.getItem('openhome_deck_mode')
      if (saved !== null) return saved === 'true'
    } catch {
      // ignore localStorage errors
    }
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
  const [quickMenuOpen, setQuickMenuOpen] = useState(false)
  const [quickMenuIndex, setQuickMenuIndex] = useState(0)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showStatus = useCallback((msg: string) => {
    setStatusMessage(msg)
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    statusTimerRef.current = setTimeout(() => {
      setStatusMessage(null)
    }, 3200)
  }, [])

  const activeSave = allOpenSaves[activeSaveIndex] ?? allOpenSaves[0]
  const saveCols = activeSave ? activeSave.boxColumns : 6
  const saveRows = activeSave ? activeSave.boxRows : 5

  const bankCols = OPENHOME_BOX_COLUMNS // 12
  const bankRows = OPENHOME_BOX_ROWS // 10

  const SAVE_ACTION_COUNT = 2
  const BANK_ACTION_COUNT = 3

  const activeCursor = activePane === 'save' ? saveCursor : bankCursor

  const buildLocation = useCallback(
    (pane: DeckPane, row: number, col: number): MonLocation | null => {
      if (row < 0) return null
      if (pane === 'save') {
        if (!activeSave) return null
        const boxSlot = row * saveCols + col
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
        const boxSlot = row * bankCols + col
        const loc: HomeMonLocation = {
          isHome: true,
          bank: currentBank.index,
          box: currentBox.index,
          boxSlot,
        }
        return loc
      }
    },
    [activeSave, saveCols, getCurrentBank, getCurrentBox, bankCols]
  )

  // Compute active MonLocation based on active pane and cursor
  const activeLocation = useMemo<MonLocation | null>(() => {
    return buildLocation(
      activePane,
      activePane === 'save' ? saveCursor.row : bankCursor.row,
      activePane === 'save' ? saveCursor.col : bankCursor.col
    )
  }, [activePane, buildLocation, saveCursor, bankCursor])

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

  // Execute pick up or place at a given target location
  const executePickUpOrPlaceAt = useCallback(
    async (targetLocation: MonLocation) => {
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
        const currentMon = await getMonAtLocation(targetLocation)
        if (currentMon) {
          const payload: HeldMonPayload = {
            sourceLocation: targetLocation,
            mon: currentMon,
          }
          setHeldPayload(payload)
          useDragStore.setState({
            payload: {
              kind: 'mon',
              monData: { ...targetLocation, mon: currentMon },
            },
          })
        }
        return
      }

      // Placing held mon(s) at targetLocation
      const dest = targetLocation
      const source = heldPayload.sourceLocation

      // If target save doesn't support the mon, block placement
      if (!dest.isHome) {
        const targetSave = savesManager.saveFromIdentifier(dest.saveIdentifier)
        if (!monSupportedBySave(targetSave, heldPayload.mon)) {
          displayError(
            'Unsupported Pokémon',
            `${heldPayload.mon.nickname} cannot be moved into ${targetSave.gameNameFull}`
          )
          return
        }
      }

      // Batch placement
      if (heldPayload.multiLocations && heldPayload.multiLocations.length > 0) {
        const targetSave = dest.isHome
          ? undefined
          : savesManager.saveFromIdentifier(dest.saveIdentifier)

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

          if (
            !dest.isHome &&
            targetSave &&
            !targetSave.supportsMon(currMon.nationalDex, currMon.formIndex)
          ) {
            continue
          }

          if (
            currMon.heldItemIndex &&
            !dest.isHome &&
            targetSave &&
            !targetSave.supportsItem(currMon.heldItemIndex)
          ) {
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
        setMultiSelectEnabled(false)
        setHeldPayload(null)
        useDragStore.setState({ payload: undefined, overId: undefined })
        return
      }

      // Single mon placement
      if (
        heldPayload.mon.heldItemIndex &&
        !dest.isHome &&
        !savesManager
          .saveFromIdentifier(dest.saveIdentifier)
          .supportsItem(heldPayload.mon.heldItemIndex)
      ) {
        await savesManager.moveMonItemToBag(source)
      }

      await moveMon({ ...source, mon: heldPayload.mon }, dest).then(
        R.mapErr((err) => displayError('Could not move Pokémon', err))
      )

      setHeldPayload(null)
      useDragStore.setState({ payload: undefined, overId: undefined })
    },
    [
      heldPayload,
      multiSelectState.selectedLocations,
      getMonAtLocation,
      savesManager,
      displayError,
      getCurrentBank,
      homeLocationIsEmpty,
      moveMon,
      clearSelections,
      setMultiSelectEnabled,
    ]
  )

  const releaseActiveOrSelectedMons = useCallback(async () => {
    if (multiSelectState.selectedLocations.length > 0) {
      for (const loc of multiSelectState.selectedLocations) {
        const mon = await getMonAtLocation(loc)
        if (mon) releaseMonAtLocation(loc)
      }
      clearSelections()
      setMultiSelectEnabled(false)
      showStatus('Moved selected Pokémon to Release Area')
      return
    }
    if (activeLocation) {
      const mon = await getMonAtLocation(activeLocation)
      if (mon) {
        releaseMonAtLocation(activeLocation)
        showStatus(`Moved ${mon.nickname} to Release Area`)
      }
    }
  }, [
    multiSelectState.selectedLocations,
    activeLocation,
    getMonAtLocation,
    releaseMonAtLocation,
    clearSelections,
    setMultiSelectEnabled,
    showStatus,
  ])

  const triggerSavePaneAction = useCallback(
    async (actionCol: number) => {
      if (!activeSave) {
        setSaveModalOpen(true)
        return
      }
      const currentBank = getCurrentBank()
      const bankLabel = bankNameOrDefault(currentBank)
      if (actionCol === 0) {
        const moved = await moveMissingToBank(activeSave, currentBank.index, false)
        showStatus(`Transferred ${moved} missing Pokémon to ${bankLabel}`)
      } else if (actionCol === 1) {
        const moved = await moveMissingToBank(activeSave, currentBank.index, true)
        showStatus(`Transferred ${moved} duplicate missing Pokémon (2+ in save) to ${bankLabel}`)
      }
    },
    [activeSave, getCurrentBank, moveMissingToBank, showStatus]
  )

  const triggerBankPaneAction = useCallback(
    async (actionCol: number) => {
      const currentBank = getCurrentBank()
      const currentBox = getCurrentBox()
      if (actionCol === 0) {
        await sortAllHomeBoxesLivingDex()
        showStatus(
          `Sorted ${bankNameOrDefault(currentBank)} by National Living Dex (120 slots/box)`
        )
      } else if (actionCol === 1) {
        await sortHomeBox(currentBox.index, 'Species')
        showStatus(`Sorted ${currentBox.name ?? `Box ${currentBox.index + 1}`} by Species`)
      } else if (actionCol === 2) {
        await releaseActiveOrSelectedMons()
      }
    },
    [
      getCurrentBank,
      getCurrentBox,
      sortAllHomeBoxesLivingDex,
      sortHomeBox,
      releaseActiveOrSelectedMons,
      showStatus,
    ]
  )

  const handleConfirmAction = useCallback(async () => {
    if (activeCursor.row === -1) {
      if (activePane === 'save') {
        await triggerSavePaneAction(activeCursor.col)
      } else {
        await triggerBankPaneAction(activeCursor.col)
      }
      return
    }
    if (!activeLocation) return
    await executePickUpOrPlaceAt(activeLocation)
  }, [
    activeCursor,
    activePane,
    triggerSavePaneAction,
    triggerBankPaneAction,
    activeLocation,
    executePickUpOrPlaceAt,
  ])

  // Mouse / Touchscreen click support in Deck Mode
  const handleCellClick = useCallback(
    (pane: DeckPane, row: number, col: number) => {
      const wasAlreadyFocused =
        activePane === pane &&
        (pane === 'save'
          ? saveCursor.row === row && saveCursor.col === col
          : bankCursor.row === row && bankCursor.col === col)

      setActivePane(pane)
      if (pane === 'save') {
        setSaveCursor({ row, col })
      } else {
        setBankCursor({ row, col })
      }

      const targetLoc = buildLocation(pane, row, col)
      if (!targetLoc) return

      if (heldPayload) {
        void executePickUpOrPlaceAt(targetLoc)
      } else if (wasAlreadyFocused) {
        void getMonAtLocation(targetLoc).then((mon) => {
          if (mon) setDetailsModalMon(mon)
        })
      }
    },
    [
      activePane,
      saveCursor,
      bankCursor,
      buildLocation,
      heldPayload,
      executePickUpOrPlaceAt,
      getMonAtLocation,
    ]
  )

  const quickMenuItems = useMemo<QuickMenuItem[]>(() => {
    const currentBank = getCurrentBank()
    const currentBox = getCurrentBox()
    const bankLabel = bankNameOrDefault(currentBank)

    return [
      {
        id: 'sort-living-dex',
        label: `Sort ${bankLabel} by National Living Dex`,
        description:
          'Places #0001–#1025 into slots across Boxes 1–9 (120 per box), names boxes 0001-0120..0961-1025, and puts duplicates into Overflow (Box 10+).',
        action: async () => {
          await sortAllHomeBoxesLivingDex()
          showStatus(`Sorted ${bankLabel} by National Living Dex`)
        },
      },
      {
        id: 'transfer-missing-all',
        label: `Transfer All Missing from Save → ${bankLabel}`,
        description: activeSave
          ? `Moves 1 of every species in ${activeSave.gameNameFull} not yet in ${bankLabel} into its Living Dex slot.`
          : 'Open a save file first to transfer missing Pokémon.',
        disabled: !activeSave,
        action: async () => {
          if (!activeSave) return
          const moved = await moveMissingToBank(activeSave, currentBank.index, false)
          showStatus(`Transferred ${moved} missing Pokémon to ${bankLabel}`)
        },
      },
      {
        id: 'transfer-missing-dupes',
        label: `Transfer Missing (2+ in Save) → ${bankLabel}`,
        description: activeSave
          ? `Moves 1 of every missing species where ${activeSave.gameNameFull} has at least 2 copies (preserving 1 for in-game Living Dex).`
          : 'Open a save file first to transfer missing duplicate Pokémon.',
        disabled: !activeSave,
        action: async () => {
          if (!activeSave) return
          const moved = await moveMissingToBank(activeSave, currentBank.index, true)
          showStatus(`Transferred ${moved} duplicate missing Pokémon to ${bankLabel}`)
        },
      },
      {
        id: 'sort-box-species',
        label: `Sort Current Box (${currentBox.name ?? `Box ${currentBox.index + 1}`}) by Species`,
        description: 'Sorts only the currently viewed box by National Dex number.',
        action: async () => {
          await sortHomeBox(currentBox.index, 'Species')
          showStatus(`Sorted ${currentBox.name ?? `Box ${currentBox.index + 1}`} by Species`)
        },
      },
      {
        id: 'switch-bank',
        label: `Switch Active Bank (Current: ${bankLabel})`,
        description:
          banks.length > 1
            ? 'Cycles to the next OpenHome Bank.'
            : 'Only 1 bank exists currently.',
        disabled: banks.length <= 1,
        action: () => {
          if (banks.length <= 1) return
          const nextIdx = (currentBank.index + 1) % banks.length
          switchToBank(nextIdx)
          showStatus(`Switched to ${bankNameOrDefault(banks[nextIdx])}`)
        },
      },
      {
        id: 'open-save',
        label: 'Open / Add Game Save File...',
        description: 'Opens the save file selector modal.',
        action: () => {
          setSaveModalOpen(true)
        },
      },
      {
        id: 'save-all',
        label: 'Save All Changes',
        description: 'Writes all modified save files and OpenHome banks to disk.',
        action: () => {
          backend.emitMenuEvent('save')
          showStatus('Saving all changes...')
        },
      },
    ]
  }, [
    getCurrentBank,
    getCurrentBox,
    activeSave,
    banks,
    sortAllHomeBoxesLivingDex,
    moveMissingToBank,
    sortHomeBox,
    switchToBank,
    backend,
    showStatus,
  ])

  const executeQuickMenuItem = useCallback(
    (index: number) => {
      const item = quickMenuItems[index]
      if (!item || item.disabled) return
      setQuickMenuOpen(false)
      void item.action()
    },
    [quickMenuItems]
  )

  // Cancel action
  const handleCancelAction = useCallback(() => {
    if (quickMenuOpen) {
      setQuickMenuOpen(false)
      return
    }
    if (detailsModalMon) {
      setDetailsModalMon(null)
      return
    }
    if (saveModalOpen) {
      setSaveModalOpen(false)
      return
    }
    if (heldPayload) {
      setHeldPayload(null)
      useDragStore.setState({ payload: undefined, overId: undefined })
      return
    }
    if (multiSelectState.selectedLocations.length > 0 || multiSelectState.multiSelectEnabled) {
      clearSelections()
      setMultiSelectEnabled(false)
      return
    }
    if (activeCursor.row === -1) {
      if (activePane === 'save') {
        setSaveCursor((prev) => ({ row: 0, col: prev.col }))
      } else {
        setBankCursor((prev) => ({ row: 0, col: prev.col }))
      }
    }
  }, [
    quickMenuOpen,
    detailsModalMon,
    saveModalOpen,
    heldPayload,
    multiSelectState.selectedLocations.length,
    multiSelectState.multiSelectEnabled,
    clearSelections,
    setMultiSelectEnabled,
    activeCursor.row,
    activePane,
  ])

  // Move grid cursor with bounds checking (including row -1 action bar)
  const moveCursor = useCallback(
    (deltaRow: number, deltaCol: number) => {
      if (activePane === 'save') {
        setSaveCursor((prev) => {
          const nextRow = Math.max(-1, Math.min(saveRows - 1, prev.row + deltaRow))
          if (nextRow === -1) {
            const maxActionCol = SAVE_ACTION_COUNT - 1
            const nextCol =
              prev.row === -1
                ? Math.max(0, Math.min(maxActionCol, prev.col + deltaCol))
                : Math.min(maxActionCol, prev.col)
            return { row: -1, col: nextCol }
          }
          return {
            row: nextRow,
            col: Math.max(0, Math.min(saveCols - 1, prev.col + deltaCol)),
          }
        })
      } else {
        setBankCursor((prev) => {
          const nextRow = Math.max(-1, Math.min(bankRows - 1, prev.row + deltaRow))
          if (nextRow === -1) {
            const maxActionCol = BANK_ACTION_COUNT - 1
            const nextCol =
              prev.row === -1
                ? Math.max(0, Math.min(maxActionCol, prev.col + deltaCol))
                : Math.min(maxActionCol, prev.col)
            return { row: -1, col: nextCol }
          }
          return {
            row: nextRow,
            col: Math.max(0, Math.min(bankCols - 1, prev.col + deltaCol)),
          }
        })
      }
    },
    [activePane, saveRows, saveCols, bankRows, bankCols]
  )

  // Lasso start and end handlers
  const handleYHoldStart = useCallback(() => {
    if (!deckModeEnabled) return
    const current = activePane === 'save' ? saveCursor : bankCursor
    if (current.row < 0) return
    setMultiSelectEnabled(true)
    setLassoAnchor({ ...current })
  }, [deckModeEnabled, activePane, saveCursor, bankCursor, setMultiSelectEnabled])

  const handleYHoldEnd = useCallback(async () => {
    if (!lassoAnchor) return
    const current = activePane === 'save' ? saveCursor : bankCursor
    const curRow = Math.max(0, current.row)
    const minRow = Math.min(lassoAnchor.row, curRow)
    const maxRow = Math.max(lassoAnchor.row, curRow)
    const minCol = Math.min(lassoAnchor.col, current.col)
    const maxCol = Math.max(lassoAnchor.col, current.col)

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const loc = buildLocation(activePane, r, c)
        if (!loc) continue
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
    buildLocation,
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
    if (detailsModalMon) {
      setDetailsModalMon(null)
      return
    }
    if (!activeLocation) return
    const mon = await getMonAtLocation(activeLocation)
    if (mon) {
      setDetailsModalMon(mon)
    }
  }, [detailsModalMon, activeLocation, getMonAtLocation])

  // Gamepad action dispatcher
  const handleAction = useCallback(
    (action: string) => {
      if (!deckModeEnabled) return

      // Handle Quick Actions Menu navigation
      if (quickMenuOpen) {
        if (action === 'up') {
          setQuickMenuIndex((i) => (i > 0 ? i - 1 : quickMenuItems.length - 1))
        } else if (action === 'down') {
          setQuickMenuIndex((i) => (i + 1) % quickMenuItems.length)
        } else if (action === 'confirm') {
          executeQuickMenuItem(quickMenuIndex)
        } else if (action === 'cancel' || action === 'quickMenu') {
          setQuickMenuOpen(false)
        }
        return
      }

      // When a modal is open, only allow cancel or summary toggle
      if (detailsModalMon || saveModalOpen) {
        if (action === 'cancel') {
          handleCancelAction()
        } else if (action === 'summary' && detailsModalMon) {
          setDetailsModalMon(null)
        } else if (action === 'openSave' && saveModalOpen) {
          setSaveModalOpen(false)
        }
        return
      }

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
          if (activePane === 'save' && !activeSave) {
            setSaveModalOpen(true)
          } else {
            void handleConfirmAction()
          }
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
          showStatus('Saving all changes...')
          break
        case 'quickMenu':
          setQuickMenuIndex(0)
          setQuickMenuOpen(true)
          break
      }
    },
    [
      deckModeEnabled,
      quickMenuOpen,
      quickMenuItems.length,
      quickMenuIndex,
      executeQuickMenuItem,
      detailsModalMon,
      saveModalOpen,
      moveCursor,
      activePane,
      activeSave,
      handleConfirmAction,
      handleCancelAction,
      handleSelectAction,
      handleSummaryAction,
      saveBoxNavigateLeft,
      saveBoxNavigateRight,
      switchToPreviousBox,
      switchToNextBox,
      backend,
      showStatus,
    ]
  )

  // Register gamepad & keyboard input engine (only active when deckModeEnabled is true)
  useGamepadInput({
    enabled: deckModeEnabled,
    onAction: handleAction,
    onYHoldStart: handleYHoldStart,
    onYHoldEnd: () => void handleYHoldEnd(),
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
      setSaveCursor,
      bankCursor,
      setBankCursor,
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
      quickMenuOpen,
      setQuickMenuOpen,
      quickMenuIndex,
      setQuickMenuIndex,
      quickMenuItems,
      executeQuickMenuItem,
      statusMessage,
      activeLocation,
      handleCellClick,
      releaseActiveOrSelectedMons,
      triggerSavePaneAction,
      triggerBankPaneAction,
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
      quickMenuOpen,
      quickMenuIndex,
      quickMenuItems,
      executeQuickMenuItem,
      statusMessage,
      activeLocation,
      handleCellClick,
      releaseActiveOrSelectedMons,
      triggerSavePaneAction,
      triggerBankPaneAction,
    ]
  )

  return (
    <GamepadNavigationContext value={contextValue}>
      {children}
    </GamepadNavigationContext>
  )
}

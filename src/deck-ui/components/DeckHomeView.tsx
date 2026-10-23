import useBackend from '@openhome-core/backend/useBackend'
import { PKMInterface } from '@openhome-core/pkm/interfaces'
import { OhpkmIdentifier } from '@openhome-core/pkm/Lookup'
import { SAV, saveToStringIdentifier } from '@openhome-core/save/interfaces'
import { Option, R, range } from '@openhome-core/util/functional'
import { isThenable, NowOrLater } from '@openhome-core/util/promise'
import PokemonDetailsModal from '@openhome-ui/pokemon/PokemonDetailsModal'
import ArrowButton from '@openhome-ui/saves/boxes/ArrowButton'
import BoxCellAsync, { BoxSlotContents } from '@openhome-ui/saves/boxes/BoxCellAsync'
import SavesModal from '@openhome-ui/saves/SavesModal'
import {
  OPENHOME_BOX_COLUMNS,
  OPENHOME_BOX_ROWS,
  OPENHOME_BOX_SLOTS,
  useBanksAndBoxes,
} from '@openhome-ui/state-zustand/banks-and-boxes/store'
import { useCanSwapWithDragging, useDragSourceSupportsMon } from '@openhome-ui/state-zustand/drag-and-drop/dragStore'
import useMultiSelect from '@openhome-ui/state/drag-and-drop/useMultiSelect'
import { useOhpkmStore } from '@openhome-ui/state/ohpkm'
import useOhpkmBatchIdLookup from '@openhome-ui/state/ohpkm/useOhpkmIdBatchLookup'
import { EMPTY_SLOT, HomeMonLocation, MonLocation, useSaves } from '@openhome-ui/state/saves'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { MdClose, MdFileOpen, MdSave } from 'react-icons/md'
import '../deck-ui.css'
import { useGamepadNavigation } from '../state/GamepadNavigationContext'

export default function DeckHomeView() {
  const backend = useBackend()
  const {
    activePane,
    setActivePane,
    saveCursor,
    bankCursor,
    activeSaveIndex,
    setActiveSaveIndex,
    bankZoomed,
    toggleBankZoom,
    detailsModalMon,
    setDetailsModalMon,
    saveModalOpen,
    setSaveModalOpen,
    toggleDeckMode,
  } = useGamepadNavigation()

  const savesManager = useSaves()
  const { allOpenSaves } = savesManager
  const banksAndBoxes = useBanksAndBoxes()
  const {
    banks,
    getCurrentBank,
    getCurrentBox,
    switchToBank,
    switchToPreviousBox,
    switchToNextBox,
    sortHomeBox,
  } = banksAndBoxes

  const activeSave: SAV | undefined = allOpenSaves[activeSaveIndex] ?? allOpenSaves[0]

  return (
    <div className="deck-container">
      {/* Top Header Bar */}
      <header className="deck-top-bar">
        <div className="deck-top-bar-left">
          <span className="deck-top-title">
            OpenHome <span className="deck-badge">SteamOS</span>
          </span>
          <button
            className="deck-top-btn"
            onClick={() => setSaveModalOpen(true)}
            title="Open Save File (Select)"
          >
            <MdFileOpen /> Open Save
          </button>
          {allOpenSaves.length > 1 && (
            <select
              className="deck-top-btn"
              value={activeSaveIndex}
              onChange={(e) => setActiveSaveIndex(Number(e.target.value))}
            >
              {allOpenSaves.map((s, idx) => (
                <option key={s.identifier} value={idx}>
                  {s.gameNameFull} - {s.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="deck-top-bar-right">
          {activePane === 'bank' && (
            <button
              className={`deck-top-btn ${bankZoomed ? 'active' : ''}`}
              onClick={toggleBankZoom}
            >
              {bankZoomed ? '12×10 Full' : '6×5 Zoom'}
            </button>
          )}

          <select
            className="deck-top-btn"
            value={getCurrentBank().index}
            onChange={(e) => switchToBank(Number(e.target.value))}
          >
            {banks.map((b) => (
              <option key={b.index} value={b.index}>
                {b.name ?? `Bank ${b.index + 1}`}
              </option>
            ))}
          </select>

          <button
            className="deck-top-btn"
            onClick={() => sortHomeBox(getCurrentBox().index, 'National Dex Number')}
            title="Sort Current Bank Box"
          >
            Sort Box
          </button>

          <button
            className="deck-top-btn"
            onClick={() => backend.emitMenuEvent('save')}
            title="Save All Changes (Start)"
          >
            <MdSave /> Save
          </button>

          <button className="deck-top-btn" onClick={toggleDeckMode} title="Exit Deck Mode">
            <MdClose /> Desktop Mode
          </button>
        </div>
      </header>

      {/* Main Dual-Pane View */}
      <main className="deck-dual-panes">
        {/* Left Pane: Emulator Save File */}
        <section
          className={`deck-pane deck-pane-save ${activePane === 'save' ? 'active-pane' : ''}`}
          onClick={() => setActivePane('save')}
        >
          {activeSave ? (
            <DeckSavePaneContent save={activeSave} cursor={saveCursor} isActivePane={activePane === 'save'} lassoArea={lassoArea} />
          ) : (
            <DeckEmptySavePrompt onOpenSave={() => setSaveModalOpen(true)} />
          )}
        </section>

        {/* Right Pane: OpenHome Bank */}
        <section
          className={`deck-pane deck-pane-bank ${activePane === 'bank' ? 'active-pane' : ''}`}
          onClick={() => setActivePane('bank')}
        >
          <DeckBankPaneContent
            cursor={bankCursor}
            isActivePane={activePane === 'bank'}
            lassoArea={lassoArea}
            bankZoomed={bankZoomed}
          />
        </section>
      </main>

      {/* Details & Saves Modals */}
      <PokemonDetailsModal
        mon={detailsModalMon ?? undefined}
        key={detailsModalMon?.openhomeId ?? detailsModalMon?.personalityValue}
        onClose={() => setDetailsModalMon(null)}
      />

      <SavesModal open={saveModalOpen} onClose={() => setSaveModalOpen(false)} />
    </div>
  )
}

/* --------------------------------------------------------------------------
   Left Pane Content: Save File Box
   -------------------------------------------------------------------------- */
interface DeckSavePaneProps {
  save: SAV
  cursor: { row: number; col: number }
  isActivePane: boolean
  lassoArea: { pane: string; startRow: number; startCol: number; endRow: number; endCol: number } | null
}

function DeckSavePaneContent({ save, cursor, isActivePane, lassoArea }: DeckSavePaneProps) {
  const savesManager = useSaves()
  const ohpkmStore = useOhpkmStore()
  const { multiSelectState, toggleSelection, isSelected } = useMultiSelect()
  const { heldPayload } = useGamepadNavigation()

  const allSaveMons = useMemo(() => save.getAllMons().map((mon) => [mon, save] as const), [save])
  const { batchResults: saveOhpkms } = useOhpkmBatchIdLookup(
    useMemo(
      () =>
        allSaveMons
          .map(([mon]) => mon)
          .map(ohpkmStore.getPotentialOhpkmId)
          .filter((id): id is string => typeof id === 'string'),
      [allSaveMons, ohpkmStore]
    )
  )

  const canSwapWithDragging = useCanSwapWithDragging(save)
  const cols = save.boxColumns
  const rows = save.boxRows

  const slots = useMemo(
    () =>
      range(cols * rows).map((index) => {
        const location: MonLocation = {
          isHome: false,
          box: save.currentPCBox,
          boxSlot: index,
          saveIdentifier: save.identifier,
        }

        let mon: NowOrLater<R.Result<Option<PKMInterface>>> = save.tryGetMonAt(location.box, location.boxSlot)

        if (R.isErr(mon)) {
          return { location, mon, openhomeId: undefined }
        }

        const potentialId = ohpkmStore.getPotentialOhpkmId(save.getMonAt(location.box, location.boxSlot))
        let openhomeId = potentialId

        const ohpkm = potentialId && saveOhpkms?.get(potentialId) ? R.dropError(saveOhpkms.get(potentialId)!) : undefined
        mon = ohpkm ? R.Ok(ohpkm) : mon

        const pendingMon = savesManager.getPendingMon(location)
        if (pendingMon === EMPTY_SLOT) {
          mon = R.Ok(undefined)
        } else if (pendingMon) {
          if (typeof pendingMon === 'string') {
            openhomeId = pendingMon
            const res = ohpkmStore.getById(openhomeId)
            mon = isThenable(res) ? res.then(R.Ok) : R.Ok(res)
          } else {
            mon = R.Ok(pendingMon)
          }
        }

        return { location, mon, openhomeId }
      }),
    [cols, rows, save, ohpkmStore, saveOhpkms, savesManager]
  )

  const focusedSlotIndex = cursor.row * cols + cursor.col
  const focusedSlotRef = useRef<HTMLDivElement | null>(null)

  return (
    <>
      <div className="deck-pane-header">
        <div className="deck-pane-title-group">
          <span className="deck-pane-title">
            {save.gameNameFull} <span className="deck-key-hint">{save.name}</span>
          </span>
        </div>
        <div className="deck-box-nav">
          <ArrowButton onClick={() => savesManager.saveBoxNavigateLeft(save)} direction="left" />
          <span className="deck-box-name">{save.getBoxName(save.currentPCBox)}</span>
          <ArrowButton onClick={() => savesManager.saveBoxNavigateRight(save)} direction="right" />
        </div>
      </div>

      <div className="deck-grid-wrapper">
        <div className={`deck-save-grid ${cols === 5 ? 'deck-save-grid-5col' : ''}`}>
          {slots.map(({ location, mon, openhomeId }, index) => {
            const row = Math.floor(index / cols)
            const col = index % cols
            const isFocused = isActivePane && cursor.row === row && cursor.col === col
            const isLassoed =
              lassoArea &&
              lassoArea.pane === 'save' &&
              row >= lassoArea.startRow &&
              row <= lassoArea.endRow &&
              col >= lassoArea.startCol &&
              col <= lassoArea.endCol

            const slotMetadata = save.getSlotMetadata?.(save.currentPCBox, index)
            const isSlotDisabled = !canSwapWithDragging(undefined) || slotMetadata?.isDisabled === true

            return (
              <div
                key={`save_${save.currentPCBox}_${index}`}
                ref={isFocused ? focusedSlotRef : undefined}
                className={`deck-slot ${isFocused ? 'focused' : ''} ${isLassoed ? 'lasso-highlight' : ''} ${isSelected(location) ? 'selected' : ''}`}
                tabIndex={isFocused ? 0 : -1}
              >
                {isFocused && heldPayload && (
                  <span className="deck-held-badge" title="Holding Pokémon">
                    {heldPayload.multiLocations ? heldPayload.multiLocations.length : '1'}
                  </span>
                )}
                <BoxCellAsync
                  location={location}
                  monPromise={mon}
                  openhomeId={openhomeId}
                  dragID={`${saveToStringIdentifier(save)}_${save.currentPCBox}_${index}`}
                  isDisabled={() => isSlotDisabled}
                  disabledReason={slotMetadata?.disabledReason}
                  onClick={() => {}}
                  onDrop={() => {}}
                  multiSelectEnabled={multiSelectState.multiSelectEnabled}
                  isSelected={isSelected(location)}
                  onToggleSelect={() => toggleSelection(location)}
                />
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

/* --------------------------------------------------------------------------
   Right Pane Content: OpenHome Bank Box
   -------------------------------------------------------------------------- */
interface DeckBankPaneProps {
  cursor: { row: number; col: number }
  isActivePane: boolean
  lassoArea: { pane: string; startRow: number; startCol: number; endRow: number; endCol: number } | null
  bankZoomed: boolean
}

function DeckBankPaneContent({ cursor, isActivePane, lassoArea, bankZoomed }: DeckBankPaneProps) {
  const ohpkmStore = useOhpkmStore()
  const { getCurrentBox, getCurrentBank, switchToPreviousBox, switchToNextBox } = useBanksAndBoxes()
  const { getPendingMon, importMonsToLocation } = useSaves()
  const { multiSelectState, toggleSelection, isSelected } = useMultiSelect()
  const { heldPayload } = useGamepadNavigation()
  const sourceSupportsMon = useDragSourceSupportsMon()

  const currentBox = getCurrentBox()
  const currentBankIndex = getCurrentBank().index
  const currentBoxIndex = currentBox.index

  const getById = ohpkmStore.tryLoadFromId
  const lookupOhpkmById = useCallback((id: OhpkmIdentifier) => getById(id), [getById])

  const slots = useMemo(
    () =>
      range(OPENHOME_BOX_SLOTS)
        .map((index) => currentBox.identifiers.get(index))
        .map((storedId, index) => {
          const location: HomeMonLocation = {
            bank: currentBankIndex,
            box: currentBoxIndex,
            boxSlot: index,
            isHome: true,
          }

          let identifier = storedId
          let monPromise: BoxSlotContents = R.Ok(undefined) as BoxSlotContents

          const pendingMon = getPendingMon(location)
          if (pendingMon === EMPTY_SLOT) {
            identifier = undefined
          } else if (pendingMon) {
            if (typeof pendingMon === 'string') {
              identifier = pendingMon
            } else {
              identifier = undefined
              monPromise = R.Ok(pendingMon) as BoxSlotContents
            }
          }

          if (identifier) {
            const lookupResult = lookupOhpkmById(identifier)
            if (isThenable(lookupResult)) {
              monPromise = lookupResult
            } else if (lookupResult) {
              monPromise = lookupOhpkmById(identifier)
            }
          }

          return { monPromise, location, identifier }
        }),
    [currentBox.identifiers, currentBankIndex, currentBoxIndex, getPendingMon, lookupOhpkmById]
  )

  const focusedSlotRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (isActivePane && bankZoomed && focusedSlotRef.current) {
      focusedSlotRef.current.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [cursor, isActivePane, bankZoomed])

  return (
    <>
      <div className="deck-pane-header">
        <div className="deck-pane-title-group">
          <span className="deck-pane-title">
            OpenHome Bank <span className="deck-key-hint">{getCurrentBank().name ?? `Bank ${currentBankIndex + 1}`}</span>
          </span>
        </div>
        <div className="deck-box-nav">
          <ArrowButton onClick={switchToPreviousBox} direction="left" />
          <span className="deck-box-name">{currentBox.name?.trim() || `Box ${currentBox.index + 1}`}</span>
          <ArrowButton onClick={switchToNextBox} direction="right" />
        </div>
      </div>

      <div className="deck-grid-wrapper">
        <div className={`deck-bank-grid ${bankZoomed ? 'zoomed' : ''}`}>
          {slots.map(({ monPromise, location, identifier }, index) => {
            const row = Math.floor(index / OPENHOME_BOX_COLUMNS)
            const col = index % OPENHOME_BOX_COLUMNS
            const isFocused = isActivePane && cursor.row === row && cursor.col === col
            const isLassoed =
              lassoArea &&
              lassoArea.pane === 'bank' &&
              row >= lassoArea.startRow &&
              row <= lassoArea.endRow &&
              col >= lassoArea.startCol &&
              col <= lassoArea.endCol

            return (
              <div
                key={`home_${currentBoxIndex}_${index}`}
                ref={isFocused ? focusedSlotRef : undefined}
                className={`deck-slot ${isFocused ? 'focused' : ''} ${isLassoed ? 'lasso-highlight' : ''} ${isSelected(location) ? 'selected' : ''}`}
                tabIndex={isFocused ? 0 : -1}
              >
                {isFocused && heldPayload && (
                  <span className="deck-held-badge" title="Holding Pokémon">
                    {heldPayload.multiLocations ? heldPayload.multiLocations.length : '1'}
                  </span>
                )}
                <BoxCellAsync
                  location={location}
                  monPromise={monPromise}
                  openhomeId={identifier}
                  dragID={`home_${currentBoxIndex}_${index}`}
                  isDisabled={(mon) => mon !== undefined && !sourceSupportsMon(mon)}
                  onClick={() => {}}
                  onDrop={(importedMons) => {
                    if (importedMons) importMonsToLocation(importedMons, location)
                  }}
                  multiSelectEnabled={multiSelectState.multiSelectEnabled}
                  isSelected={isSelected(location)}
                  onToggleSelect={() => toggleSelection(location)}
                />
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

/* --------------------------------------------------------------------------
   Quick Open Save view when no save is loaded
   -------------------------------------------------------------------------- */
interface DeckEmptySavePromptProps {
  onOpenSave: () => void
}

function DeckEmptySavePrompt({ onOpenSave }: DeckEmptySavePromptProps) {
  return (
    <div className="deck-empty-save">
      <h3>No Save File Open</h3>
      <p style={{ color: '#94a3b8', fontSize: '0.88rem', maxWidth: '280px' }}>
        Open a game save file from an emulator or flashcart to transfer Pokémon between your game and OpenHome Bank.
      </p>
      <button className="deck-top-btn" onClick={onOpenSave} style={{ padding: '8px 16px', fontSize: '0.95rem' }}>
        <MdFileOpen style={{ fontSize: '1.2rem' }} /> Open Save File (Select)
      </button>
    </div>
  )
}

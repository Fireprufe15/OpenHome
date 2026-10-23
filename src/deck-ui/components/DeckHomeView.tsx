import useBackend from '@openhome-core/backend/useBackend'
import { PKMInterface } from '@openhome-core/pkm/interfaces'
import { OhpkmIdentifier } from '@openhome-core/pkm/Lookup'
import { OHPKM } from '@openhome-core/pkm/OHPKM'
import { SAV, saveToStringIdentifier } from '@openhome-core/save/interfaces'
import { Option, R, range } from '@openhome-core/util/functional'
import { isThenable, NowOrLater } from '@openhome-core/util/promise'
import Fallback from '@openhome-ui/components/Fallback'
import PokemonDetailsModal from '@openhome-ui/pokemon/PokemonDetailsModal'
import ArrowButton from '@openhome-ui/saves/boxes/ArrowButton'
import BoxCellAsync, { BoxSlotContents } from '@openhome-ui/saves/boxes/BoxCellAsync'
import SavesModal from '@openhome-ui/saves/SavesModal'
import {
  OPENHOME_BOX_COLUMNS,
  OPENHOME_BOX_SLOTS,
  useBanksAndBoxes,
} from '@openhome-ui/state-zustand/banks-and-boxes/store'
import {
  useCanSwapWithDragging,
  useDragSourceSupportsMon,
} from '@openhome-ui/state-zustand/drag-and-drop/dragStore'
import useMultiSelect from '@openhome-ui/state/drag-and-drop/useMultiSelect'
import { useOhpkmStore } from '@openhome-ui/state/ohpkm'
import useOhpkmBatchIdLookup from '@openhome-ui/state/ohpkm/useOhpkmIdBatchLookup'
import { EMPTY_SLOT, HomeMonLocation, MonLocation, useSaves } from '@openhome-ui/state/saves'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { MdClose, MdDeleteOutline, MdFileOpen, MdSave } from 'react-icons/md'
import '../deck-ui.css'
import { LassoArea } from '../gamepad/types'
import { useGamepadNavigation } from '../state/GamepadNavigationContext'
import ControllerHudBar from './ControllerHudBar'

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
    heldPayload,
    lassoArea,
    detailsModalMon,
    setDetailsModalMon,
    saveModalOpen,
    setSaveModalOpen,
    toggleDeckMode,
    releaseActiveOrSelectedMons,
  } = useGamepadNavigation()

  const savesManager = useSaves()
  const { allOpenSaves } = savesManager
  const banksAndBoxes = useBanksAndBoxes()
  const { banks, getCurrentBank, getCurrentBox, switchToBank, sortHomeBox } = banksAndBoxes

  const activeSave: SAV | undefined = allOpenSaves[activeSaveIndex] ?? allOpenSaves[0]
  const currentBank = getCurrentBank()
  const currentBox = getCurrentBox()

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
            title="Open Save File (Select / F2)"
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
          {heldPayload && (
            <span className="deck-badge" style={{ background: 'rgba(244, 63, 94, 0.25)', color: '#fda4af', borderColor: '#f43f5e' }}>
              Holding: {heldPayload.multiLocations ? `${heldPayload.multiLocations.length} Pokémon` : heldPayload.mon.nickname}
            </span>
          )}
        </div>

        <div className="deck-top-bar-right">
          <button
            className={`deck-top-btn ${bankZoomed ? 'active' : ''}`}
            onClick={toggleBankZoom}
            title="Toggle Bank Grid Zoom (R3 / Z)"
          >
            {bankZoomed ? '12×10 Full' : 'Zoom Grid'}
          </button>

          <select
            className="deck-top-btn"
            value={currentBank.index}
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
            onClick={() => void sortHomeBox(currentBox.index, 'pokedex')}
            title="Sort Current Bank Box by National Dex"
          >
            Sort Box
          </button>

          <button
            className="deck-top-btn"
            onClick={() => void releaseActiveOrSelectedMons()}
            title="Move Focused or Selected Pokémon to Release Area"
          >
            <MdDeleteOutline /> Release
          </button>

          <button
            className="deck-top-btn"
            onClick={() => backend.emitMenuEvent('save')}
            title="Save All Changes (Start / Ctrl+S)"
          >
            <MdSave /> Save
          </button>

          <button className="deck-top-btn" onClick={toggleDeckMode} title="Switch to Desktop UI">
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
          <Fallback>
            {activeSave ? (
              <DeckSavePaneContent
                save={activeSave}
                cursor={saveCursor}
                isActivePane={activePane === 'save'}
                lassoArea={lassoArea}
              />
            ) : (
              <DeckEmptySavePrompt onOpenSave={() => setSaveModalOpen(true)} />
            )}
          </Fallback>
        </section>

        {/* Right Pane: OpenHome Bank */}
        <section
          className={`deck-pane deck-pane-bank ${activePane === 'bank' ? 'active-pane' : ''}`}
          onClick={() => setActivePane('bank')}
        >
          <Fallback>
            <DeckBankPaneContent
              cursor={bankCursor}
              isActivePane={activePane === 'bank'}
              lassoArea={lassoArea}
              bankZoomed={bankZoomed}
            />
          </Fallback>
        </section>
      </main>

      {/* Bottom Controller Prompts HUD */}
      <ControllerHudBar />

      {/* Details & Saves Modals */}
      <Fallback>
        <PokemonDetailsModal
          mon={detailsModalMon ?? undefined}
          key={
            detailsModalMon
              ? `${detailsModalMon.openhomeId ?? detailsModalMon.personalityValue ?? detailsModalMon.nickname}`
              : 'closed'
          }
          onClose={() => setDetailsModalMon(null)}
        />
      </Fallback>

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
  lassoArea: LassoArea | null
}

function DeckSavePaneContent({ save, cursor, isActivePane, lassoArea }: DeckSavePaneProps) {
  const savesManager = useSaves()
  const ohpkmStore = useOhpkmStore()
  const { multiSelectState, toggleSelection, isSelected } = useMultiSelect()
  const { heldPayload, handleCellClick } = useGamepadNavigation()

  const saveMonIds = useMemo(
    () =>
      save
        .getAllMons()
        .map((mon) => ohpkmStore.getPotentialOhpkmId(mon))
        .filter((id): id is string => typeof id === 'string'),
    [save, ohpkmStore]
  )
  const { batchResults: saveOhpkms } = useOhpkmBatchIdLookup(saveMonIds)

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

        let mon: NowOrLater<R.Result<Option<PKMInterface>>> = save.tryGetMonAt(
          location.box,
          location.boxSlot
        )

        if (R.isErr(mon)) {
          return { location, mon, openhomeId: undefined }
        }

        const slotMon = save.getMonAt(location.box, location.boxSlot)
        const potentialId = slotMon ? ohpkmStore.getPotentialOhpkmId(slotMon) : undefined
        let openhomeId = potentialId

        const ohpkm =
          potentialId && saveOhpkms?.get(potentialId)
            ? R.dropError(saveOhpkms.get(potentialId)!)
            : undefined
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
          <span className="deck-key-hint">LB</span>
          <ArrowButton
            onClick={() => savesManager.saveBoxNavigateLeft(save)}
            dragID={`deck_arrow_left_${save.tid}_${save.sid}`}
            direction="left"
          />
          <span className="deck-box-name">{save.getBoxName(save.currentPCBox)}</span>
          <ArrowButton
            onClick={() => savesManager.saveBoxNavigateRight(save)}
            dragID={`deck_arrow_right_${save.tid}_${save.sid}`}
            direction="right"
          />
          <span className="deck-key-hint">RB</span>
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
            const uniqueKey = isThenable(mon)
              ? `${save.currentPCBox}-${index}-${openhomeId}`
              : R.isOk(mon) && mon.data
                ? `${save.currentPCBox}-${index}-${openhomeId ?? mon.data.encryptionConstant ?? mon.data.personalityValue ?? JSON.stringify(mon.data.dvs)}-${mon.data.nickname}`
                : `${save.currentPCBox}-${index}`

            const borderColor =
              !isThenable(mon) && R.isOk(mon) && mon.data instanceof OHPKM
                ? 'var(--ohpkm-cell-border-color)'
                : undefined

            return (
              <div
                key={`deck_save_slot_${save.currentPCBox}_${index}`}
                ref={isFocused ? focusedSlotRef : undefined}
                className={`deck-slot ${isFocused ? 'focused' : ''} ${isLassoed ? 'lasso-highlight' : ''} ${isSelected(location) ? 'selected' : ''}`}
                tabIndex={isFocused ? 0 : -1}
                onClick={(e) => {
                  e.stopPropagation()
                  handleCellClick('save', row, col)
                }}
              >
                {isFocused && heldPayload && (
                  <span className="deck-held-badge" title="Holding Pokémon">
                    {heldPayload.multiLocations ? heldPayload.multiLocations.length : '1'}
                  </span>
                )}
                <BoxCellAsync
                  key={uniqueKey}
                  location={location}
                  monPromise={mon}
                  openhomeId={openhomeId}
                  dragID={`${saveToStringIdentifier(save)}_${save.currentPCBox}_${index}`}
                  isDisabled={(cellMon) =>
                    !canSwapWithDragging(cellMon) || slotMetadata?.isDisabled === true
                  }
                  disabledReason={slotMetadata?.disabledReason}
                  onClick={() => handleCellClick('save', row, col)}
                  onDrop={(importedMons) => {
                    if (importedMons) {
                      void savesManager.importMonsToLocation(importedMons, location)
                    }
                  }}
                  multiSelectEnabled={multiSelectState.multiSelectEnabled}
                  isSelected={isSelected(location)}
                  onToggleSelect={() => toggleSelection(location)}
                  borderColor={borderColor}
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
  lassoArea: LassoArea | null
  bankZoomed: boolean
}

function DeckBankPaneContent({ cursor, isActivePane, lassoArea, bankZoomed }: DeckBankPaneProps) {
  const ohpkmStore = useOhpkmStore()
  const { getCurrentBox, getCurrentBank, switchToPreviousBox, switchToNextBox } =
    useBanksAndBoxes()
  const { getPendingMon, importMonsToLocation } = useSaves()
  const { multiSelectState, toggleSelection, isSelected } = useMultiSelect()
  const { heldPayload, handleCellClick } = useGamepadNavigation()
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
    if (isActivePane && focusedSlotRef.current) {
      focusedSlotRef.current.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [cursor, isActivePane, bankZoomed])

  return (
    <>
      <div className="deck-pane-header">
        <div className="deck-pane-title-group">
          <span className="deck-pane-title">
            OpenHome Bank{' '}
            <span className="deck-key-hint">
              {getCurrentBank().name ?? `Bank ${currentBankIndex + 1}`}
            </span>
          </span>
        </div>
        <div className="deck-box-nav">
          <span className="deck-key-hint">LB</span>
          <ArrowButton
            onClick={switchToPreviousBox}
            dragID="deck-home-arrow-left"
            direction="left"
          />
          <span className="deck-box-name">
            {currentBox.name?.trim() || `Box ${currentBox.index + 1}`}
          </span>
          <ArrowButton
            onClick={switchToNextBox}
            dragID="deck-home-arrow-right"
            direction="right"
          />
          <span className="deck-key-hint">RB</span>
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

            const uniqueKey = identifier ?? `${currentBoxIndex}-${index}`

            return (
              <div
                key={`deck_home_slot_${currentBoxIndex}_${index}`}
                ref={isFocused ? focusedSlotRef : undefined}
                className={`deck-slot ${isFocused ? 'focused' : ''} ${isLassoed ? 'lasso-highlight' : ''} ${isSelected(location) ? 'selected' : ''}`}
                tabIndex={isFocused ? 0 : -1}
                onClick={(e) => {
                  e.stopPropagation()
                  handleCellClick('bank', row, col)
                }}
              >
                {isFocused && heldPayload && (
                  <span className="deck-held-badge" title="Holding Pokémon">
                    {heldPayload.multiLocations ? heldPayload.multiLocations.length : '1'}
                  </span>
                )}
                <BoxCellAsync
                  key={uniqueKey}
                  location={location}
                  monPromise={monPromise}
                  openhomeId={identifier}
                  dragID={`home_${currentBoxIndex}_${index}`}
                  isDisabled={(mon) => mon !== undefined && !sourceSupportsMon(mon)}
                  onClick={() => handleCellClick('bank', row, col)}
                  onDrop={(importedMons) => {
                    if (importedMons) void importMonsToLocation(importedMons, location)
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
        Open a game save file from an emulator or flashcart to transfer Pokémon between your game
        and OpenHome Bank.
      </p>
      <button
        className="deck-top-btn"
        onClick={(e) => {
          e.stopPropagation()
          onOpenSave()
        }}
        style={{ padding: '8px 16px', fontSize: '0.95rem' }}
      >
        <MdFileOpen style={{ fontSize: '1.2rem' }} /> Open Save File (Select)
      </button>
    </div>
  )
}

// import userEvent from '@testing-library/user-event'
import {
  getLivingDexBoxName,
  getLivingDexCoordinates,
  LIVING_DEX_BOX_COUNT,
  sortForLivingDex,
} from '@openhome-core/pkm/sort'
import { SimpleOpenHomeBox, StoredBankData } from '@openhome-core/save/util/storage'
import { R, range } from '@openhome-core/util/functional'
import { v4 as UuidV4 } from 'uuid'
import { assert, describe, expect, test } from 'vitest'
import { BoxMap, createBanksAndBoxesStore } from './store'

function buildTestStoredState(): StoredBankData {
  return {
    banks: [
      {
        id: UuidV4(),
        name: 'test bank',
        index: 0,
        boxes: boxMapFromOrdered(
          range(10).map((_, index) => ({
            id: UuidV4(),
            name: `TestBox${index}`,
            index,
            identifiers: new Map(),
          }))
        ),
        current_box: 0,
      },
    ],
    current_bank: 0,
  }
}

function buildTestStore() {
  return createBanksAndBoxesStore(buildTestStoredState(), async () => R.Ok(buildTestStoredState()))
}

function assertIndicesMatchKeys(boxMap: BoxMap) {
  for (const [mapKeyIndex, box] of boxMap) {
    expect(box.index).toBe(mapKeyIndex)
  }
}

describe('banks and boxes store', () => {
  const store = buildTestStore()

  test('should initialize state with expected bank/box names', async () => {
    expect(store.getState().getCurrentBank().name).toBe('test bank')

    expect(store.getState().getCurrentBank().boxes.get(3)?.name).toBe('TestBox3')
  })
})

describe('box insertion', () => {
  const store = buildTestStore()

  test('inserting box at start', async () => {
    store.getState().addBoxCurrentBank('start', 'My New Box')

    expect(store.getState().getCurrentBank().boxes.get(0)?.name).toBe('My New Box')

    assertIndicesMatchKeys(store.getState().getCurrentBank().boxes)
  })

  test('appending box to end', async () => {
    store.getState().addBoxCurrentBank('end', 'My New Box')

    const boxes = store.getState().getCurrentBank().boxes
    expect(boxes.get(boxes.size - 1)?.name).toBe('My New Box')

    assertIndicesMatchKeys(store.getState().getCurrentBank().boxes)
  })

  test('insert box before index', async () => {
    store.getState().addBoxCurrentBank(['before', 5], 'My New Box')

    const boxes = store.getState().getCurrentBank().boxes
    expect(boxes.get(5)?.name).toBe('My New Box')

    assertIndicesMatchKeys(store.getState().getCurrentBank().boxes)
  })

  test('insert box after index', async () => {
    store.getState().addBoxCurrentBank(['after', 5], 'My New Box')

    const boxes = store.getState().getCurrentBank().boxes
    expect(boxes.get(6)?.name).toBe('My New Box')

    assertIndicesMatchKeys(store.getState().getCurrentBank().boxes)
  })
})

describe('box deletion', () => {
  const store = buildTestStore()

  test('delete box', async () => {
    const thirdBoxId = store.getState().getCurrentBank().boxes.get(2)?.id
    assert(thirdBoxId !== undefined)

    store.getState().deleteBoxCurrentBank(thirdBoxId)

    expect(store.getState().getCurrentBank().boxes.get(2)?.id).not.toBe(thirdBoxId)

    assertIndicesMatchKeys(store.getState().getCurrentBank().boxes)
  })
})

describe('living dex coordinates and sorting', () => {
  test('living dex box count is 9', () => {
    expect(LIVING_DEX_BOX_COUNT).toBe(9)
  })

  test('calculates correct box and slot coordinates for living dex', () => {
    expect(getLivingDexCoordinates(1)).toEqual({ box: 0, boxSlot: 0 })
    expect(getLivingDexCoordinates(120)).toEqual({ box: 0, boxSlot: 119 })
    expect(getLivingDexCoordinates(121)).toEqual({ box: 1, boxSlot: 0 })
    expect(getLivingDexCoordinates(1025)).toEqual({ box: 8, boxSlot: 64 })
  })

  test('generates 120-slot range box names for living dex and overflow boxes', () => {
    expect(getLivingDexBoxName(0, true, 120)).toBe('0001 - 0120')
    expect(getLivingDexBoxName(1, true, 120)).toBe('0121 - 0240')
    expect(getLivingDexBoxName(8, true, 120)).toBe('0961 - 1025')
    expect(getLivingDexBoxName(9, true, 120)).toBe('Overflow 1')
    expect(getLivingDexBoxName(9, false, 120)).toBeNull()
  })

  test('sorts living dex prioritizing non-eggs, dex number, and base forms', () => {
    const mons = [
      { nationalDex: 25, formIndex: 1, nickname: 'Pikachu Cap', isEgg: false } as any,
      { nationalDex: 25, formIndex: 0, nickname: 'Pikachu', isEgg: false } as any,
      { nationalDex: 1, formIndex: 0, nickname: 'Bulbasaur', isEgg: true } as any,
      { nationalDex: 1, formIndex: 0, nickname: 'Bulbasaur', isEgg: false } as any,
      { nationalDex: 4, formIndex: 0, nickname: 'Charmander', isEgg: false } as any,
    ]

    const sorted = mons.toSorted(sortForLivingDex)
    expect(sorted.map((m) => m.nickname)).toEqual([
      'Bulbasaur',
      'Charmander',
      'Pikachu',
      'Pikachu Cap',
      'Bulbasaur', // Egg goes last
    ])
  })
})

describe('bank expansion and bulk overwrite', () => {
  test('ensureBankBoxCount expands boxes up to minBoxCount', () => {
    const store = buildTestStore()
    expect(store.getState().getCurrentBank().boxes.size).toBe(10)

    store.getState().ensureBankBoxCount(0, 15)
    expect(store.getState().getCurrentBank().boxes.size).toBe(15)
    assertIndicesMatchKeys(store.getState().getCurrentBank().boxes)
  })

  test('overwriteAllBoxSlotsCurrentBank expands boxes and updates reverse lookup', () => {
    const store = buildTestStore()
    const newSlots = new Map<number, Map<number, string>>()
    const box0 = new Map<number, string>()
    box0.set(0, 'ohpkm-bulbasaur')
    newSlots.set(0, box0)

    store.getState().overwriteAllBoxSlotsCurrentBank(newSlots, 12)
    expect(store.getState().getCurrentBank().boxes.size).toBe(12)
    expect(store.getState().getCurrentBank().boxes.get(0)?.identifiers.get(0)).toBe('ohpkm-bulbasaur')
    expect(store.getState().findHomeLocation('ohpkm-bulbasaur')).toEqual({
      bank: 0,
      box: 0,
      boxSlot: 0,
    })
  })

  test('allMonsInBank and firstEmptySlotInBankBox', () => {
    const store = buildTestStore()
    store.getState().setAtLocation({ bank: 0, box: 0, boxSlot: 0 }, 'mon-1')

    const bankMons = store.getState().allMonsInBank(0)
    expect(bankMons['mon-1']).toEqual({ bank: 0, box: 0, boxSlot: 0 })
    expect(store.getState().firstEmptySlotInBankBox(0, 0)).toBe(1)
  })
})

function boxMapFromOrdered(boxesInOrder: SimpleOpenHomeBox[]): BoxMap {
  return new Map(boxesInOrder.map((box, index) => [index, { ...box, index }] as const))
}

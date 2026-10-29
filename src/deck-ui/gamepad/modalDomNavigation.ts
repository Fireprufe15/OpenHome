/**
 * Helpers for controller navigation inside modals and popup dialogs in Deck Mode.
 * Enables selecting and opening saves, dismissing popups (e.g. "Changes Saved"),
 * and confirming alerts entirely with gamepad buttons.
 */

export interface SpatialRect {
  x: number
  y: number
  width: number
  height: number
  centerX: number
  centerY: number
}

export function getElementSpatialRect(el: HTMLElement): SpatialRect {
  const rect = el.getBoundingClientRect()
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
    centerX: rect.left + rect.width / 2,
    centerY: rect.top + rect.height / 2,
  }
}

/**
 * Finds the candidate element in a given direction that best matches the current position.
 */
export function findNearestSpatialTarget<T extends HTMLElement>(
  currentEl: T,
  candidates: T[],
  direction: 'up' | 'down' | 'left' | 'right'
): T | null {
  if (candidates.length === 0) return null
  const currentRect = getElementSpatialRect(currentEl)

  let bestCandidate: T | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (const candidate of candidates) {
    if (candidate === currentEl) continue
    const targetRect = getElementSpatialRect(candidate)

    const dx = targetRect.centerX - currentRect.centerX
    const dy = targetRect.centerY - currentRect.centerY

    let isDirectionMatch = false
    let primaryDist = 0
    let secondaryDist = 0

    switch (direction) {
      case 'left':
        isDirectionMatch = dx < -4
        primaryDist = -dx
        secondaryDist = Math.abs(dy)
        break
      case 'right':
        isDirectionMatch = dx > 4
        primaryDist = dx
        secondaryDist = Math.abs(dy)
        break
      case 'up':
        isDirectionMatch = dy < -4
        primaryDist = -dy
        secondaryDist = Math.abs(dx)
        break
      case 'down':
        isDirectionMatch = dy > 4
        primaryDist = dy
        secondaryDist = Math.abs(dx)
        break
    }

    if (!isDirectionMatch) continue

    // Heavily weight primary direction while penalizing off-axis distance
    const distance = primaryDist + secondaryDist * 1.8

    if (distance < bestDistance) {
      bestDistance = distance
      bestCandidate = candidate
    }
  }

  return bestCandidate
}

export function getTopmostOpenDialog(): HTMLElement | null {
  if (typeof document === 'undefined') return null

  const rawElements = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="alertdialog"], [role="dialog"], [class*="Popup"], .deck-saves-modal, .pokemon-modal'
    )
  )

  // Deduplicate and filter visible popups
  const popups = Array.from(new Set(rawElements)).filter((el) => {
    if (el.hasAttribute('data-ending-style')) return false
    // Verify it is a top-level popup container, not a nested element
    const isPopupContainer =
      el.getAttribute('role') === 'alertdialog' ||
      el.getAttribute('role') === 'dialog' ||
      el.classList.contains('deck-saves-modal') ||
      el.classList.contains('pokemon-modal') ||
      el.className.includes('Popup')

    if (!isPopupContainer) return false

    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  })

  if (popups.length === 0) return null
  return popups[popups.length - 1]
}

export function setFocusedModalElement(el: HTMLElement | null) {
  if (typeof document === 'undefined') return

  // Clear existing modal focus highlights
  const prevFocused = document.querySelectorAll('.deck-modal-focused')
  prevFocused.forEach((item) => item.classList.remove('deck-modal-focused'))

  if (el) {
    el.classList.add('deck-modal-focused')
    try {
      el.focus({ preventScroll: true })
    } catch {
      // ignore
    }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
}

export function getFocusedModalElement(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('.deck-modal-focused')
}

/**
 * Automatically sets focus to the appropriate primary element in an open modal or dialog.
 */
export function autoFocusDialogElements(dialog: HTMLElement) {
  if (dialog.classList.contains('deck-saves-modal')) {
    const current = getFocusedModalElement(dialog)
    const panel = dialog.querySelector<HTMLElement>('.side-tab-panel')
    const panelButtons = panel
      ? Array.from(panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).filter(
          (b) =>
            !b.classList.contains('save-file-path') &&
            !b.classList.contains('save-grid-error-button')
        )
      : []

    if (!current || !dialog.contains(current)) {
      if (panelButtons.length > 0) {
        setFocusedModalElement(panelButtons[0])
      } else {
        const activeTab = dialog.querySelector<HTMLButtonElement>('.side-tab-active')
        if (activeTab) setFocusedModalElement(activeTab)
      }
    } else if (
      dialog.contains(current) &&
      !panel?.contains(current) &&
      current.classList.contains('side-tab') &&
      panelButtons.length > 0
    ) {
      setFocusedModalElement(panelButtons[0])
    }
  } else if (!dialog.classList.contains('pokemon-modal')) {
    const current = getFocusedModalElement(dialog)
    if (!current || !dialog.contains(current)) {
      const buttons = Array.from(
        dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
      ).filter((b) => {
        const rect = b.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })
      const themeBtn = buttons.find((b) => b.getAttribute('data-color') === 'theme')
      const target = themeBtn ?? buttons[buttons.length - 1] ?? buttons[0]
      if (target) setFocusedModalElement(target)
    }
  }
}

/**
 * Handle gamepad actions within standard popup dialogs (Changes Saved, Release confirmation, ErrorMessageModal, etc.)
 */
export function handlePopupDialogAction(
  dialog: HTMLElement,
  action: string
): boolean {
  const buttons = Array.from(
    dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
  ).filter((b) => {
    const rect = b.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  })

  if (buttons.length === 0) {
    if (action === 'cancel' || action === 'confirm') {
      const backdrop = document.querySelector<HTMLElement>('[class*="Backdrop"]')
      if (backdrop) {
        backdrop.click()
        return true
      }
    }
    return true
  }

  let currentFocused = getFocusedModalElement(dialog) as HTMLButtonElement | null
  if (!currentFocused || !buttons.includes(currentFocused)) {
    // Default focus to primary action (e.g. theme "Ok" or last button or first button)
    const themeBtn = buttons.find((b) => b.getAttribute('data-color') === 'theme')
    currentFocused = themeBtn ?? buttons[buttons.length - 1] ?? buttons[0]
    setFocusedModalElement(currentFocused)
  }

  const currentIndex = buttons.indexOf(currentFocused)

  switch (action) {
    case 'left':
    case 'up': {
      const prevIdx = (currentIndex - 1 + buttons.length) % buttons.length
      setFocusedModalElement(buttons[prevIdx])
      return true
    }
    case 'right':
    case 'down': {
      const nextIdx = (currentIndex + 1) % buttons.length
      setFocusedModalElement(buttons[nextIdx])
      return true
    }
    case 'confirm': {
      currentFocused.click()
      return true
    }
    case 'cancel': {
      // Look for a cancel button first
      const cancelBtn = buttons.find(
        (b) =>
          b.getAttribute('data-color') === 'grey' ||
          /cancel/i.test(b.textContent || '')
      )
      if (cancelBtn) {
        cancelBtn.click()
      } else {
        // If single button (e.g. "Ok" on Changes Saved / Error), dismiss it
        currentFocused.click()
      }
      return true
    }
    default:
      // Absorb other actions while dialog is open so background grid isn't affected
      return true
  }
}

/**
 * Handle gamepad actions within SavesModal.
 */
export function handleSavesModalAction(
  dialog: HTMLElement,
  action: string,
  onClose: () => void
): boolean {
  // Candidate save cards and grid open buttons in the active panel
  const panel = dialog.querySelector<HTMLElement>('.side-tab-panel')
  const tabList = dialog.querySelector<HTMLElement>('.side-tab-list')

  // Collect panel buttons (exclude nested .save-file-path)
  const panelButtons = panel
    ? Array.from(panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).filter(
        (b) => !b.classList.contains('save-file-path') && !b.classList.contains('save-grid-error-button')
      )
    : []

  // Collect tab buttons
  const tabButtons = tabList
    ? Array.from(tabList.querySelectorAll<HTMLButtonElement>('button.side-tab:not(:disabled)'))
    : []

  // Open file button in sidebar
  const openFileBtn = tabList
    ? tabList.querySelector<HTMLButtonElement>('button:not(.side-tab):not(:disabled)')
    : null

  const allSidebarButtons = tabList
    ? Array.from(tabList.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
    : []

  let currentFocused = getFocusedModalElement(dialog) as HTMLButtonElement | null

  // If nothing focused yet, focus the first panel button if available, or first tab button
  if (!currentFocused || !dialog.contains(currentFocused)) {
    currentFocused = panelButtons[0] ?? tabButtons[0] ?? null
    if (currentFocused) {
      setFocusedModalElement(currentFocused)
    }
  }

  switch (action) {
    case 'prevBox': {
      // LB: Cycle to previous tab
      if (tabButtons.length > 0) {
        const activeTabIdx = tabButtons.findIndex((b) => b.classList.contains('side-tab-active'))
        const prevTabIdx = (activeTabIdx - 1 + tabButtons.length) % tabButtons.length
        tabButtons[prevTabIdx]?.click()
      }
      return true
    }

    case 'nextBox': {
      // RB: Cycle to next tab
      if (tabButtons.length > 0) {
        const activeTabIdx = tabButtons.findIndex((b) => b.classList.contains('side-tab-active'))
        const nextTabIdx = (activeTabIdx + 1) % tabButtons.length
        tabButtons[nextTabIdx]?.click()
      }
      return true
    }

    case 'left': {
      if (!currentFocused) return true

      if (panel && panel.contains(currentFocused)) {
        // Try spatial move left among panel buttons
        const leftTarget = findNearestSpatialTarget(currentFocused, panelButtons, 'left')
        if (leftTarget) {
          setFocusedModalElement(leftTarget)
        } else {
          // Move from leftmost panel button to active tab button in sidebar
          const activeTab =
            tabButtons.find((b) => b.classList.contains('side-tab-active')) ?? tabButtons[0]
          if (activeTab) setFocusedModalElement(activeTab)
        }
      }
      return true
    }

    case 'right': {
      if (!currentFocused) return true

      if (tabList && tabList.contains(currentFocused)) {
        // Move from sidebar into panel items
        if (panelButtons.length > 0) {
          setFocusedModalElement(panelButtons[0])
        }
      } else if (panel && panel.contains(currentFocused)) {
        const rightTarget = findNearestSpatialTarget(currentFocused, panelButtons, 'right')
        if (rightTarget) setFocusedModalElement(rightTarget)
      }
      return true
    }

    case 'up': {
      if (!currentFocused) return true

      if (tabList && tabList.contains(currentFocused)) {
        const idx = allSidebarButtons.indexOf(currentFocused)
        if (idx > 0) {
          setFocusedModalElement(allSidebarButtons[idx - 1])
        }
      } else if (panel && panel.contains(currentFocused)) {
        const upTarget = findNearestSpatialTarget(currentFocused, panelButtons, 'up')
        if (upTarget) setFocusedModalElement(upTarget)
      }
      return true
    }

    case 'down': {
      if (!currentFocused) return true

      if (tabList && tabList.contains(currentFocused)) {
        const idx = allSidebarButtons.indexOf(currentFocused)
        if (idx >= 0 && idx < allSidebarButtons.length - 1) {
          setFocusedModalElement(allSidebarButtons[idx + 1])
        }
      } else if (panel && panel.contains(currentFocused)) {
        const downTarget = findNearestSpatialTarget(currentFocused, panelButtons, 'down')
        if (downTarget) setFocusedModalElement(downTarget)
      }
      return true
    }

    case 'confirm': {
      if (currentFocused) {
        currentFocused.click()
      }
      return true
    }

    case 'cancel':
    case 'openSave': {
      onClose()
      return true
    }

    default:
      return true
  }
}

/**
 * Handle gamepad actions within PokemonDetailsModal.
 */
export function handlePokemonDetailsModalAction(
  dialog: HTMLElement,
  action: string,
  onClose: () => void
): boolean {
  const tabs = Array.from(dialog.querySelectorAll<HTMLButtonElement>('.side-tab:not(:disabled)'))

  switch (action) {
    case 'prevBox': {
      if (tabs.length > 0) {
        const activeIdx = tabs.findIndex((t) => t.classList.contains('side-tab-active'))
        const prevIdx = (activeIdx - 1 + tabs.length) % tabs.length
        tabs[prevIdx]?.click()
      }
      return true
    }
    case 'nextBox': {
      if (tabs.length > 0) {
        const activeIdx = tabs.findIndex((t) => t.classList.contains('side-tab-active'))
        const nextIdx = (activeIdx + 1) % tabs.length
        tabs[nextIdx]?.click()
      }
      return true
    }
    case 'cancel':
    case 'summary': {
      onClose()
      return true
    }
    default:
      return true
  }
}

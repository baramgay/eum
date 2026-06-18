export interface FocusTrapOptions {
  /** Escape 키로 트랩을 해제할지 여부 (기본 true) */
  escapeCloses?: boolean
  /** 트랩 해제(닫기) 시 호출될 콜백 */
  onClose?: () => void
  /** 초기 포커스를 줄 요소. 미지정 시 첫 번째 포커스 가능 요소 */
  initialFocus?: HTMLElement | null
  /** 해제 시 이전 포커스 요소로 복원할지 여부 (기본 true) */
  returnFocus?: boolean
}

const FOCUSABLE_SELECTORS = [
  'button:not([disabled]):not([tabindex="-1"])',
  'a[href]:not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
  '[contenteditable]:not([contenteditable="false"]):not([tabindex="-1"])',
].join(', ')

function isVisible(el: HTMLElement): boolean {
  if (el.getAttribute('aria-hidden') === 'true') return false
  const style = getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden') return false
  return true
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const candidates = Array.from(
    new Set(Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)))
  )
  return candidates.filter(el => {
    if (el.tabIndex < 0) return false
    if ('disabled' in el && (el as HTMLButtonElement).disabled) return false
    if (!isVisible(el)) return false
    return true
  })
}

export function createFocusTrap(container: HTMLElement, options: FocusTrapOptions = {}) {
  const {
    escapeCloses = true,
    onClose,
    initialFocus,
    returnFocus = true,
  } = options

  const previouslyFocusedElement = returnFocus ? (document.activeElement as HTMLElement | null) : null

  function handleKeyDown(event: KeyboardEvent) {
    if (escapeCloses && event.key === 'Escape') {
      event.preventDefault()
      onClose?.()
      return
    }

    if (event.key !== 'Tab') return

    const focusable = getFocusableElements(container)
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement as HTMLElement | null

    if (event.shiftKey) {
      if (active === first || !container.contains(active)) {
        event.preventDefault()
        last.focus()
      }
    } else {
      if (active === last || !container.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  container.addEventListener('keydown', handleKeyDown)

  const target = initialFocus ?? getFocusableElements(container)[0]
  if (target) {
    target.focus()
  }

  return {
    destroy() {
      container.removeEventListener('keydown', handleKeyDown)
      if (returnFocus && previouslyFocusedElement && 'focus' in previouslyFocusedElement) {
        previouslyFocusedElement.focus()
      }
    },
  }
}

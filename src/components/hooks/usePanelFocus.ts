'use client'
import { useEffect, useRef, type RefObject } from 'react'
const controls =
  'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),[tabindex="0"]'
export function usePanelFocus(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
  modal = false,
) {
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    if (!open || !ref.current) return
    const panel = ref.current
    const previous = document.activeElement as HTMLElement | null
    const keyboard =
      previous?.matches(':focus-visible') && previous !== document.body
    const visibleControls = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(controls)).filter(
        (el) => el.offsetParent !== null && !el.closest('[inert]'),
      )
    if (keyboard || modal)
      (visibleControls()[0] ?? panel).focus({ preventScroll: true })
    const keydown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        (modal || panel.contains(document.activeElement))
      ) {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
      }
      if (event.key === 'Tab' && modal) {
        const items = visibleControls()
        const first = items[0]
        const last = items[items.length - 1]
        if (!first) {
          event.preventDefault()
          panel.focus()
          return
        }
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !panel.contains(document.activeElement))
        ) {
          event.preventDefault()
          last.focus()
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !panel.contains(document.activeElement))
        ) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', keydown, true)
    return () => {
      document.removeEventListener('keydown', keydown, true)
      if (
        panel.contains(document.activeElement) ||
        document.activeElement === document.body
      ) {
        const valid =
          previous?.isConnected &&
          !previous.closest('[inert]') &&
          previous.offsetParent !== null
        const fallback = document.querySelector<HTMLElement>(
          '[aria-label="搜索活动"]',
        )
        ;(valid ? previous : fallback)?.focus({ preventScroll: true })
      }
    }
  }, [open, modal, ref])
}

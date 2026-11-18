'use client'

import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { flushSync } from 'react-dom'

// Only the selected cover and title are captured; the live map keeps rendering.
export function useActivityLift(root: RefObject<HTMLElement | null>) {
  const active = useRef<ViewTransition | null>(null)
  const generation = useRef(0)

  useEffect(() => () => {
    generation.current += 1
    active.current?.skipTransition()
    document.documentElement.classList.remove('memory-lift-active')
  }, [])

  return useCallback((activityId: string, update: () => void) => {
    const ticket = ++generation.current
    active.current?.skipTransition()
    const cards = Array.from(root.current?.querySelectorAll<HTMLElement>('[data-activity-card]') ?? [])
    cards.forEach((card) => delete card.dataset.liftSource)
    const source = cards.find((card) => card.dataset.activityCard === activityId)
    if (
      !source ||
      !document.startViewTransition ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      document.documentElement.classList.remove('memory-lift-active')
      update()
      return
    }

    source.dataset.liftSource = 'true'
    document.documentElement.classList.add('memory-lift-active')
    const transition = document.startViewTransition(() => {
      if (generation.current === ticket) flushSync(update)
    })
    active.current = transition
    // A clipped/offscreen source or another browser transition may skip the effect.
    // The state update still completes, and a rejected ready promise is expected.
    void transition.ready.catch(() => {})
    void transition.finished.finally(() => {
      if (generation.current !== ticket) return
      active.current = null
      delete source.dataset.liftSource
      document.documentElement.classList.remove('memory-lift-active')
    }).catch(() => {})
  }, [root])
}

'use client'

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

export function useResultListMotion(
  scroller: RefObject<HTMLDivElement | null>,
  layoutKey: string,
  open: boolean,
) {
  const positions = useRef(new Map<string, number>())
  const scrollTop = useRef(0)
  const animations = useRef(new Map<HTMLElement, Animation>())

  useEffect(() => {
    const host = scroller.current
    if (!host) return
    const rememberScroll = () => { scrollTop.current = host.scrollTop }
    const stop = () => {
      animations.current.forEach((animation) => animation.cancel())
      animations.current.clear()
    }
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const preferenceChanged = () => { if (motion.matches) stop() }
    host.addEventListener('scroll', rememberScroll, { passive: true })
    motion.addEventListener('change', preferenceChanged)
    return () => {
      host.removeEventListener('scroll', rememberScroll)
      motion.removeEventListener('change', preferenceChanged)
      stop()
    }
  }, [scroller])

  useLayoutEffect(() => {
    const host = scroller.current
    if (!host) return

    // Preserve the current visual pose when another filter interrupts a movement.
    const offsets = new Map<HTMLElement, number>()
    animations.current.forEach((_, element) => {
      if (element.isConnected) {
        const transform = getComputedStyle(element).transform
        offsets.set(element, transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42)
      }
    })
    animations.current.forEach((animation) => animation.cancel())
    animations.current.clear()

    const previous = positions.current
    const previousScroll = scrollTop.current
    const next = new Map<string, number>()
    const viewport = host.getBoundingClientRect()
    const cards = Array.from(host.querySelectorAll<HTMLElement>('[data-activity-card]'))
    // Read geometry together before starting animations.
    const measured = cards.map((element) => ({
      element,
      id: element.dataset.activityCard!,
      top: element.offsetTop,
      rect: element.getBoundingClientRect(),
    }))
    measured.forEach(({ id, top }) => next.set(id, top))
    positions.current = open ? next : new Map()
    scrollTop.current = host.scrollTop

    if (
      !open ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.classList.contains('memory-lift-active')
    ) return

    let entering = 0
    measured.forEach(({ element, id, top, rect }) => {
      // Offscreen rows keep their final layout and incur no animation work.
      if (rect.bottom <= viewport.top || rect.top >= viewport.bottom) return
      const oldTop = previous.get(id)
      const delta = oldTop === undefined ? 0 : oldTop - top + previousScroll - host.scrollTop + (offsets.get(element) ?? 0)
      const retained = oldTop !== undefined && Math.abs(delta) < host.clientHeight
      if (retained && Math.abs(delta) < .5) return
      const animation = element.animate(
        retained
          ? [{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }]
          : [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
        {
          duration: retained ? 220 : 180,
          delay: retained ? 0 : Math.min(entering++ * 20, 100),
          easing: 'cubic-bezier(.2,.8,.2,1)',
          fill: 'both',
        },
      )
      animations.current.set(element, animation)
      const finish = () => {
        if (animations.current.get(element) !== animation) return
        animations.current.delete(element)
        animation.cancel()
      }
      void animation.finished.then(finish, finish)
    })
  }, [scroller, layoutKey, open])
}

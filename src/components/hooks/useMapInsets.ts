'use client'
import { useLayoutEffect, useState, type RefObject } from 'react'
export type ViewportInsets = {
  top: number
  right: number
  bottom: number
  left: number
}
export function useMapInsets(
  root: RefObject<HTMLDivElement | null>,
  layoutKey: string,
): ViewportInsets {
  const [insets, setInsets] = useState<ViewportInsets>({
    top: 144,
    right: 16,
    bottom: 120,
    left: 16,
  })
  useLayoutEffect(() => {
    const host = root.current
    if (!host) return
    let frame = 0
    const measure = () => {
      const next: ViewportInsets = { top: 16, right: 16, bottom: 16, left: 16 }
      host.querySelectorAll<HTMLElement>('[data-map-edge]').forEach((el) => {
        if (el.offsetParent === null || el.dataset.mapActive === 'false') return
        const edge = el.dataset.mapEdge as keyof ViewportInsets
        // offset dimensions are stable throughout transform-only entry animations.
        const amount =
          edge === 'top'
            ? el.offsetTop + el.offsetHeight
            : edge === 'bottom'
              ? host.clientHeight - el.offsetTop
              : edge === 'right'
                ? host.clientWidth - el.offsetLeft
                : el.offsetLeft + el.offsetWidth
        next[edge] = Math.max(next[edge], amount)
      })
      setInsets((old) =>
        Object.keys(next).every(
          (k) =>
            old[k as keyof ViewportInsets] === next[k as keyof ViewportInsets],
        )
          ? old
          : next,
      )
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(host)
    host
      .querySelectorAll<HTMLElement>('[data-map-edge]')
      .forEach((el) => observer.observe(el))
    measure()
    window.visualViewport?.addEventListener('resize', schedule)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      window.visualViewport?.removeEventListener('resize', schedule)
    }
  }, [root, layoutKey])
  return insets
}

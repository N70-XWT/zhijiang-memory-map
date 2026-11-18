'use client'

import { useEffect, type RefObject } from 'react'

const controls = 'button.memory-button, button.memory-option-button, button[data-press-feedback]'

export function usePressFeedback(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const host = root.current
    if (!host) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const active = new Map<HTMLButtonElement, { wave: HTMLElement; animation: Animation }>()

    const ripple = (event: PointerEvent | KeyboardEvent) => {
      if (motion.matches || !(event.target instanceof Element)) return
      const button = event.target.closest<HTMLButtonElement>(controls)
      if (!button || !host.contains(button) || button.disabled || button.closest('[inert]')) return
      if (event instanceof PointerEvent && (!event.isPrimary || event.button !== 0)) return
      if (event instanceof KeyboardEvent && (event.repeat || !['Enter', ' '].includes(event.key))) return

      const previous = active.get(button)
      previous?.animation.cancel()
      previous?.wave.remove()
      const rect = button.getBoundingClientRect()
      // Convert viewport coordinates to local coordinates, including pressed scale.
      const x = event instanceof PointerEvent ? (event.clientX - rect.left) * button.offsetWidth / rect.width : button.offsetWidth / 2
      const y = event instanceof PointerEvent ? (event.clientY - rect.top) * button.offsetHeight / rect.height : button.offsetHeight / 2
      const radius = Math.hypot(Math.max(x, button.offsetWidth - x), Math.max(y, button.offsetHeight - y))
      const wave = document.createElement('span')
      wave.className = 'memory-press-wave'
      wave.setAttribute('aria-hidden', 'true')
      Object.assign(wave.style, {
        left: `${x}px`, top: `${y}px`,
        width: `${radius * 2}px`, height: `${radius * 2}px`,
      })
      button.append(wave)
      const animation = wave.animate([
        { transform: 'translate(-50%, -50%) scale(0)', opacity: .2, offset: 0 },
        { transform: 'translate(-50%, -50%) scale(.75)', opacity: .14, offset: .55 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0, offset: 1 },
      ], { duration: 440, easing: 'cubic-bezier(.2,.65,.3,1)' })
      active.set(button, { wave, animation })
      const cleanup = () => {
        wave.remove()
        if (active.get(button)?.wave === wave) active.delete(button)
      }
      void animation.finished.then(cleanup, cleanup)
    }

    const stop = () => {
      active.forEach(({ wave, animation }) => {
        animation.cancel()
        wave.remove()
      })
      active.clear()
    }
    const preferenceChanged = () => { if (motion.matches) stop() }
    host.addEventListener('pointerdown', ripple, true)
    host.addEventListener('keydown', ripple, true)
    motion.addEventListener('change', preferenceChanged)
    return () => {
      host.removeEventListener('pointerdown', ripple, true)
      host.removeEventListener('keydown', ripple, true)
      motion.removeEventListener('change', preferenceChanged)
      stop()
    }
  }, [root])
}

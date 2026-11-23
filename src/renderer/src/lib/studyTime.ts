import { useEffect } from 'react'
import { api } from './api'
import { useStore, type Route } from './store'

// Time studied: while a study page is open, the window is in front and you've
// done something in the last few minutes, the seconds are counted and saved
// about once a minute. Shown on the home page.

/** Pages that count as studying. */
const STUDY_ROUTES = new Set<Route['name']>(['topic', 'flashcards', 'learn', 'notes'])
const TICK_SECONDS = 15
const SAVE_EVERY_SECONDS = 60
/** No key, click, scroll or touch for this long and you're taken to be away. */
const IDLE_MS = 3 * 60_000

/** Fired after time is saved, so the home page can refresh its numbers. */
export const STUDY_TIME_EVENT = 'studywise:study-time'

export function useStudyTimer(): void {
  useEffect(() => {
    let lastActive = Date.now()
    let pending = 0
    const active = () => {
      lastActive = Date.now()
    }
    const events = ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart', 'scroll'] as const
    for (const e of events) window.addEventListener(e, active, { passive: true, capture: true })

    const save = () => {
      if (pending < 1) return
      const seconds = pending
      pending = 0
      api.stats
        .addTime({ seconds })
        .then(() => window.dispatchEvent(new Event(STUDY_TIME_EVENT)))
        .catch(() => {
          pending += seconds // try again with the next save
        })
    }
    const tick = setInterval(() => {
      const here = useStore.getState().route.name
      if (document.visibilityState === 'visible' && document.hasFocus() && STUDY_ROUTES.has(here) && Date.now() - lastActive < IDLE_MS) pending += TICK_SECONDS
      if (pending >= SAVE_EVERY_SECONDS) save()
    }, TICK_SECONDS * 1000)
    // Leaving a page, hiding the window or quitting saves what's counted so far.
    const unsubscribe = useStore.subscribe((s, prev) => {
      if (s.route !== prev.route) save()
    })
    const onVisibility = () => document.visibilityState === 'hidden' && save()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('beforeunload', save)
    return () => {
      save()
      clearInterval(tick)
      unsubscribe()
      for (const e of events) window.removeEventListener(e, active, { capture: true })
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('beforeunload', save)
    }
  }, [])
}

/** "45m", "1h 05m", "0m". */
export function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

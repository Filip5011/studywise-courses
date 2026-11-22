import { useEffect, useState } from 'react'
import { Check, Scissors } from 'lucide-react'
import { api, errorText } from '../lib/api'
import { toast, useStore } from '../lib/store'
import { Markdown } from './Markdown'
import { Button, Dots, Modal, cx } from './ui'

type Suggestion = Awaited<ReturnType<typeof api.courses.suggestTrim>>['remove'][number]

/**
 * Trim a week's (or a topic's) recall cards: Claude suggests the ones that
 * aren't worth keeping for the exam (only the card text is sent), and you pick
 * which to delete. Nothing goes until you confirm.
 */
export function TrimCardsModal({ weekId, topicId, title, onClose }: { weekId: string; topicId?: string; title: string; onClose: () => void }) {
  const [result, setResult] = useState<{ total: number; remove: Suggestion[] } | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    api.courses
      .suggestTrim({ weekId, topicId })
      .then((r) => {
        if (!alive) return
        setResult(r)
        setPicked(new Set(r.remove.map((s) => s.cardId)))
      })
      .catch((e) => alive && setFailed(errorText(e)))
    return () => {
      alive = false
    }
  }, [weekId, topicId])

  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const remove = async () => {
    setBusy(true)
    try {
      const n = await api.courses.removeCards({ cardIds: [...picked] })
      toast(`Removed ${n} card${n === 1 ? '' : 's'}`, 'good')
      useStore.getState().bump()
      onClose()
    } catch (e) {
      toast(errorText(e), 'bad')
      setBusy(false)
    }
  }

  const suggestions = result?.remove ?? []
  return (
    <Modal
      open
      onClose={onClose}
      title={`Trim recall cards: ${title}`}
      wide
      footer={
        result && suggestions.length ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Keep them all
            </Button>
            <Button variant="danger" loading={busy} disabled={!picked.size} onClick={remove}>
              <Scissors className="size-4" /> Remove {picked.size} card{picked.size === 1 ? '' : 's'}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      {failed ? (
        <p className="text-bad">{failed}</p>
      ) : !result ? (
        <div className="flex flex-col gap-2 py-6 text-center text-muted">
          <div className="flex items-center justify-center gap-2">
            Checking which cards are worth keeping <Dots />
          </div>
          <p className="text-[0.85rem]">Only the cards’ text is sent, no slides, so this is cheap.</p>
        </div>
      ) : !suggestions.length ? (
        <p className="py-6 text-center text-muted">
          All {result.total} card{result.total === 1 ? ' looks' : 's look'} worth keeping for the exam. Nothing to trim.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[0.92rem] text-muted">
            {suggestions.length} of {result.total} cards don’t look worth keeping. Untick any you want to keep. Removing a card also takes it out of its topic’s flashcards and your spaced review.
          </p>
          <div className="flex max-h-[55vh] flex-col gap-2 overflow-y-auto pr-1">
            {suggestions.map((s) => {
              const on = picked.has(s.cardId)
              return (
                <button
                  key={s.cardId}
                  onClick={() => toggle(s.cardId)}
                  className={cx('flex items-start gap-3 rounded-xl border p-3 text-left transition-colors', on ? 'border-bad/40 bg-bad-soft/50' : 'border-line bg-surface opacity-70')}
                >
                  <span className={cx('mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border', on ? 'border-bad bg-bad text-white' : 'border-line')}>{on && <Check className="size-3.5" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="mb-1 flex flex-wrap items-center gap-x-2 text-[0.78rem] text-muted">
                      <span className="font-semibold">{s.topicTitle}</span>
                      {s.reason && <span>· {s.reason}</span>}
                    </span>
                    <Markdown className="font-semibold">{s.front}</Markdown>
                    <Markdown className="text-[0.9rem] text-muted">{s.back}</Markdown>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </Modal>
  )
}

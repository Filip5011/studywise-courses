import { create } from 'zustand'
import { Download, Sparkles, Users } from 'lucide-react'
import type { MarketMatch } from '@shared/market'
import { modelLabel } from '@shared/market'
import { matchPercent, modelsText, weekSummary } from '../lib/market'
import { Button, Modal, Pill } from './ui'

// Before planning a week: someone has already published a week made from the
// same slides. Use theirs (no tokens), plan it yourself anyway, or stop.

type Answer = { use: string } | 'plan' | null
interface Ask {
  label: string
  matches: MarketMatch[]
  resolve: (a: Answer) => void
}

const useAsk = create<{ ask: Ask | null }>(() => ({ ask: null }))

/** Resolves to the published week to use, 'plan' to plan it yourself, or null to do neither. */
export function askAboutMatches(label: string, matches: MarketMatch[]): Promise<Answer> {
  return new Promise((resolve) => useAsk.setState({ ask: { label, matches, resolve } }))
}

export function MarketMatchesHost() {
  const ask = useAsk((s) => s.ask)
  const done = (a: Answer) => {
    ask?.resolve(a)
    useAsk.setState({ ask: null })
  }
  return (
    <Modal
      open={!!ask}
      onClose={() => done(null)}
      title={ask ? `Someone has already made ${ask.label}` : ''}
      footer={
        <>
          <Button variant="ghost" onClick={() => done(null)}>
            Cancel
          </Button>
          <Button onClick={() => done('plan')}>
            <Sparkles className="size-4" /> Plan it myself anyway
          </Button>
        </>
      }
    >
      {ask && (
        <div className="flex flex-col gap-3">
          <p className="text-[0.92rem] text-muted">
            {ask.matches.length === 1 ? 'A week on the marketplace was' : `${ask.matches.length} weeks on the marketplace were`} made from the same material. Adding one costs no tokens; planning and writing it yourself does.
          </p>
          {ask.matches.map((m) => (
            <div key={m.week.id} className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2/50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">
                    {m.course.name} · {m.week.label}
                  </div>
                  <div className="flex items-center gap-1.5 text-[0.85rem] text-muted">
                    <Users className="size-3.5" /> {m.week.author}
                    {m.week.mine && ' (you)'} · {m.week.downloads} download{m.week.downloads === 1 ? '' : 's'}
                  </div>
                </div>
                <Pill tone={m.score >= 0.7 ? 'good' : 'accent'}>{m.sameFiles ? `${m.sameFiles} same file${m.sameFiles === 1 ? '' : 's'}` : `${matchPercent(m)} the same`}</Pill>
              </div>
              <div className="text-[0.88rem] text-muted">{weekSummary(m.week)}</div>
              <div className="text-[0.85rem]">
                <span className="text-muted">Written with </span>
                {modelsText(m.week.writtenWith)}
                {m.week.plannedWith && <span className="text-muted"> · planned with {modelLabel(m.week.plannedWith)}</span>}
              </div>
              <div className="text-[0.85rem] text-muted">{m.week.topics.map((t) => t.title).join(' · ')}</div>
              <div>
                <Button variant="primary" size="sm" onClick={() => done({ use: m.week.id })}>
                  <Download className="size-4" /> Use this week
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

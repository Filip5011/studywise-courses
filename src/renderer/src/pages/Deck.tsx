import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { keyLabel } from '@shared/keymap'
import {
  Brain,
  Layers,
  Sparkles,
  Plus,
  Upload,
  Download,
  Settings2,
  Search,
  Trash2,
  FolderInput,
  Pencil,
  MessageCircleQuestion,
  Copy,
  Check,
  Wand2,
  TrendingDown,
  FileText,
  Link2
} from 'lucide-react'
import type { Card as CardT, Deck, CustomAction, ModelChoice, Note } from '@shared/types'
import { TASK_INFO, TASKS, MODEL_ALIASES, EFFORT_LEVELS, OLLAMA_EFFORT_LEVELS, ollamaKey } from '@shared/tasks'
import { OllamaModelOptions, useOllamaModels } from '../components/OllamaModels'
import { DEFAULT_THRESHOLDS } from '@shared/types'
import { useStore, toast } from '../lib/store'
import { IS_MOBILE } from '../lib/platform'
import { api, errorText } from '../lib/api'
import { useCommands, runCommand } from '../lib/commands'
import { confirmDialog, chooseDialog, askText } from '../lib/dialogs'
import { Shell, PageTitle, Stat } from '../components/Shell'
import { Button, Card, Empty, Field, Input, Menu, MenuItem, Modal, Pill, Select, Textarea, cx } from '../components/ui'
import { Markdown } from '../components/Markdown'
import { CardEditor, emptyDraft, type CardDraft } from '../components/CardEditor'

type Stats = Awaited<ReturnType<typeof api.decks.stats>>

export function DeckPage({ id, focusCardId }: { id: string; focusCardId?: string }) {
  const go = useStore((s) => s.go)
  const version = useStore((s) => s.version)
  const openExplain = useStore((s) => s.openExplain)
  const [deck, setDeck] = useState<Deck | null>(null)
  const [cards, setCards] = useState<CardT[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [actions, setActions] = useState<CustomAction[]>([])
  const [q, setQ] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [cursor, setCursor] = useState(0)
  const [editing, setEditing] = useState<CardDraft | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const [d, c, s] = await Promise.all([api.decks.get({ id }), api.cards.list({ deckId: id }), api.decks.stats({ id })])
      setDeck(d)
      setCards(c)
      setStats(s)
    } catch {
      setNotFound(true)
    }
  }, [id])
  useEffect(() => {
    void load()
  }, [load, version])
  useEffect(() => void api.actions.list().then((a) => setActions(a.filter((x) => x.placements.includes('card')))), [])
  useEffect(() => {
    if (!focusCardId || !cards.length) return
    const i = cards.findIndex((c) => c.id === focusCardId)
    if (i >= 0) {
      setCursor(i)
      setTimeout(() => listRef.current?.querySelector(`[data-card="${focusCardId}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 200)
    }
  }, [focusCardId, cards])

  const tags = useMemo(() => [...new Set(cards.flatMap((c) => c.tags))].sort(), [cards])
  const shown = useMemo(() => {
    const ql = q.toLowerCase()
    return cards.filter((c) => (!tag || c.tags.includes(tag)) && (!ql || `${c.front}\n${c.back}\n${c.tags.join(' ')}`.toLowerCase().includes(ql)))
  }, [cards, q, tag])
  const current = shown[Math.min(cursor, shown.length - 1)]

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${cursor}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const deleteIds = async (ids: string[]) => {
    if (!ids.length) return
    if (!(await confirmDialog(`Delete ${ids.length} card${ids.length === 1 ? '' : 's'}?`, undefined, { danger: true, confirmText: 'Delete' }))) return
    await api.cards.delete({ ids })
    setSelected(new Set())
    toast(`Deleted ${ids.length} card${ids.length === 1 ? '' : 's'}`, 'good')
    void load()
  }
  const moveIds = async (ids: string[]) => {
    if (!ids.length) return
    const decks = (await api.decks.list()).filter((d) => d.id !== id)
    if (!decks.length) return toast('Create another deck first', 'info')
    const target = await chooseDialog(`Move ${ids.length} card${ids.length === 1 ? '' : 's'} to…`, decks.map((d) => ({ value: d.id, label: d.name })), { confirmText: 'Move' })
    if (!target) return
    await api.cards.move({ ids, deckId: target })
    setSelected(new Set())
    toast('Moved', 'good')
    void load()
  }
  const duplicate = async (c: CardT) => {
    const { id: _i, position: _p, created_at: _c, updated_at: _u, ...rest } = c
    await api.cards.create({ cards: [rest] })
    void load()
  }
  const explain = (c: CardT) => openExplain({ ctx: { cardId: c.id, deckId: id }, title: c.front.split('\n')[0] })
  const toggle = (cid: string) =>
    setSelected((cur) => {
      const n = new Set(cur)
      if (n.has(cid)) n.delete(cid)
      else n.add(cid)
      return n
    })
  const exportAs = async (format: 'txt' | 'xlsx' | 'json' | 'csv') => {
    try {
      const f = await api.io.exportDeck({ deckId: id, format })
      if (f) toast(`Exported to ${f.split('/').pop()}`, 'good')
    } catch (e) {
      toast(errorText(e), 'bad')
    }
  }
  const importInto = async () => {
    try {
      const n = await api.io.importCards({ deckId: id })
      if (n) {
        toast(`Imported ${n} cards`, 'good')
        void load()
      }
    } catch (e) {
      toast(errorText(e), 'bad')
    }
  }

  useCommands(
    deck
      ? {
          'card.new': () => setEditing(emptyDraft(id, cards[cards.length - 1]?.format)),
          'study.learn': () => go({ name: 'learn', deckId: id }),
          'study.flashcards': () => go({ name: 'flashcards', deckId: id, mode: 'due' }),
          'study.cram': () => go({ name: 'flashcards', deckId: id, mode: 'all' }),
          'study.learnWeak': () => stats?.weakest.length && go({ name: 'learn', deckId: id, cardIds: stats.weakest.map((w) => w.card.id) }),
          'gen.cards': () => useStore.getState().openGenCards({ deckId: id }),
          'io.importCards': importInto,
          'io.exportTxt': () => exportAs('txt'),
          'io.exportXlsx': () => exportAs('xlsx'),
          'io.exportJson': () => exportAs('json'),
          'io.exportCsv': () => exportAs('csv'),
          'learn.settings': () => setSettingsOpen(true),
          search: () => searchRef.current?.focus(),
          'selection.all': () => setSelected(new Set(shown.map((c) => c.id))),
          'selection.delete': () => deleteIds(selected.size ? [...selected] : current ? [current.id] : []),
          'selection.move': () => moveIds(selected.size ? [...selected] : current ? [current.id] : []),
          'item.rename': async () => {
            const name = await askText('Rename deck', { initial: deck.name })
            if (name) await api.decks.update({ id, patch: { name } }).then(load)
          },
          'item.duplicate': () => current && duplicate(current),
          'ai.explain': () => current && explain(current),
          'list.down': () => setCursor((c) => Math.min(shown.length - 1, c + 1)),
          'list.up': () => setCursor((c) => Math.max(0, c - 1)),
          'list.open': () => current && setEditing({ ...current }),
          'list.toggle': () => current && toggle(current.id),
          'list.explain': () => current && explain(current),
          'list.delete': () => current && deleteIds([current.id])
        }
      : {},
    [deck, cards, shown, cursor, selected, stats]
  )

  if (notFound) return <Shell><Empty title="This deck no longer exists" /></Shell>
  if (!deck || !stats) return <Shell><div className="skeleton h-40" /></Shell>

  const max = Math.max(1, ...stats.activity.map((a) => a.count))

  return (
    <Shell>
      <PageTitle
        eyebrow={
          <button onClick={() => go({ name: 'decks' })} className="hover:text-ink">
            ← Decks
          </button>
        }
        title={deck.name}
        actions={
          <>
            <Button variant="primary" size="lg" onClick={() => go({ name: 'learn', deckId: id })} disabled={!cards.length} kbd="study.learn">
              Learn
            </Button>
            <Button size="lg" onClick={() => go({ name: 'flashcards', deckId: id, mode: 'due' })} disabled={!cards.length} kbd="study.flashcards">
              Flashcards
            </Button>
            <Menu
              trigger={(t) => (
                <Button size="lg" variant="ghost" onClick={t} aria-label="More">
                  More
                </Button>
              )}
            >
              {(close) => (
                <>
                  <MenuItem kbd="gen.cards" onClick={() => (close(), runCommand('gen.cards'))}>
                    Generate cards with AI
                  </MenuItem>
                  <MenuItem desktopOnly kbd="io.importCards" onClick={() => (close(), importInto())}>
                    Import cards (.txt .xlsx .csv .json .apkg)
                  </MenuItem>
                  <MenuItem desktopOnly kbd="io.exportTxt" onClick={() => (close(), exportAs('txt'))}>
                    Export StudySmarter text
                  </MenuItem>
                  <MenuItem desktopOnly kbd="io.exportXlsx" onClick={() => (close(), exportAs('xlsx'))}>
                    Export StudySmarter Excel
                  </MenuItem>
                  <MenuItem desktopOnly onClick={() => (close(), exportAs('json'))}>
                    Export JSON
                  </MenuItem>
                  <MenuItem desktopOnly onClick={() => (close(), exportAs('csv'))}>
                    Export CSV
                  </MenuItem>
                  <MenuItem kbd="learn.settings" onClick={() => (close(), setSettingsOpen(true))}>
                    Deck settings & AI
                  </MenuItem>
                </>
              )}
            </Menu>
          </>
        }
      >
        {deck.description}
      </PageTitle>

      <div className="flex flex-wrap items-end gap-x-10 gap-y-4 border-y border-line py-4">
        <Figure label="Due today" value={stats.due} accent />
        <Figure label="Cards" value={stats.total} />
        <Figure label="Mastery" value={`${Math.round(stats.mastery * 100)}%`} />
        <Figure label="Reviewed" value={stats.reviewed} />
        <div className="ml-auto flex flex-col gap-1.5">
          <span className="text-[0.8rem] text-muted">Last 7 days</span>
          <div className="flex h-9 items-stretch gap-1">
            {stats.activity.map((a) => (
              <div key={a.date} className="relative w-3.5" title={`${new Date(a.date + 'T12:00').toLocaleDateString(undefined, { weekday: 'short' })}: ${a.count} reviews`}>
                <div className="absolute inset-x-0 bottom-0 rounded-sm bg-accent" style={{ height: `${a.count ? Math.max(12, (a.count / max) * 100) : 6}%`, opacity: a.count ? 1 : 0.18 }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {stats.weakest.length > 0 && (
        <section className="mt-8">
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="text-[0.85rem] font-medium text-muted">Weakest cards</h2>
            <button onClick={() => runCommand('study.learnWeak')} className="text-[0.85rem] text-accent hover:underline">
              Learn these
            </button>
          </div>
          <div className="border-t border-line">
            {stats.weakest.map((w) => (
              <div key={w.card.id} onClick={() => setEditing({ ...w.card })} className="-mx-3 flex cursor-pointer items-center gap-4 rounded-md border-b border-line px-3 py-2 text-[0.93rem] hover:bg-surface-2/70">
                <span className="min-w-0 flex-1 truncate">{w.card.front}</span>
                <span className="tabular text-[0.85rem] text-muted">
                  {w.lapses} lapse{w.lapses === 1 ? '' : 's'}
                  {w.difficulty != null ? ` · difficulty ${w.difficulty.toFixed(2)}` : ''}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <div className="sticky top-0 z-10 -mx-2 mb-3 flex flex-wrap items-center gap-2 bg-bg/85 px-2 py-2 backdrop-blur">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
            <Input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={IS_MOBILE ? `Search ${cards.length} cards…` : keyLabel(`Search ${cards.length} cards…  (⌘F)`)} className="pl-10" onKeyDown={(e) => e.key === 'Escape' && (e.currentTarget.blur(), setQ(''))} />
          </div>
          {selected.size > 0 ? (
            <div className="pop-in flex items-center gap-2">
              <Pill tone="accent">{selected.size} selected</Pill>
              <Button size="sm" onClick={() => moveIds([...selected])}>
                Move
              </Button>
              <Button size="sm" variant="danger" onClick={() => deleteIds([...selected])}>
                Delete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          ) : (
            <Button variant="primary" onClick={() => runCommand('card.new')} kbd="card.new">
              Add card
            </Button>
          )}
        </div>
        {tags.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            <button onClick={() => setTag(null)} className={cx('rounded-full px-3 py-1 text-[0.82rem] font-semibold transition-colors', !tag ? 'bg-ink text-bg' : 'bg-surface-2 text-muted hover:text-ink')}>
              All
            </button>
            {tags.map((t) => (
              <button key={t} onClick={() => setTag(tag === t ? null : t)} className={cx('rounded-full px-3 py-1 text-[0.82rem] font-semibold transition-colors', tag === t ? 'bg-ink text-bg' : 'bg-surface-2 text-muted hover:text-ink')}>
                #{t}
              </button>
            ))}
          </div>
        )}
        {cards.length === 0 ? (
          <Empty title="This deck is empty">
            Add cards by hand, import a StudySmarter export, or let AI make them from your notes or a PDF.
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => runCommand('gen.cards')}>
                Generate with AI
              </Button>
              <Button onClick={() => runCommand('card.new')}>Add a card</Button>
              <Button className="desktop-only" onClick={importInto}>Import</Button>
            </div>
          </Empty>
        ) : (
          <div ref={listRef} className="flex flex-col border-t border-line">
            {shown.map((c, i) => (
              <div
                key={c.id}
                data-i={i}
                data-card={c.id}
                onClick={() => setCursor(i)}
                onDoubleClick={() => setEditing({ ...c })}
                className={cx(
                  'group -mx-3 grid grid-cols-[auto_1fr] gap-3 rounded-md border-b border-line px-3 py-3 transition-colors md:grid-cols-[auto_1fr_1fr_auto]',
                  i === cursor ? 'bg-accent-soft/50' : 'hover:bg-surface-2/60',
                  selected.has(c.id) && 'bg-accent-soft/50'
                )}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle(c.id)
                  }}
                  className={cx('mt-0.5 grid size-5 place-items-center rounded-md border transition-colors', selected.has(c.id) ? 'border-accent bg-accent text-accent-ink' : 'border-line opacity-60 group-hover:opacity-100')}
                  aria-label="Select card"
                >
                  {selected.has(c.id) && <Check className="size-3.5" />}
                </button>
                <div className="min-w-0">
                  <Markdown className="font-medium">{c.front}</Markdown>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {c.kind !== 'regular' && <Pill tone="accent">{c.kind === 'cloze' ? 'Cloze' : 'Multiple choice'}</Pill>}
                    {c.required_points != null && <Pill>({c.required_points}) points</Pill>}
                    {c.tags.map((t) => (
                      <Pill key={t}>#{t}</Pill>
                    ))}
                    {c.source?.type === 'note' && <Pill><FileText className="size-3" /> {c.source.section ?? 'note'}</Pill>}
                  </div>
                </div>
                <div className="col-span-2 min-w-0 text-[0.94rem] md:col-span-1">
                  {c.kind === 'multiple_choice' ? (
                    <ul className="flex flex-col gap-1">
                      {c.options.map((o, j) => (
                        <li key={j} className={cx('rounded-lg px-2 py-0.5', o.correct && 'bg-good-soft font-semibold text-good')}>
                          {o.text}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Markdown>{c.back}</Markdown>
                  )}
                </div>
                <div className="col-span-2 flex items-start justify-end gap-1 opacity-100 transition-opacity md:col-span-1 md:opacity-0 md:group-hover:opacity-100">
                  <Button size="icon" variant="ghost" onClick={() => explain(c)} title="Explain (E)">
                    <MessageCircleQuestion className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditing({ ...c })} title="Edit (↩)">
                    <Pencil className="size-4" />
                  </Button>
                  <Menu
                    trigger={(t) => (
                      <Button size="icon" variant="ghost" onClick={t} title="More">
                        <Wand2 className="size-4" />
                      </Button>
                    )}
                  >
                    {(close) => (
                      <>
                        {actions.map((a) => (
                          <MenuItem key={a.id} onClick={() => (close(), openExplain({ ctx: { cardId: c.id, deckId: id }, title: c.front.split('\n')[0], action: { id: a.id, name: a.name } }))}>
                            {a.name}
                          </MenuItem>
                        ))}
                        <MenuItem kbd="item.duplicate" onClick={() => (close(), duplicate(c))}>
                          Duplicate
                        </MenuItem>
                        <MenuItem onClick={() => (close(), moveIds([c.id]))}>
                          Move to deck
                        </MenuItem>
                        <MenuItem danger onClick={() => (close(), deleteIds([c.id]))}>
                          Delete
                        </MenuItem>
                      </>
                    )}
                  </Menu>
                </div>
              </div>
            ))}
            {shown.length === 0 && <div className="py-10 text-center text-muted">No cards match.</div>}
          </div>
        )}
      </section>

      {editing && (
        <CardEditor
          draft={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            toast('Card saved', 'good')
            void load()
          }}
        />
      )}
      {settingsOpen && <DeckSettings deck={deck} onClose={() => setSettingsOpen(false)} onSaved={load} />}
    </Shell>
  )
}

function Figure({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-[0.8rem] text-muted">{label}</span>
      <span className={cx('tabular text-[1.4rem] leading-tight font-semibold tracking-tight', accent && 'text-accent')}>{value}</span>
    </div>
  )
}

/** Deck settings. With courseId it edits the AI settings every week deck of that course shares. */
export function DeckSettings({ deck, onClose, onSaved, courseId }: { deck: Deck; onClose: () => void; onSaved: () => void; courseId?: string }) {
  const [name, setName] = useState(deck.name)
  const [description, setDescription] = useState(deck.description)
  const [extra, setExtra] = useState(deck.extra_instructions)
  const [overrides, setOverrides] = useState<Record<string, ModelChoice>>(deck.model_overrides)
  const ai = useStore((s) => s.ai)
  const ollama = ai?.provider === 'ollama'
  const { models: ollamaList } = useOllamaModels(ollama)
  const [th, setTh] = useState(deck.thresholds ?? DEFAULT_THRESHOLDS)
  const [customTh, setCustomTh] = useState(!!deck.thresholds)
  const [notes, setNotes] = useState<Omit<Note, 'content'>[]>([])
  const [linked, setLinked] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (courseId) return
    void api.notes.list().then((n) => {
      setNotes(n)
      setLinked(new Set(n.filter((x) => x.deck_ids.includes(deck.id)).map((x) => x.id)))
    })
  }, [deck.id, courseId])

  const save = async () => {
    const clean = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v.model))
    if (courseId) await api.courses.setDeckSettings({ courseId, extra_instructions: extra, model_overrides: clean, thresholds: customTh ? th : null })
    else await api.decks.update({ id: deck.id, patch: { name, description, extra_instructions: extra, model_overrides: clean, thresholds: customTh ? th : null } })
    toast(courseId ? 'Course settings saved' : 'Deck settings saved', 'good')
    onSaved()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={courseId ? `${deck.name}: models & instructions` : 'Deck settings & AI'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {courseId ? (
          <p className="text-[0.9rem] text-muted">These apply to the whole course: planning, writing topics, marking, and every week’s flashcard deck.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Description">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </div>
        )}
        <Field label={courseId ? 'Extra instructions for every AI prompt in this course' : 'Extra instructions for every AI prompt in this deck'} hint="e.g. “Use SI units”, “I’m studying for A-level Physics (AQA)”, “Answer in German”">
          <Textarea rows={3} value={extra} onChange={(e) => setExtra(e.target.value)} />
        </Field>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[0.8rem] font-semibold text-muted">Marking thresholds (free answer, out of 10)</span>
            <label className="flex items-center gap-2 text-[0.85rem]">
              <input type="checkbox" checked={customTh} onChange={(e) => setCustomTh(e.target.checked)} /> Override global
            </label>
          </div>
          <div className={cx('grid grid-cols-2 gap-3', !customTh && 'pointer-events-none opacity-50')}>
            <Field label={`Correct at ≥ ${th.correct}`}>
              <input type="range" min={1} max={10} value={th.correct} onChange={(e) => setTh({ ...th, correct: Number(e.target.value) })} className="accent-[var(--accent)]" />
            </Field>
            <Field label={`Partial at ≥ ${th.partial}`}>
              <input type="range" min={0} max={9} value={th.partial} onChange={(e) => setTh({ ...th, partial: Math.min(Number(e.target.value), th.correct - 1) })} className="accent-[var(--accent)]" />
            </Field>
          </div>
        </div>
        {!courseId && <div>
          <div className="mb-2 flex items-center gap-2 text-[0.8rem] font-semibold text-muted">
            <Link2 className="size-3.5" /> Linked notes (used as context for Explain)
          </div>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {notes.length === 0 && <span className="text-muted">No notes yet.</span>}
            {notes.map((n) => {
              const on = linked.has(n.id)
              return (
                <button
                  key={n.id}
                  onClick={async () => {
                    await api.notes.linkDeck({ noteId: n.id, deckId: deck.id, linked: !on })
                    setLinked((cur) => {
                      const s = new Set(cur)
                      if (on) s.delete(n.id)
                      else s.add(n.id)
                      return s
                    })
                  }}
                  className={cx('rounded-full px-3 py-1 text-[0.85rem] font-medium transition-colors', on ? 'bg-accent text-accent-ink' : 'bg-surface-2 hover:bg-accent-soft')}
                >
                  {n.title}
                </button>
              )
            })}
          </div>
        </div>}
        <div>
          <div className="mb-2 text-[0.8rem] font-semibold text-muted">Model overrides for this {courseId ? 'course' : 'deck'}{ollama ? ' (Ollama)' : ''}</div>
          {ollama ? (
            <div className="overflow-hidden rounded-lg border border-line">
              {TASKS.filter((t) => t !== 'custom_action').map((t) => {
                const k = ollamaKey(t)
                return (
                  <div key={t} className="grid grid-cols-[1fr_180px_120px] items-center gap-2 border-b border-line px-3 py-1.5 last:border-0 max-sm:grid-cols-1">
                    <span className="text-[0.9rem]">{TASK_INFO[t].label}</span>
                    <Select value={overrides[k]?.model ?? ''} onChange={(e) => setOverrides({ ...overrides, [k]: { model: e.target.value, effort: overrides[k]?.effort ?? null } })} className="h-8 text-[0.85rem]">
                      <option value="">Default</option>
                      <OllamaModelOptions models={ollamaList ?? []} saved={ai?.ollama.saved ?? []} current={overrides[k]?.model} />
                    </Select>
                    <Select
                      value={overrides[k]?.effort ?? ''}
                      disabled={!overrides[k]?.model}
                      onChange={(e) => setOverrides({ ...overrides, [k]: { model: overrides[k]?.model ?? '', effort: e.target.value || null } })}
                      className="h-8 text-[0.85rem]"
                    >
                      <option value="">Thinking</option>
                      {OLLAMA_EFFORT_LEVELS.map((m) => (
                        <option key={m} value={m}>
                          {m === 'off' ? 'Off' : m}
                        </option>
                      ))}
                    </Select>
                  </div>
                )
              })}
            </div>
          ) : (
          <div className="overflow-hidden rounded-lg border border-line">
            {TASKS.filter((t) => t !== 'custom_action').map((t) => (
              <div key={t} className="grid grid-cols-[1fr_140px_120px] items-center gap-2 border-b border-line px-3 py-1.5 last:border-0 max-sm:grid-cols-1">
                <span className="text-[0.9rem]">{TASK_INFO[t].label}</span>
                <Select value={overrides[t]?.model ?? ''} onChange={(e) => setOverrides({ ...overrides, [t]: { model: e.target.value, effort: overrides[t]?.effort ?? null } })} className="h-8 text-[0.85rem]">
                  <option value="">Default</option>
                  {MODEL_ALIASES.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </Select>
                <Select
                  value={overrides[t]?.effort ?? ''}
                  disabled={!overrides[t]?.model}
                  onChange={(e) => setOverrides({ ...overrides, [t]: { model: overrides[t]?.model ?? '', effort: e.target.value || null } })}
                  className="h-8 text-[0.85rem]"
                >
                  <option value="">Effort</option>
                  {EFFORT_LEVELS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </Select>
              </div>
            ))}
          </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

import { useEffect, useState } from 'react'
import { SlidersHorizontal, Sparkles, Play, Layers, MoreHorizontal, Pencil, Trash2, Plus, ChevronRight, Download, BellOff } from 'lucide-react'
import { importSharedWeek } from '../lib/weekShare'
import type { CourseFull, WeekFull } from '@shared/course'
import { useStore, toast } from '../lib/store'
import { api, errorText } from '../lib/api'
import { askText, confirmDialog } from '../lib/dialogs'
import { Shell, PageTitle } from '../components/Shell'
import { Button, Field, Input, Menu, MenuItem, Modal, Pill, ProgressBar, Textarea } from '../components/ui'
import { FileDrop } from './Courses'
import { runningJob } from './Week'
import { DeckSettings } from './Deck'
import type { Deck } from '@shared/types'

export function CoursePage({ id }: { id: string }) {
  const go = useStore((s) => s.go)
  const version = useStore((s) => s.version)
  const [c, setC] = useState<CourseFull | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [aiDeck, setAiDeck] = useState<Deck | null>(null)
  const load = () =>
    api.courses
      .get({ id })
      .then(setC)
      .catch((e) => setError(errorText(e)))
  useEffect(() => void load(), [id, version])

  if (error)
    return (
      <Shell>
        <p className="text-muted">{error}</p>
      </Shell>
    )
  if (!c) return null

  const topics = c.weeks.flatMap((w) => w.topics)
  const write = async (topicIds: string[]) => {
    try {
      await api.courses.write({ topicIds })
      void load()
    } catch (e) {
      toast(errorText(e), 'bad')
    }
  }
  const rename = async () => {
    const name = await askText('Rename course', { initial: c.name, confirmText: 'Rename' })
    if (name) await api.courses.rename({ id, name }).then(load)
  }
  const del = async () => {
    if (!(await confirmDialog(`Delete ${c.name}?`, 'All weeks, topics, figures and copies of your files go. Its flashcard folder and week decks go too.', { confirmText: 'Delete', danger: true }))) return
    await api.courses.delete({ id, keepDeck: false })
    useStore.getState().bump()
    go({ name: 'courses' })
  }

  // Course-wide Models & instructions, shared by every week deck.
  const openAiSettings = async () => {
    const s = await api.courses.deckSettings({ courseId: c.id })
    const t = new Date().toISOString()
    setAiDeck({ id: '', folder_id: c.deck_folder_id, name: c.name, description: '', learn_settings: null, created_at: t, updated_at: t, ...s })
  }

  const unwritten = topics.filter((t) => t.status === 'planned' || t.status === 'error')
  const done = topics.filter((t) => t.progress.done).length
  const minutes = topics.reduce((n, t) => n + (t.plan.minutes || 0), 0)
  const next = topics.find((t) => t.status === 'ready' && !t.progress.done)

  return (
    <Shell>
      <PageTitle
        eyebrow={
          <button className="hover:text-ink" onClick={() => go({ name: 'courses' })}>
            Courses
          </button>
        }
        title={c.name}
        actions={
          <>
            {next && (
              <Button variant="primary" onClick={() => go({ name: 'topic', id: next.id })}>
                <Play className="size-4" /> {next.progress.section > 0 ? 'Continue' : 'Start'} {next.content?.title ?? next.plan.title}
              </Button>
            )}
            {unwritten.length > 0 && (
              <Button variant={next ? 'outline' : 'primary'} onClick={() => write(unwritten.map((t) => t.id))}>
                <Sparkles className="size-4" /> Write {unwritten.length} topic{unwritten.length === 1 ? '' : 's'}
              </Button>
            )}
            {topics.some((t) => t.card_count > 0) && (
              <Button variant="outline" onClick={() => go({ name: 'flashcards', deckId: '', mode: 'due', courseId: c.id })} title="Due cards from every week">
                <Layers className="size-4" /> Recall cards
              </Button>
            )}
            <Menu
              trigger={(open) => (
                <Button variant="ghost" size="icon" onClick={open} aria-label="More">
                  <MoreHorizontal className="size-5" />
                </Button>
              )}
            >
              {(close) => (
                <>
                  <MenuItem icon={<Plus className="size-4" />} onClick={() => (close(), setAdding(true))}>
                    Add a week
                  </MenuItem>
                  <MenuItem desktopOnly icon={<Download className="size-4" />} onClick={() => (close(), void importSharedWeek({ courseId: id }))}>
                    Add a shared week…
                  </MenuItem>
                  <MenuItem icon={<SlidersHorizontal className="size-4" />} onClick={() => (close(), void openAiSettings())}>
                    Models &amp; instructions
                  </MenuItem>
                  <MenuItem icon={<Pencil className="size-4" />} onClick={() => (close(), void rename())}>
                    Rename course
                  </MenuItem>
                  {c.deck_folder_id && (
                    <MenuItem icon={<Layers className="size-4" />} onClick={() => (close(), go({ name: 'decks', folderId: c.deck_folder_id }))}>
                      Open flashcard folder
                    </MenuItem>
                  )}
                  <MenuItem danger icon={<Trash2 className="size-4" />} onClick={() => (close(), void del())}>
                    Delete course
                  </MenuItem>
                </>
              )}
            </Menu>
          </>
        }
      >
        <span>
          {c.weeks.length} week{c.weeks.length === 1 ? '' : 's'}
          {topics.length > 0 && ` · ${topics.length} topics · about ${Math.round(minutes / 5) * 5 || minutes} minutes · ${done} done`}
        </span>
      </PageTitle>

      {topics.length > 0 && <ProgressBar value={done / topics.length} className="mb-8" />}

      {c.weeks.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {c.weeks.map((w) => (
            <WeekRow key={w.id} c={c} w={w} />
          ))}
        </ul>
      )}

      <button
        onClick={() => setAdding(true)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line py-5 font-semibold text-muted transition-colors hover:border-accent hover:text-accent"
      >
        <Plus className="size-5" /> Add {c.weeks.length ? 'next week' : 'the first week'}
      </button>

      {aiDeck && <DeckSettings deck={aiDeck} courseId={c.id} onClose={() => setAiDeck(null)} onSaved={() => setAiDeck(null)} />}

      {adding && (
        <AddWeekModal
          courseId={c.id}
          defaultLabel={`Week ${c.weeks.length + 1}`}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false)
            void load()
          }}
        />
      )}
    </Shell>
  )
}

function WeekRow({ c, w }: { c: CourseFull; w: WeekFull }) {
  const go = useStore((s) => s.go)
  const jobs = useStore((s) => s.jobs)
  const planning = w.status === 'planning' || !!runningJob(jobs, 'course_outline', 'weekId', w.id)
  const writing = w.topics.filter((t) => t.status === 'writing' || runningJob(jobs, 'course_topic', 'topicId', t.id)).length
  const ready = w.topics.filter((t) => t.status === 'ready').length
  const done = w.topics.filter((t) => t.progress.done).length
  const status = planning
    ? { text: 'Planning…', tone: 'accent' as const }
    : w.status === 'error'
      ? { text: 'Planning failed', tone: 'bad' as const }
      : writing
        ? { text: `Writing ${writing}…`, tone: 'accent' as const }
        : !w.topics.length
          ? { text: w.files.length ? 'Not planned' : 'No files', tone: 'muted' as const }
          : done === w.topics.length
            ? { text: 'Done', tone: 'good' as const }
            : ready < w.topics.length
              ? { text: `${ready}/${w.topics.length} written`, tone: 'muted' as const }
              : null
  const facts = [
    w.topics.length ? `${w.topics.length} topic${w.topics.length === 1 ? '' : 's'}${done ? ` · ${done} done` : ''}` : null,
    `${w.files.length} file${w.files.length === 1 ? '' : 's'}`,
    w.card_count ? `${w.card_count} flashcard${w.card_count === 1 ? '' : 's'}` : null
  ].filter(Boolean)
  return (
    <li>
      <button
        onClick={() => go({ name: 'week', courseId: c.id, weekId: w.id })}
        className="group flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-surface-2 sm:px-5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{w.label}</span>
            {w.recall_off && (
              <span className="shrink-0" title="Recall is off for this week: its cards don’t come up in recall or review. Turn it back on from the week’s ⋯ menu.">
                <Pill>
                  <BellOff className="size-3" /> Recall off
                </Pill>
              </span>
            )}
            {status && (
              <Pill tone={status.tone === 'muted' ? 'neutral' : status.tone}>{status.text}</Pill>
            )}
          </div>
          <div className="mt-0.5 truncate text-[0.88rem] text-muted">{facts.join(' · ')}</div>
        </div>
        {w.topics.length > 0 && <ProgressBar value={done / w.topics.length} className="hidden h-1.5 w-28 shrink-0 sm:block" />}
        <ChevronRight className="size-4 shrink-0 text-muted transition-transform duration-200 group-hover:translate-x-0.5" />
      </button>
    </li>
  )
}

function AddWeekModal({ courseId, defaultLabel, onClose, onDone }: { courseId: string; defaultLabel: string; onClose: () => void; onDone: () => void }) {
  const [label, setLabel] = useState(defaultLabel)
  const [files, setFiles] = useState<string[]>([])
  const [instructions, setInstructions] = useState('')
  const [busy, setBusy] = useState(false)
  const create = async () => {
    setBusy(true)
    try {
      await api.courses.addWeek({ courseId, label: label.trim(), files, instructions })
      onDone()
    } catch (e) {
      toast(errorText(e), 'bad')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Add a week"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={create}>
            {files.length ? 'Add and plan topics' : 'Add week'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name">
          <Input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Week 3, Reading week, Revision…" />
        </Field>
        <Field label="Files" hint="This week’s slides, lecture transcripts and readings. Claude plans its topics from these, knowing what earlier weeks already covered.">
          <FileDrop list={files} setList={setFiles} />
        </Field>
        <Field label="Anything else? (optional)" hint="e.g. “The second lecture was a guest talk, skip it”.">
          <Textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

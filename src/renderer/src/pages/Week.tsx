import { useEffect, useState } from 'react'
import {
  Scissors,
  BellOff,
  BellRing,
  AlertTriangle,
  Captions,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  FileText,
  FolderOpen,
  Layers,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  Play,
  Plus,
  Presentation,
  RefreshCw,
  RotateCcw,
  Share2,
  Store,
  Sparkles,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import { NOTE_LEVEL_INFO, type CourseFile, type CourseFull, type Topic, type WeekFull } from '@shared/course'
import { offerPlan, switchLevel, writeTopics } from '../lib/courseFlows'
import { planUsageText, type JobInfo } from '@shared/types'
import { shareWeek } from '../lib/weekShare'
import { publishToMarket } from '../lib/market'
import { useStore, toast } from '../lib/store'
import { api, errorText } from '../lib/api'
import { askText, confirmDialog } from '../lib/dialogs'
import { Shell, PageTitle } from '../components/Shell'
import { Button, Dots, Menu, MenuItem, Pill, ProgressBar, Segmented, cx } from '../components/ui'
import { TrimCardsModal } from '../components/TrimCards'
import { JobLive } from '../components/JobLive'
import { IS_MOBILE } from '../lib/platform'

export const runningJob = (jobs: JobInfo[], kind: JobInfo['kind'], key: string, value: string) => jobs.find((j) => j.kind === kind && j.status === 'running' && j.meta?.[key] === value)

/** One week of a course: its topics (with their sections), its files and its flashcards. */
export function WeekPage({ courseId, weekId }: { courseId: string; weekId: string }) {
  const go = useStore((s) => s.go)
  // Course jobs bump `version` when they start and finish, so topics written in
  // the background show up without leaving the page.
  const version = useStore((s) => s.version)
  const [c, setC] = useState<CourseFull | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = () =>
    api.courses
      .get({ id: courseId })
      .then(setC)
      .catch((e) => setError(errorText(e)))
  useEffect(() => void load(), [courseId, version])

  if (error)
    return (
      <Shell>
        <p className="text-muted">{error}</p>
      </Shell>
    )
  if (!c) return null
  const idx = c.weeks.findIndex((w) => w.id === weekId)
  const w = c.weeks[idx]
  if (!w)
    return (
      <Shell>
        <p className="text-muted">This week isn’t in the course any more.</p>
        <Button className="mt-4" variant="outline" onClick={() => go({ name: 'course', id: courseId })}>
          Back to {c.name}
        </Button>
      </Shell>
    )
  const prev = c.weeks[idx - 1]
  const next = c.weeks[idx + 1]
  return <WeekView key={w.id} course={c} week={w} prev={prev} next={next} reload={load} />
}

function WeekView({ course: c, week: w, prev, next, reload }: { course: CourseFull; week: WeekFull; prev?: WeekFull; next?: WeekFull; reload: () => void }) {
  const go = useStore((s) => s.go)
  const jobs = useStore((s) => s.jobs)
  const planJob = runningJob(jobs, 'course_outline', 'weekId', w.id)
  const planning = w.status === 'planning' || !!planJob
  const unwritten = w.topics.filter((t) => t.status === 'planned' || t.status === 'error')
  const done = w.topics.filter((t) => t.progress.done).length
  const nextUp = w.topics.find((t) => t.status === 'ready' && !t.progress.done)
  // Trimming recall cards: the whole week, or one topic.
  const [trim, setTrim] = useState<{ topicId?: string; title: string } | null>(null)
  const toggleRecall = async () => {
    try {
      await api.courses.setWeekRecall({ weekId: w.id, on: w.recall_off })
      toast(w.recall_off ? `Recall is back on for ${w.label}` : `Recall off for ${w.label}: its cards won’t come up in recall, course review or due counts. Nothing is deleted.`, 'good')
      useStore.getState().bump()
      reload()
    } catch (e) {
      toast(errorText(e), 'bad')
    }
  }
  const minutes = w.topics.reduce((n, t) => n + (t.plan.minutes || 0), 0)

  // Pick the level(s) of detail first; every level written is kept.
  const write = async (topics: Topic[]) => {
    if (await writeTopics(topics)) reload()
  }
  // Planning always asks first, with room for instructions that take priority.
  const plan = async () => {
    if (await offerPlan(w)) reload()
  }
  const addFiles = async () => {
    const files = await api.app.pickFiles({ kind: 'course' })
    if (!files.length) return
    const n = (await api.courses.addFiles({ weekId: w.id, files })).length - w.files.length
    reload()
    if (n <= 0) return toast('None of those files can be added to a week.', 'bad')
    // Adding files doesn't plan by itself: ask.
    if (await offerPlan(w, { added: n })) reload()
  }
  const rename = async () => {
    const label = await askText('Rename week', { initial: w.label, confirmText: 'Rename' })
    if (label) await api.courses.renameWeek({ weekId: w.id, label }).then(reload)
  }
  const del = async () => {
    if (!(await confirmDialog(`Delete ${w.label}?`, 'Its files, topics and their recall cards go.', { confirmText: 'Delete week', danger: true }))) return
    await api.courses.deleteWeek({ weekId: w.id })
    useStore.getState().bump()
    go({ name: 'course', id: c.id })
  }
  const saveNote = async (t: Topic) => {
    // Notes are made when the topic is written; this also makes them if they were deleted.
    const noteId = await api.courses.saveNote({ topicId: t.id })
    go({ name: 'notes', id: noteId })
  }

  return (
    <Shell>
      <PageTitle
        eyebrow={
          <span className="flex min-w-0 items-center gap-1.5">
            <button className="hover:text-ink" onClick={() => go({ name: 'courses' })}>
              Courses
            </button>
            <ChevronRight className="size-3.5 shrink-0" />
            <button className="truncate hover:text-ink" onClick={() => go({ name: 'course', id: c.id })}>
              {c.name}
            </button>
          </span>
        }
        title={w.label}
        actions={
          <>
            {nextUp && (
              <Button variant="primary" onClick={() => go({ name: 'topic', id: nextUp.id })}>
                <Play className="size-4" /> {nextUp.progress.section > 0 || nextUp.progress.step ? 'Continue' : 'Start'} {nextUp.content?.title ?? nextUp.plan.title}
              </Button>
            )}
            {!planning && w.files.length > 0 && !w.topics.length && w.status !== 'error' && (
              <Button variant="primary" onClick={plan}>
                <Sparkles className="size-4" /> Plan topics
              </Button>
            )}
            {!planning && unwritten.length > 0 && (
              <Button variant={nextUp ? 'outline' : 'primary'} onClick={() => write(unwritten)}>
                <Sparkles className="size-4" /> Write {unwritten.length === w.topics.length ? `all ${unwritten.length}` : `${unwritten.length} more`}
              </Button>
            )}
            <Menu
              trigger={(open) => (
                <Button variant="ghost" size="icon" onClick={open} aria-label={`${w.label} options`}>
                  <MoreHorizontal className="size-5" />
                </Button>
              )}
            >
              {(close) => (
                <>
                  <MenuItem desktopOnly icon={<Upload className="size-4" />} onClick={() => (close(), void addFiles())}>
                    Add files
                  </MenuItem>
                  {w.files.length > 0 && !planning && (
                    <MenuItem icon={<RefreshCw className="size-4" />} onClick={() => (close(), void plan())}>
                      {w.topics.length ? 'Plan again' : 'Plan topics'}
                    </MenuItem>
                  )}
                  {w.card_count > 0 && (
                    <MenuItem icon={<Scissors className="size-4" />} onClick={() => (close(), setTrim({ title: w.label }))}>
                      Trim recall cards…
                    </MenuItem>
                  )}
                  <MenuItem icon={w.recall_off ? <BellRing className="size-4" /> : <BellOff className="size-4" />} onClick={() => (close(), void toggleRecall())}>
                    {w.recall_off ? 'Turn recall back on' : 'Turn off recall for this week'}
                  </MenuItem>
                  <MenuItem icon={<Share2 className="size-4" />} onClick={() => (close(), void shareWeek(w.id))}>
                    Share this week…
                  </MenuItem>
                  {w.topics.some((t) => t.status === 'ready') && (
                    <MenuItem desktopOnly icon={<Store className="size-4" />} onClick={() => (close(), void publishToMarket(w))}>
                      Publish to marketplace…
                    </MenuItem>
                  )}
                  <MenuItem icon={<Pencil className="size-4" />} onClick={() => (close(), void rename())}>
                    Rename week
                  </MenuItem>
                  <MenuItem danger icon={<Trash2 className="size-4" />} onClick={() => (close(), void del())}>
                    Delete week
                  </MenuItem>
                </>
              )}
            </Menu>
          </>
        }
      >
        <span>
          {w.topics.length ? `${w.topics.length} topic${w.topics.length === 1 ? '' : 's'} · about ${Math.round(minutes / 5) * 5 || minutes} minutes · ${done} done` : 'No topics yet'}
          {` · ${w.files.length} file${w.files.length === 1 ? '' : 's'} · ${w.card_count} flashcard${w.card_count === 1 ? '' : 's'}`}
        </span>
        {w.recall_off && (
          <button onClick={() => void toggleRecall()} className="ml-2 align-middle" title="Its cards don’t come up in recall, course review or due counts. Click to turn recall back on.">
            <Pill>
              <BellOff className="size-3" /> Recall off · turn on
            </Pill>
          </button>
        )}
      </PageTitle>

      {w.topics.length > 0 && <ProgressBar value={done / w.topics.length} className="mb-8" />}

      <div className="flex flex-col gap-10">
        <section>
          <h2 className="mb-3 text-[1.1rem] font-semibold tracking-tight">Topics</h2>
          {planning && (
            <div className="rounded-xl border border-line bg-surface p-5">
              <div className="flex items-center gap-2 font-semibold">
                <Sparkles className="size-4 text-accent" /> Planning {w.label} <Dots />
              </div>
              <p className="mt-1 text-[0.9rem] text-muted">This takes a minute or two. You can leave this page; it keeps going.</p>
              <div className="mt-4">
                {planJob ? (
                  <JobLive job={planJob} />
                ) : (
                  <div className="flex flex-col gap-2">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="skeleton h-14" />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          {w.status === 'error' && !planning && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-bad/40 bg-bad-soft px-5 py-4">
              <AlertTriangle className="size-5 text-bad" />
              <div className="min-w-0 flex-1 text-[0.92rem]">
                <div className="font-semibold">Planning didn’t finish</div>
                <div className="text-muted">{w.error}</div>
              </div>
              <Button size="sm" variant="ink" onClick={plan}>
                Try again
              </Button>
            </div>
          )}
          {!planning && w.topics.length > 0 && (
            <ol className="flex flex-col gap-2">
              {w.topics.map((t) => (
                <TopicRow key={t.id} t={t} write={write} saveNote={saveNote} reload={reload} onTrim={() => setTrim({ topicId: t.id, title: t.content?.title ?? t.plan.title })} />
              ))}
            </ol>
          )}
          {!planning && !w.topics.length && w.status !== 'error' && (
            <p className="rounded-xl border border-dashed border-line px-5 py-6 text-center text-[0.92rem] text-muted">
              {w.files.length ? 'Plan this week to split its files into topics you learn in short sections.' : 'Add this week’s files, then plan its topics.'}
            </p>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-[1.1rem] font-semibold tracking-tight">Files</h2>
            {!planning && !IS_MOBILE && (
              <span className="flex items-center gap-2">
                <span className="hidden text-[0.82rem] text-muted sm:inline">or drop files (or a shared week) on this page</span>
                <Button size="sm" variant="ghost" onClick={addFiles}>
                  <Plus className="size-4" /> Add files
                </Button>
              </span>
            )}
          </div>
          {w.files.length > 0 ? (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {w.files.map((f) => (
                <FileRow key={f.id} f={f} canRemove={!planning} reload={reload} />
              ))}
            </ul>
          ) : IS_MOBILE ? (
            <p className="rounded-xl border border-dashed border-line px-5 py-6 text-center text-[0.92rem] text-muted">Add this week’s slides and transcripts in Studywise on your computer.</p>
          ) : (
            <button onClick={addFiles} className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-line px-5 py-6 text-center transition-colors hover:border-accent">
              <Upload className="size-5 text-muted" />
              <span className="font-semibold">Add {w.label}’s files</span>
              <span className="text-[0.88rem] text-muted">Slides, lecture transcripts, readings or pictures, or a week a friend shared. Click, or drop them anywhere on this page.</span>
            </button>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-[1.1rem] font-semibold tracking-tight">Flashcards</h2>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-5 py-4">
            <Layers className="size-5 text-muted" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">
                {w.card_count} card{w.card_count === 1 ? '' : 's'} in {c.name} · {w.label}
              </div>
              <div className="text-[0.88rem] text-muted">Recall cards from this week’s topics, plus any you’ve imported or added.</div>
            </div>
            {w.deck_id && w.card_count > 0 && (
              <Button size="sm" variant="soft" onClick={() => go({ name: 'flashcards', deckId: w.deck_id!, mode: 'due' })}>
                Review due
              </Button>
            )}
            {w.deck_id && (
              <Button size="sm" variant="ghost" onClick={() => go({ name: 'deck', id: w.deck_id! })}>
                Open deck
              </Button>
            )}
          </div>
        </section>
      </div>

      {(prev || next) && (
        <nav className="mt-10 flex items-center justify-between gap-3 border-t border-line pt-5">
          {prev ? (
            <Button variant="ghost" onClick={() => go({ name: 'week', courseId: c.id, weekId: prev.id })}>
              <ChevronLeft className="size-4" /> {prev.label}
            </Button>
          ) : (
            <span />
          )}
          {next && (
            <Button variant="ghost" onClick={() => go({ name: 'week', courseId: c.id, weekId: next.id })}>
              {next.label} <ChevronRight className="size-4" />
            </Button>
          )}
        </nav>
      )}
      {trim && (
        <TrimCardsModal
          weekId={w.id}
          topicId={trim.topicId}
          title={trim.title}
          onClose={() => {
            setTrim(null)
            reload()
          }}
        />
      )}
    </Shell>
  )
}

const fileIcon = (name: string) => {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  if (ext === '.pptx') return Presentation
  if (ext === '.vtt' || ext === '.srt') return Captions
  return FileText
}

function FileRow({ f, canRemove, reload }: { f: CourseFile; canRemove: boolean; reload: () => void }) {
  const Icon = fileIcon(f.name)
  const open = (reveal: boolean) => api.courses.openFile({ fileId: f.id, reveal }).catch((e) => toast(errorText(e), 'bad'))
  // The files themselves stay on the computer.
  if (IS_MOBILE)
    return (
      <li className="flex items-center gap-3 px-4 py-3">
        <Icon className="size-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate">{f.name}</span>
        {f.pages ? <span className="shrink-0 text-[0.85rem] text-muted">{f.pages} pages</span> : null}
      </li>
    )
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <Icon className="size-4 shrink-0 text-muted" />
      <button className="min-w-0 flex-1 truncate text-left hover:text-accent" onClick={() => void open(false)} title={`Open ${f.name}`}>
        {f.name}
      </button>
      {f.pages ? <span className="shrink-0 text-[0.85rem] text-muted">{f.pages} pages</span> : null}
      <Button size="icon" variant="ghost" onClick={() => void open(true)} aria-label={`Show ${f.name} in its folder`} title="Show in folder">
        <FolderOpen className="size-4" />
      </Button>
      {canRemove && (
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Remove ${f.name}`}
          title="Remove from the course"
          onClick={async () => {
            if (await confirmDialog(`Remove ${f.name}?`, 'Topics already written from it stay as they are.', { confirmText: 'Remove' })) await api.courses.removeFile({ fileId: f.id }).then(reload)
          }}
        >
          <X className="size-4" />
        </Button>
      )}
    </li>
  )
}

function TopicRow({ t, write, saveNote, reload, onTrim }: { t: Topic; write: (topics: Topic[]) => void; saveNote: (t: Topic) => void; reload: () => void; onTrim: () => void }) {
  const go = useStore((s) => s.go)
  const jobs = useStore((s) => s.jobs)
  const job = runningJob(jobs, 'course_topic', 'topicId', t.id)
  // The last write of this topic since the app started, for its share of the 5-hour limit.
  const lastWrite = jobs.find((j) => j.kind === 'course_topic' && j.status === 'done' && j.meta?.topicId === t.id)
  const used = planUsageText(lastWrite?.planUsage, true)
  const writing = t.status === 'writing' || !!job
  const ready = t.status === 'ready' && !!t.content
  const [open, setOpen] = useState(ready)
  const p = t.progress
  const headings = ready ? t.content!.sections.map((s) => s.heading) : t.plan.sections
  const n = Number(t.key.match(/t(\d+)$/)?.[1] ?? t.position + 1)
  return (
    <li className="rounded-xl border border-line bg-surface transition-[border-color,box-shadow] duration-300 ease-out-soft hover:border-[color-mix(in_oklab,var(--ink)_22%,transparent)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:gap-x-4 sm:px-5 sm:py-4">
        <div className={cx('grid size-8 shrink-0 place-items-center rounded-full text-[0.9rem] font-semibold transition-colors duration-500 sm:size-9', p.done ? 'bg-good text-white' : 'bg-surface-2')}>{p.done ? <CheckCircle2 className="size-5" /> : n}</div>
        <button className="min-w-[min(12rem,100%)] flex-1 text-left" onClick={() => headings.length && setOpen((v) => !v)} aria-expanded={open}>
          <div className="flex items-center gap-1.5 font-semibold">
            {t.content?.title ?? t.plan.title}
            {headings.length > 0 && <ChevronDown className={cx('size-4 shrink-0 text-muted transition-transform duration-200', open && 'rotate-180')} />}
          </div>
          <div className="truncate text-[0.88rem] text-muted">{t.content?.goal ?? t.plan.goal}</div>
          {writing && !job && (
            <div className="mt-1 flex items-center gap-1.5 text-[0.85rem] text-accent">
              <Sparkles className="size-3.5" /> Writing…
            </div>
          )}
          {t.error && !writing && <div className="mt-1 text-[0.85rem] text-bad">{t.status === 'ready' ? `Last write didn’t finish: ${t.error}` : t.error}</div>}
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-2 text-[0.85rem] text-muted">
          {t.plan.minutes > 0 && (
            <span className="hidden items-center gap-1 sm:flex">
              <Clock className="size-3.5" /> {t.plan.minutes} min
            </span>
          )}
          {!job && lastWrite?.planUsage?.measuring && <span className="text-[0.8rem]">Measuring usage…</span>}
          {!job && used && (
            <span className="hidden text-[0.8rem] sm:inline" title={`Writing this topic used ${planUsageText(lastWrite?.planUsage)}`}>
              Used {used}
            </span>
          )}
          {p.checkTotal ? (
            <Pill tone={p.checkScore != null && p.checkScore / p.checkTotal >= 0.8 ? 'good' : 'warn'}>
              Test {p.checkScore}/{p.checkTotal}
            </Pill>
          ) : null}
          {ready ? (
            <>
              <Button size="sm" variant={p.done ? 'ghost' : 'soft'} onClick={() => go({ name: 'topic', id: t.id })}>
                {p.done ? <RotateCcw className="size-4" /> : <Play className="size-4" />} {p.done ? 'Again' : p.section > 0 || p.step ? 'Continue' : 'Start'}
              </Button>
              {!!t.content?.check.length && (
                <Button size="sm" variant="ghost" onClick={() => go({ name: 'topic', id: t.id, test: true })} title={`Topic test: ${t.content.check.length} questions, from memory`}>
                  <ClipboardCheck className="size-4" /> Test
                </Button>
              )}
              <Menu
                trigger={(openMenu) => (
                  <Button size="icon" variant="ghost" onClick={openMenu} aria-label="Topic options">
                    <MoreHorizontal className="size-4" />
                  </Button>
                )}
              >
                {(close) => (
                  <>
                    <MenuItem icon={<NotebookPen className="size-4" />} onClick={() => (close(), void saveNote(t))}>
                      Open notes
                    </MenuItem>
                    <MenuItem icon={<RotateCcw className="size-4" />} onClick={() => (close(), void api.courses.resetProgress({ topicId: t.id }).then(reload))}>
                      Reset progress
                    </MenuItem>
                    {t.card_count > 0 && (
                      <MenuItem icon={<Scissors className="size-4" />} onClick={() => (close(), onTrim())}>
                        Trim its recall cards…
                      </MenuItem>
                    )}
                    <MenuItem icon={<Layers className="size-4" />} onClick={() => (close(), write([t]))}>
                      Write at another level…
                    </MenuItem>
                    <MenuItem
                      icon={<RefreshCw className="size-4" />}
                      onClick={async () => {
                        close()
                        const lvl = NOTE_LEVEL_INFO[t.level].label.toLowerCase()
                        const note = t.levels.length > 1 ? `Only the ${lvl} notes are replaced; your other levels and the recall cards stay.` : 'You get new notes and questions, and its recall cards are replaced (with their review history).'
                        if (await confirmDialog(`Write the ${lvl} notes again?`, note, { confirmText: 'Rewrite', danger: true })) {
                          try {
                            await api.courses.write({ topicIds: [t.id], levels: [t.level] })
                            reload()
                          } catch (e) {
                            toast(errorText(e), 'bad')
                          }
                        }
                      }}
                    >
                      Write again
                    </MenuItem>
                  </>
                )}
              </Menu>
            </>
          ) : (
            !writing && (
              <Button size="sm" variant="soft" onClick={() => write([t])}>
                <Sparkles className="size-4" /> {t.status === 'error' ? 'Try again' : 'Write'}
              </Button>
            )
          )}
          {job && (
            <Button size="sm" variant="ghost" onClick={() => api.jobs.cancel({ id: job.id })}>
              Cancel
            </Button>
          )}
        </div>
        {ready && !writing && (t.levels.length > 1 || t.level !== 'standard') && (
          <div className="flex basis-full flex-wrap items-center gap-2 sm:pl-13">
            <span className="text-[0.8rem] text-muted">Notes:</span>
            {t.levels.length > 1 ? (
              <Segmented
                value={t.level}
                onChange={(l) => void switchLevel(t, l).then((x) => x && reload())}
                options={t.levels.map((l) => ({ value: l, label: NOTE_LEVEL_INFO[l].label }))}
              />
            ) : (
              <Pill tone="accent">{NOTE_LEVEL_INFO[t.level].label}</Pill>
            )}
          </div>
        )}
        {job && (
          <div className="basis-full pl-13">
            <JobLive job={job} />
          </div>
        )}
      </div>
      {open && headings.length > 0 && (
        <ol className="flex flex-col border-t border-line px-2 py-2 sm:pl-14">
          {headings.map((h, i) => {
            const passed = p.done || p.section > i
            return (
              <li key={i}>
                {ready ? (
                  <button
                    onClick={() => go({ name: 'topic', id: t.id, section: i })}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-[0.92rem] transition-colors hover:bg-surface-2"
                    title={`Review “${h}”`}
                  >
                    {passed ? <CheckCircle2 className="size-4 shrink-0 text-good" /> : <span className="grid size-4 shrink-0 place-items-center text-[0.75rem] text-muted tabular">{i + 1}</span>}
                    <span className="min-w-0 flex-1 truncate">{h}</span>
                    <ChevronRight className="size-3.5 shrink-0 text-muted" />
                  </button>
                ) : (
                  <div className="flex items-center gap-2.5 px-3 py-1.5 text-[0.92rem] text-muted">
                    <span className="grid size-4 shrink-0 place-items-center text-[0.75rem] tabular">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{h}</span>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </li>
  )
}

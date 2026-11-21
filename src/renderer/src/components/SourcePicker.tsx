import { useEffect, useState } from 'react'
import { FileUp, X, FileText, Check } from 'lucide-react'
import { api } from '../lib/api'
import { Button, Input, Segmented, Textarea, cx } from './ui'

export interface SourceValue {
  files: string[]
  topic: string
  text: string
  noteIds: string[]
}
export type SourceTab = 'files' | 'topic' | 'text' | 'notes'

export function initialTab(v: Partial<SourceValue>): SourceTab {
  if (v.files?.length) return 'files'
  if (v.noteIds?.length) return 'notes'
  if (v.text) return 'text'
  if (v.topic) return 'topic'
  return 'files'
}

const base = (p: string) => p.split('/').pop() ?? p

export function SourcePicker({ value, onChange, tab, setTab }: { value: SourceValue; onChange: (v: SourceValue) => void; tab: SourceTab; setTab: (t: SourceTab) => void }) {
  const [notes, setNotes] = useState<{ id: string; title: string; module: string; type: string; week: string }[]>([])
  const [filter, setFilter] = useState('')
  const [over, setOver] = useState(false)
  useEffect(() => void api.notes.list().then(setNotes), [])

  const addFiles = (paths: string[]) => {
    const ok = paths.filter((p) => /\.(pdf|docx|pptx|txt|md|markdown)$/i.test(p))
    onChange({ ...value, files: [...new Set([...value.files, ...ok])] })
  }

  return (
    <div className="flex flex-col gap-3">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'files', label: `Files${value.files.length ? ` · ${value.files.length}` : ''}` },
          { value: 'notes', label: `My notes${value.noteIds.length ? ` · ${value.noteIds.length}` : ''}` },
          { value: 'text', label: 'Paste text' },
          { value: 'topic', label: 'Topic' }
        ]}
      />
      {tab === 'files' && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setOver(false)
            addFiles([...e.dataTransfer.files].map((f) => window.studywise.pathForFile(f)))
          }}
          className={cx(
            'desktop-only flex flex-col gap-3 rounded-xl border-2 border-dashed p-5 transition-colors duration-300',
            over ? 'border-accent bg-accent-soft' : 'border-line bg-surface'
          )}
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-accent">
              <FileUp className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">Drop PDFs, Word, PowerPoint, text or Markdown</div>
              <div className="text-[0.85rem] text-muted">Claude reads PDFs directly, including tables, screenshots and diagrams.</div>
            </div>
            <Button size="sm" variant="soft" onClick={async () => addFiles(await api.app.pickFiles({ kind: 'sources' }))}>
              Choose files…
            </Button>
          </div>
          {value.files.length > 0 && (
            <ul className="stagger flex flex-col gap-1.5">
              {value.files.map((f) => (
                <li key={f} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-[0.9rem]">
                  <FileText className="size-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate">{base(f)}</span>
                  <button onClick={() => onChange({ ...value, files: value.files.filter((x) => x !== f) })} className="text-muted hover:text-bad" aria-label="Remove">
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {tab === 'topic' && <Input value={value.topic} onChange={(e) => onChange({ ...value, topic: e.target.value })} placeholder="e.g. The photoelectric effect" autoFocus />}
      {tab === 'text' && <Textarea rows={8} value={value.text} onChange={(e) => onChange({ ...value, text: e.target.value })} placeholder="Paste lecture notes, a textbook section, anything…" autoFocus />}
      {tab === 'notes' && (
        <div className="flex flex-col gap-2">
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter notes…" />
          <div className="max-h-56 overflow-y-auto rounded-lg border border-line bg-surface p-1">
            {notes.length === 0 && <div className="p-4 text-center text-muted">No notes yet.</div>}
            {notes
              .filter((n) => `${n.title} ${n.module}`.toLowerCase().includes(filter.toLowerCase()))
              .map((n) => {
                const on = value.noteIds.includes(n.id)
                return (
                  <button
                    key={n.id}
                    onClick={() => onChange({ ...value, noteIds: on ? value.noteIds.filter((x) => x !== n.id) : [...value.noteIds, n.id] })}
                    className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors', on ? 'bg-accent-soft' : 'hover:bg-surface-2')}
                  >
                    <span className={cx('grid size-5 place-items-center rounded-md border', on ? 'border-accent bg-accent text-accent-ink' : 'border-line')}>{on && <Check className="size-3.5" />}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{n.title}</span>
                    <span className="text-[0.8rem] text-muted">{[n.module, n.type, n.week && `Wk ${n.week}`].filter(Boolean).join(' · ')}</span>
                  </button>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}

export function sourceFor(tab: SourceTab, v: SourceValue): SourceValue {
  // Only send the active tab's source.
  return {
    files: tab === 'files' ? v.files : [],
    topic: tab === 'topic' ? v.topic : '',
    text: tab === 'text' ? v.text : '',
    noteIds: tab === 'notes' ? v.noteIds : []
  }
}

export function hasSource(v: SourceValue): boolean {
  return v.files.length > 0 || !!v.topic.trim() || !!v.text.trim() || v.noteIds.length > 0
}

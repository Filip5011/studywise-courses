import { useState } from 'react'
import { FileText, Paperclip, X } from 'lucide-react'
import { api, errorText } from '../lib/api'
import { toast, useStore } from '../lib/store'
import { Button, Field, Modal, Textarea } from './ui'

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p

/**
 * Add new notes to a week that's already planned: paste them, add files, or
 * both. Claude works out what's new and adds it where it belongs, after what
 * you've already reviewed.
 */
export function AddNotesModal({ open, onClose, week, onStarted }: { open: boolean; onClose: () => void; week: { id: string; label: string }; onStarted: () => void }) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const [instructions, setInstructions] = useState('')
  const [busy, setBusy] = useState(false)
  const close = () => {
    if (busy) return
    onClose()
  }
  const pick = async () => {
    const picked = await api.app.pickFiles({ kind: 'course' })
    if (picked.length) setFiles((f) => [...f, ...picked.filter((p) => !f.includes(p))])
  }
  const start = async () => {
    setBusy(true)
    try {
      await api.courses.addNotes({ weekId: week.id, files, text, instructions })
      useStore.getState().bump()
      toast(`Adding your notes to ${week.label}. Anything new goes after what you’ve already reviewed.`, 'info')
      setText('')
      setFiles([])
      setInstructions('')
      onClose()
      onStarted()
    } catch (e) {
      toast(errorText(e), 'bad')
    } finally {
      setBusy(false)
    }
  }
  const ready = !!text.trim() || files.length > 0
  return (
    <Modal
      open={open}
      onClose={close}
      title={`Add new notes to ${week.label}`}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={start} disabled={!ready} loading={busy}>
            Add to {week.label}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[0.92rem] text-muted">
          Claude compares them with the week’s topics and adds only what’s new: extra sections at the end of a topic, or a new topic. What you’ve already studied stays exactly as it is, and the new sections are marked <span className="font-semibold text-accent">New</span> until you’ve reviewed them.
        </p>
        <Field label="Paste your notes" hint="Lecture notes, a summary, extra reading: anything with the new material in it.">
          <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste or type the new notes here…" />
        </Field>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={pick}>
              <Paperclip className="size-4" /> Add files…
            </Button>
            <span className="text-[0.8rem] text-muted">Slides, transcripts, PDFs, Word or PowerPoint files, or photos.</span>
          </div>
          {files.length > 0 && (
            <ul className="flex flex-col gap-1">
              {files.map((f) => (
                <li key={f} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-[0.9rem]">
                  <FileText className="size-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate">{baseName(f)}</span>
                  <button className="text-muted hover:text-ink" onClick={() => setFiles(files.filter((x) => x !== f))} aria-label={`Remove ${baseName(f)}`}>
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Field label="Your instructions (optional)" hint="These take priority over the usual writing rules.">
          <Textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. Put the new worked examples in the topic on work function." />
        </Field>
      </div>
    </Modal>
  )
}

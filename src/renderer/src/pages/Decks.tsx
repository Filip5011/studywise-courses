import { useEffect, useMemo, useState } from 'react'
import { keyLabel } from '@shared/keymap'
import { Folder as FolderIcon, FolderPlus, Layers, MoreHorizontal, Search, Trash2, Pencil, ChevronRight } from 'lucide-react'
import type { Deck, Folder } from '@shared/types'
import { useStore, toast } from '../lib/store'
import { api, errorText } from '../lib/api'
import { runCommand, useCommands } from '../lib/commands'
import { askText, confirmDialog, chooseDialog } from '../lib/dialogs'
import { groupByFolder, useCollapsedFolders, type FolderGroup } from '../lib/collapsed'
import { Shell, PageTitle } from '../components/Shell'
import { Button, Card, Empty, Input, Menu, MenuItem, Pill, ProgressBar, cx } from '../components/ui'

type DeckRow = Deck & { card_count: number; due_count: number }

export function Decks({ folderId }: { folderId: string | null }) {
  const go = useStore((s) => s.go)
  const version = useStore((s) => s.version)
  const [decks, setDecks] = useState<DeckRow[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)

  const load = () => {
    void api.decks.list().then(setDecks)
    void api.folders.list({ kind: 'deck' }).then(setFolders)
  }
  useEffect(load, [version])

  const shown = useMemo(
    () => decks.filter((d) => (folderId ? d.folder_id === folderId : true) && d.name.toLowerCase().includes(q.toLowerCase())),
    [decks, folderId, q]
  )
  const folder = folders.find((f) => f.id === folderId)

  // "All" groups decks under their folders, which collapse. A filter shows every match.
  const { isCollapsed, toggle } = useCollapsedFolders()
  const groups: FolderGroup<DeckRow>[] = useMemo(() => (!folderId && folders.length ? groupByFolder(shown, folders) : [{ folder: null, items: shown }]), [folderId, folders, shown])
  const isOpen = (g: FolderGroup<DeckRow>) => !g.folder || !!q || !isCollapsed(g.folder.id)
  const visible = groups.flatMap((g) => (isOpen(g) ? g.items : []))
  const visibleIndex = new Map(visible.map((d, i) => [d.id, i]))

  const renameDeck = async (d: DeckRow) => {
    const name = await askText('Rename deck', { initial: d.name, confirmText: 'Rename' })
    if (name) await api.decks.update({ id: d.id, patch: { name } }).then(load)
  }
  const moveDeck = async (d: DeckRow) => {
    const v = await chooseDialog('Move to folder', [{ value: '', label: 'No folder' }, ...folders.map((f) => ({ value: f.id, label: f.name }))], { initial: d.folder_id ?? '', confirmText: 'Move' })
    if (v !== null) await api.decks.update({ id: d.id, patch: { folder_id: v || null } }).then(load)
  }
  const deleteDeck = async (d: DeckRow) => {
    if (await confirmDialog(`Delete “${d.name}”?`, `${d.card_count} cards will be deleted. This can’t be undone.`, { confirmText: 'Delete', danger: true })) {
      await api.decks.delete({ id: d.id })
      toast('Deck deleted', 'good')
      load()
    }
  }

  const deckRow = (d: DeckRow, i: number, nested: boolean) => (
    <div
      key={d.id}
      onClick={() => go({ name: 'deck', id: d.id })}
      className={cx(
        '-mx-3 grid cursor-pointer grid-cols-[1fr_90px_70px_120px_36px] items-center gap-4 rounded-md border-t border-line px-3 py-2.5 transition-colors hover:bg-surface-2/70 max-sm:grid-cols-[1fr_70px_36px]',
        i === sel && 'bg-accent-soft/60'
      )}
    >
      <span className={cx('min-w-0 truncate font-medium', nested && 'pl-12')}>{d.name}</span>
      <span className="tabular text-right text-muted max-sm:hidden">{d.card_count}</span>
      <span className={cx('tabular text-right', d.due_count ? 'text-accent' : 'text-muted/60')}>{d.due_count || '—'}</span>
      <ProgressBar value={d.card_count ? 1 - d.due_count / d.card_count : 0} className="h-1 max-sm:hidden" />
      <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
        <Menu
          trigger={(toggle) => (
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Deck menu">
              <MoreHorizontal className="size-4" />
            </Button>
          )}
        >
          {(close) => (
            <>
              <MenuItem onClick={() => (close(), renameDeck(d))}>Rename</MenuItem>
              <MenuItem onClick={() => (close(), moveDeck(d))}>Move to folder</MenuItem>
              <MenuItem danger onClick={() => (close(), deleteDeck(d))}>
                Delete
              </MenuItem>
            </>
          )}
        </Menu>
      </div>
    </div>
  )

  useCommands(
    {
      'list.down': () => setSel((s) => Math.min(visible.length - 1, s + 1)),
      'list.up': () => setSel((s) => Math.max(0, s - 1)),
      'list.open': () => visible[sel] && go({ name: 'deck', id: visible[sel].id }),
      'item.rename': () => visible[sel] && renameDeck(visible[sel]),
      'list.delete': () => visible[sel] && deleteDeck(visible[sel]),
      'go.nextDeck': () => setSel((s) => Math.min(visible.length - 1, s + 1)),
      'go.prevDeck': () => setSel((s) => Math.max(0, s - 1))
    },
    [visible, sel]
  )

  return (
    <>
      <Shell>
        <PageTitle
          eyebrow="Library"
          title={folder?.name ?? 'Decks'}
          actions={
            <>
              <Button className="desktop-only" onClick={() => runCommand('io.importDeck')} kbd="io.importDeck">
                Import
              </Button>
              <Button variant="primary" onClick={() => runCommand('deck.new')}>
                New deck
              </Button>
            </>
          }
        />
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter decks…" className="pl-9" />
          </div>
        </div>
        <div className="mb-6 flex flex-wrap items-center gap-1.5">
          <FolderChip active={!folderId} onClick={() => go({ name: 'decks' })} label="All" count={decks.length} />
          {folders.map((f) => (
            <FolderChip
              key={f.id}
              active={folderId === f.id}
              onClick={() => go({ name: 'decks', folderId: f.id })}
              label={f.name}
              count={decks.filter((d) => d.folder_id === f.id).length}
              onRename={async () => {
                const name = await askText('Rename folder', { initial: f.name })
                if (name) await api.folders.rename({ id: f.id, name }).then(load)
              }}
              onDelete={async () => {
                if (await confirmDialog(`Delete folder “${f.name}”?`, 'Decks inside are kept.', { danger: true, confirmText: 'Delete' })) {
                  await api.folders.delete({ id: f.id })
                  go({ name: 'decks' })
                  load()
                }
              }}
            />
          ))}
          <button onClick={() => runCommand('folder.new')} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[0.85rem] text-muted transition-colors hover:bg-surface-2 hover:text-ink" title={keyLabel("New folder (⇧⌥⌘N)")}>
            <FolderPlus className="size-4" /> New folder
          </button>
        </div>
        {shown.length === 0 ? (
          <Empty title={decks.length ? 'No decks match' : 'No decks yet'}>
            {decks.length ? 'Try another filter.' : 'Create a deck, import a StudySmarter export, or drop a PDF to generate flashcards with AI.'}
            {!decks.length && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button variant="primary" onClick={() => runCommand('gen.cards')}>
                  Generate with AI
                </Button>
                <Button onClick={() => runCommand('deck.new')}>New deck</Button>
              </div>
            )}
          </Empty>
        ) : (
          <div className="border-t border-line">
            <div className="-mx-3 grid grid-cols-[1fr_90px_70px_120px_36px] items-center gap-4 px-3 py-2 text-[0.8rem] text-muted max-sm:grid-cols-[1fr_70px_36px]">
              <span>Name</span>
              <span className="text-right max-sm:hidden">Cards</span>
              <span className="text-right">Due</span>
              <span className="max-sm:hidden">Progress</span>
              <span />
            </div>
            {groups.map((g) => {
              const open = isOpen(g)
              const due = g.items.reduce((n, d) => n + d.due_count, 0)
              return (
                <div key={g.folder?.id ?? 'loose'}>
                  {g.folder && (
                    <button
                      onClick={() => toggle(g.folder!.id)}
                      aria-expanded={open}
                      className="-mx-3 grid w-[calc(100%+1.5rem)] grid-cols-[1fr_90px_70px_120px_36px] items-center gap-4 rounded-md border-t border-line px-3 py-2.5 text-left transition-colors hover:bg-surface-2/70 max-sm:grid-cols-[1fr_70px_36px]"
                    >
                      <span className="flex min-w-0 items-center gap-2 font-semibold">
                        <ChevronRight className={cx('size-4 shrink-0 text-muted transition-transform duration-200', open && 'rotate-90')} />
                        <FolderIcon className="size-4 shrink-0 text-muted" />
                        <span className="truncate">{g.folder.name}</span>
                        <span className="tabular text-[0.82rem] font-normal text-muted">{g.items.length}</span>
                      </span>
                      <span className="max-sm:hidden" />
                      <span className={cx('tabular text-right', due ? 'text-accent' : 'text-muted/60')}>{due || '—'}</span>
                      <span className="max-sm:hidden" />
                      <span />
                    </button>
                  )}
                  {open && g.items.map((d) => deckRow(d, visibleIndex.get(d.id) ?? -1, !!g.folder))}
                </div>
              )
            })}
          </div>
        )}
      </Shell>
    </>
  )
}

function FolderChip({ active, onClick, label, count, onRename, onDelete }: { active: boolean; onClick: () => void; label: string; count: number; onRename?: () => void; onDelete?: () => void }) {
  return (
    <span className={cx('group inline-flex h-8 items-center rounded-lg border text-[0.86rem] transition-colors', active ? 'border-accent/40 bg-accent-soft text-accent' : 'border-line bg-surface text-ink hover:border-[color-mix(in_oklab,var(--ink)_22%,transparent)]')}>
      <button onClick={onClick} className="inline-flex h-full items-center gap-1.5 pr-2 pl-2.5 font-medium">
        {onRename ? <FolderIcon className="size-3.5" /> : <Layers className="size-3.5" />}
        {label}
        <span className="tabular text-muted">{count}</span>
      </button>
      {onRename && (
        <span className="hidden items-center pr-1 group-hover:inline-flex">
          <button onClick={onRename} className="rounded p-1 text-muted hover:text-ink" aria-label="Rename folder">
            <Pencil className="size-3" />
          </button>
          <button onClick={onDelete} className="rounded p-1 text-muted hover:text-bad" aria-label="Delete folder">
            <Trash2 className="size-3" />
          </button>
        </span>
      )}
    </span>
  )
}

export function RailItem({
  active,
  onClick,
  icon,
  label,
  count,
  depth = 0,
  onAddChild,
  onRename,
  onDelete
}: {
  active: boolean
  onClick: () => void
  icon?: React.ReactNode
  label: string
  count?: number
  /** Nesting level, for folders inside folders. */
  depth?: number
  onAddChild?: () => void
  onRename?: () => void
  onDelete?: () => void
}) {
  return (
    <div className={cx('group flex items-center rounded-full transition-colors duration-300', active ? 'bg-accent-soft' : 'hover:bg-surface-2')}>
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pr-3 text-left text-[0.92rem] font-medium" style={{ paddingLeft: 12 + depth * 16 }}>
        {icon && <span className={active ? 'text-accent' : 'text-muted'}>{icon}</span>}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count !== undefined && <span className="text-[0.8rem] text-muted">{count}</span>}
      </button>
      {(onAddChild || onRename || onDelete) && (
        <span className="hidden pr-1 group-hover:flex">
          {onAddChild && (
            <button onClick={onAddChild} className="rounded-full p-1.5 text-muted hover:text-ink" aria-label="New folder inside" title="New folder inside">
              <FolderPlus className="size-3.5" />
            </button>
          )}
          {onRename && (
            <button onClick={onRename} className="rounded-full p-1.5 text-muted hover:text-ink" aria-label="Rename">
              <Pencil className="size-3.5" />
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} className="rounded-full p-1.5 text-muted hover:text-bad" aria-label="Delete">
              <Trash2 className="size-3.5" />
            </button>
          )}
        </span>
      )}
    </div>
  )
}

export function errorToast(e: unknown) {
  toast(errorText(e), 'bad')
}

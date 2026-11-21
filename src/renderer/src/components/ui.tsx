import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes, type SelectHTMLAttributes } from 'react'
import { IS_MOBILE } from '../lib/platform'
import { createPortal } from 'react-dom'
import { X, Loader2 } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { create } from 'zustand'
import { prettyKey, keyLabel, COMMAND_BY_ID } from '@shared/keymap'

export function cx(...c: (string | false | null | undefined)[]): string {
  return twMerge(c.filter(Boolean).join(' '))
}

/** Keeps something mounted for `ms` after `open` goes false, so it can play an exit animation. */
export function usePresence(open: boolean, ms = 180): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open)
  useEffect(() => {
    if (open) return setMounted(true)
    const t = setTimeout(() => setMounted(false), ms)
    return () => clearTimeout(t)
  }, [open, ms])
  return { mounted: open || mounted, closing: !open && mounted }
}

/** How many modals are open, so toasts can move out of the way of their footers. */
export const useModalCount = create<{ n: number }>(() => ({ n: 0 }))

type BtnVariant = 'primary' | 'soft' | 'ghost' | 'outline' | 'danger' | 'ink'
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110',
  soft: 'bg-accent-soft text-accent hover:bg-[color-mix(in_oklab,var(--accent-soft)_85%,var(--accent))]',
  ghost: 'bg-transparent hover:bg-surface-2 text-ink',
  outline: 'bg-surface border border-line hover:border-[color-mix(in_oklab,var(--ink)_30%,transparent)] text-ink',
  danger: 'bg-bad-soft text-bad hover:bg-bad hover:text-white',
  ink: 'bg-ink text-bg hover:brightness-125'
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg' | 'icon'; loading?: boolean; kbd?: string; icon?: ReactNode }
>(function Button({ variant = 'outline', size = 'md', loading, kbd, icon, className, children, disabled, title, ...rest }, ref) {
  const sizes = { sm: 'h-8 px-2.5 text-[0.84rem] gap-1.5', md: 'h-9 px-3.5 text-[0.9rem] gap-2', lg: 'h-10 px-4 text-[0.92rem] gap-2', icon: 'h-8 w-8 justify-center' }
  const shortcut = kbd ? (COMMAND_BY_ID.get(kbd)?.accelerator ?? COMMAND_BY_ID.get(kbd)?.keys?.[0] ?? kbd) : undefined
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      title={title ?? (shortcut && typeof children === 'string' ? `${children} (${prettyKey(shortcut)})` : undefined)}
      className={cx(
        'no-drag inline-flex shrink-0 items-center rounded-lg font-medium transition-[transform,background,filter,border-color,color] duration-200 ease-out-soft active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none select-none',
        sizes[size],
        BTN[variant],
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  )
})

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  // No keyboard on the phone.
  if (IS_MOBILE) return null
  if (typeof children === 'string') children = keyLabel(children)
  return (
    <kbd className={cx('inline-flex items-center rounded-md border border-current/20 px-1.5 py-px font-mono text-[0.7rem] font-medium leading-4 opacity-80', className)}>
      {children}
    </kbd>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cx(
        'h-9 w-full rounded-lg border border-line bg-surface px-3 text-[0.92rem] outline-none transition-[border-color,box-shadow] duration-300 placeholder:text-muted focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_15%,transparent)]',
        className
      )}
      {...rest}
    />
  )
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cx(
        'w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[0.95rem] leading-relaxed outline-none transition-[border-color,box-shadow] duration-300 placeholder:text-muted focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_15%,transparent)]',
        className
      )}
      {...rest}
    />
  )
})

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        'h-9 w-full appearance-none rounded-lg border border-line bg-surface px-3 pr-8 text-[0.95rem] outline-none transition-colors focus:border-accent',
        className
      )}
      style={{
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23888' stroke-width='2' fill='none'/%3E%3C/svg%3E\")",
        backgroundSize: '10px',
        backgroundPosition: 'right 11px center',
        backgroundRepeat: 'no-repeat'
      }}
      {...rest}
    >
      {children}
    </select>
  )
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('inline-flex cursor-pointer select-none items-center gap-3', disabled && 'opacity-50')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300', checked ? 'bg-accent' : 'bg-surface-2 border border-line')}
      >
        <span className={cx('absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform duration-500 ease-out-soft', checked && 'translate-x-5')} />
      </button>
      {label && <span className="text-[0.95rem]">{label}</span>}
    </label>
  )
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('flex flex-col gap-1.5', className)}>
      <span className="text-[0.84rem] font-medium text-ink/80">{label}</span>
      {children}
      {hint && <span className="text-[0.8rem] text-muted">{hint}</span>}
    </label>
  )
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const box = ref.current
    if (!box) return
    const measure = () => {
      const el = box.querySelector<HTMLElement>(`[data-v="${CSS.escape(value)}"]`)
      if (el) setPill({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    return () => ro.disconnect()
  }, [value, options.length])
  return (
    <div ref={ref} className={cx('relative inline-flex flex-wrap rounded-lg bg-surface-2 p-0.5', className)}>
      {pill && <span className="absolute rounded-md bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-[left,top,width,height] duration-300 ease-out-soft" style={pill} />}
      {options.map((o) => (
        <button
          key={o.value}
          data-v={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx('relative z-10 rounded-md px-3 py-1 text-[0.86rem] font-medium transition-colors', value === o.value ? 'text-ink' : 'text-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
  full
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
  full?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    useModalCount.setState((s) => ({ n: s.n + 1 }))
    return () => {
      window.removeEventListener('keydown', onKey)
      useModalCount.setState((s) => ({ n: s.n - 1 }))
    }
  }, [open, onClose])
  const { mounted, closing } = usePresence(open)
  // While it animates out, show what it last showed: the data behind it is often gone already.
  const last = useRef({ title, children, footer })
  if (open) last.current = { title, children, footer }
  if (!mounted) return null
  ;({ title, children, footer } = last.current)
  return createPortal(
    <div
      data-modal={closing ? undefined : ''}
      className={cx('fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-[3px] sm:items-center sm:p-6', closing ? 'fade-out pointer-events-none' : 'fade-in')}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={cx(
          'flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)] sm:rounded-xl',
          closing ? 'modal-out' : 'modal-in',
          full ? 'sm:h-[92vh] sm:max-w-[1180px]' : wide ? 'sm:max-w-[860px]' : 'sm:max-w-[560px]'
        )}
      >
        {title && (
          <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
            <h2 className="text-[1.08rem] font-semibold">{title}</h2>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
              <X className="size-5" />
            </Button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface/60 px-6 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}

export function Card({ children, className, onClick, ...rest }: { children: ReactNode; className?: string; onClick?: () => void } & Record<string, unknown>) {
  return (
    <div
      onClick={onClick}
      className={cx(
        'rounded-xl border border-line bg-surface p-5 transition-[border-color,background] duration-200',
        onClick && 'cursor-pointer hover:border-[color-mix(in_oklab,var(--ink)_22%,transparent)]',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

export function Pill({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'good' | 'warn' | 'bad'; className?: string }) {
  const tones = {
    neutral: 'text-muted px-0',
    accent: 'text-accent px-0',
    good: 'bg-good-soft text-good',
    warn: 'bg-warn-soft text-warn',
    bad: 'bg-bad-soft text-bad'
  }
  return <span className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[0.76rem] font-medium', tones[tone], className)}>{children}</span>
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-4 animate-spin', className)} />
}

export function Dots() {
  return (
    <span className="inline-flex gap-1">
      {[0, 1, 2].map((i) => (
        <span key={i} className="pulse-dot size-1.5 rounded-full bg-current" style={{ animationDelay: `${i * 160}ms` }} />
      ))}
    </span>
  )
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="pop-in flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line px-6 py-14 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <h3 className="text-[1rem] font-semibold">{title}</h3>
      {children && <div className="max-w-md text-muted">{children}</div>}
    </div>
  )
}

export function Menu({ trigger, children, align = 'right' }: { trigger: (open: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  const { mounted, closing } = usePresence(open, 140)
  return (
    <div ref={ref} className="relative">
      {trigger(() => setOpen((v) => !v))}
      {mounted && (
        <div
          className={cx(
            'absolute top-[calc(100%+6px)] z-40 min-w-[220px] overflow-hidden rounded-lg border border-line bg-surface p-1.5 shadow-xl',
            align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
            closing ? 'menu-out pointer-events-none' : 'menu-in'
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function MenuItem({ onClick, children, icon, kbd, danger, desktopOnly }: { onClick: () => void; children: ReactNode; icon?: ReactNode; kbd?: string; danger?: boolean; /** Hidden in the phone app (it needs files or dialogs on the computer). */ desktopOnly?: boolean }) {
  const c = kbd ? COMMAND_BY_ID.get(kbd) : undefined
  if (desktopOnly && IS_MOBILE) return null
  const k = c?.accelerator ?? c?.keys?.[0]
  return (
    <button
      onClick={onClick}
      className={cx('flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[0.92rem] transition-colors hover:bg-surface-2', danger && 'text-bad')}
    >
      {icon && <span className="text-muted">{icon}</span>}
      <span className="flex-1">{children}</span>
      {k && <Kbd className="text-muted">{prettyKey(k)}</Kbd>}
    </button>
  )
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-surface-2', className)}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out-soft" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </div>
  )
}

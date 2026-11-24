import { Globe, Lock } from 'lucide-react'
import { Field, Pill, Segmented } from './ui'

export type Visibility = 'public' | 'private'

/** Public or private on the marketplace, for a new course or week. */
export function VisibilityField({ value, onChange, what, lockedBy }: { value: Visibility; onChange: (v: Visibility) => void; what: 'course' | 'week'; /** The course is private, so this week is too. */ lockedBy?: string }) {
  const hint = lockedBy
    ? `${lockedBy} is private, so this week stays off the marketplace too.`
    : value === 'public'
      ? what === 'course'
        ? 'Its weeks can go on the marketplace for others to add. Make it private to keep the whole course off it.'
        : 'It can go on the marketplace for others to add. Make it private to keep it off.'
      : what === 'course'
        ? 'None of its weeks go on the marketplace, even with automatic publishing on.'
        : 'It never goes on the marketplace, even with automatic publishing on.'
  return (
    <Field label="Visibility" hint={hint}>
      <div className={lockedBy ? 'pointer-events-none opacity-50' : undefined}>
        <Segmented
          value={lockedBy ? 'private' : value}
          onChange={onChange}
          options={[
            {
              value: 'public',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Globe className="size-3.5" /> Public
                </span>
              )
            },
            {
              value: 'private',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="size-3.5" /> Private
                </span>
              )
            }
          ]}
        />
      </div>
    </Field>
  )
}

/** Marks a private course or week. */
export function PrivatePill({ title }: { title: string }) {
  return (
    <span className="shrink-0" title={title}>
      <Pill>
        <Lock className="size-3" /> Private
      </Pill>
    </span>
  )
}

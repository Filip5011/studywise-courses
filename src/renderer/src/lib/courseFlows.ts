import { NOTE_LEVEL_INFO, type NoteLevel, type Topic } from '@shared/course'
import { api, errorText } from './api'
import { askPlan, askWrite } from './dialogs'
import { toast, useStore } from './store'
import { askAboutMatches } from '../components/MarketMatches'
import { useMarketWeekHere } from './market'

const files = (n: number) => `${n} file${n === 1 ? '' : 's'}`

/**
 * Ask whether to plan a week now (with optional instructions that take
 * priority), and start planning if so. Adding files never plans by itself.
 * Returns true when planning started.
 */
export async function offerPlan(week: { id: string; label: string; topics?: { status: string }[] }, opts: { added?: number } = {}): Promise<boolean> {
  const topics = week.topics?.length ?? 0
  // Before spending tokens on a new week: has someone published one made from the same slides?
  if (!topics) {
    const matches = await api.market.similar({ weekId: week.id }).catch(() => [])
    if (matches.length) {
      const a = await askAboutMatches(week.label, matches)
      if (a === null) return false
      if (a !== 'plan') return useMarketWeekHere(a.use, week)
    }
  }
  const written = week.topics?.filter((t) => t.status === 'ready').length ?? 0
  const message = [
    opts.added ? `Added ${files(opts.added)} to ${week.label}.` : '',
    topics
      ? `Planning again replaces its ${topics} topic${topics === 1 ? '' : 's'}${written ? `, including ${written} you’ve already written` : ''}. Recall cards you’ve made stay in the deck.`
      : 'Claude reads the files and splits them into topics. You can also add more files first and plan later from the week page.'
  ]
    .filter(Boolean)
    .join(' ')
  const instructions = await askPlan(topics ? `Plan ${week.label} again?` : `Plan ${week.label} now?`, {
    message,
    confirmText: topics ? 'Plan again' : 'Plan topics',
    danger: written > 0
  })
  if (instructions === null) return false
  try {
    await api.courses.plan({ weekId: week.id, instructions })
    useStore.getState().bump()
    return true
  } catch (e) {
    toast(errorText(e), 'bad')
    return false
  }
}

const levelList = (levels: NoteLevel[]) => levels.map((l) => NOTE_LEVEL_INFO[l].label.toLowerCase()).join(' and ')

/**
 * Pick the level(s) of detail and write topics. For one written topic, the
 * levels it already has are marked (writing one again replaces just that one).
 */
export async function writeTopics(topics: Topic[], opts: { title?: string; levels?: NoteLevel[] } = {}): Promise<boolean> {
  if (!topics.length) return false
  const one = topics.length === 1 ? topics[0] : null
  const name = one ? (one.content?.title ?? one.plan.title) : `${topics.length} topics`
  const r = await askWrite(opts.title ?? `Write ${name}`, {
    message: one?.levels.length ? `Already written as ${levelList(one.levels)}. Every level you write is kept, and you can switch between them.` : undefined,
    levels: opts.levels,
    written: one?.levels ?? [],
    confirmText: 'Write'
  })
  if (!r) return false
  try {
    await api.courses.write({ topicIds: topics.map((t) => t.id), levels: r.levels, instructions: r.instructions })
    useStore.getState().bump()
    return true
  } catch (e) {
    toast(errorText(e), 'bad')
    return false
  }
}

/** Show a topic at another level of detail it's written at. */
export async function switchLevel(topic: Topic, level: NoteLevel): Promise<Topic | null> {
  if (topic.level === level) return topic
  try {
    const t = await api.courses.setLevel({ topicId: topic.id, level })
    useStore.getState().bump()
    return t
  } catch (e) {
    toast(errorText(e), 'bad')
    return null
  }
}

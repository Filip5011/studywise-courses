import { modelLabel, type MarketMatch, type MarketModel, type MarketWeek } from '@shared/market'
import { api, errorText } from './api'
import { confirmDialog } from './dialogs'
import { importSharedWeek } from './weekShare'
import { toast, useStore } from './store'

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** "opus · high (4), sonnet (1)". */
export function modelsText(models: MarketModel[]): string {
  if (!models.length) return 'Model not recorded'
  return models.map((m) => (models.length > 1 ? `${modelLabel(m)} (${m.count})` : modelLabel(m))).join(', ')
}

export const weekSummary = (w: MarketWeek) => `${w.writtenCount} of ${plural(w.topicCount, 'topic')} written · ${plural(w.cardCount, 'flashcard')} · ${plural(w.files.length, 'file')}`

/** Download a published week, then ask which course it goes in (like a shared week). */
export async function addMarketWeek(remoteWeekId: string, courseId?: string): Promise<void> {
  try {
    const { file } = await api.market.download({ id: remoteWeekId })
    await importSharedWeek({ file, courseId })
  } catch (e) {
    toast(errorText(e), 'bad')
  }
}

/** Instead of planning a week yourself, fill it with a published one. */
export async function useMarketWeekHere(remoteWeekId: string, week: { id: string; label: string }): Promise<boolean> {
  try {
    const { file } = await api.market.download({ id: remoteWeekId })
    const r = await api.courses.importWeek({ file, courseId: null, weekId: week.id })
    toast(`Added ${plural(r.topics, 'topic')} and ${plural(r.cards, 'card')} to ${week.label}. Nothing was generated.`, 'good')
    useStore.getState().bump()
    return true
  } catch (e) {
    toast(errorText(e), 'bad')
    return false
  }
}

/** Publish a week (with its slides and transcripts), or publish it again to update it. */
export async function publishToMarket(week: { id: string; label: string }): Promise<void> {
  try {
    const status = await api.market.status()
    if (!status.url || !status.hasKey) {
      toast('Connect to a marketplace first: add its address and your API key here.', 'info')
      useStore.getState().go({ name: 'settings', tab: 'market' })
      return
    }
    const already = (await api.market.published())[week.id]
    const ok = await confirmDialog(
      already ? `Publish ${week.label} again?` : `Publish ${week.label} to the marketplace?`,
      `${already ? 'This replaces the copy you published before. ' : ''}Everyone on ${new URL(status.url).host} can see and add it: its topics, questions and flashcards, and its slides and transcripts. Your progress isn't included. Only publish material you’re allowed to share.`,
      { confirmText: already ? 'Publish again' : 'Publish' }
    )
    if (!ok) return
    toast(`Publishing ${week.label}…`, 'info')
    const r = await api.market.publish({ weekId: week.id })
    toast(`${r.replaced ? 'Updated' : 'Published'} ${week.label} on the marketplace`, 'good')
  } catch (e) {
    toast(errorText(e), 'bad')
  }
}

/**
 * Publish every week you've written something in (or one course's), as a job.
 * Weeks already on the marketplace are replaced with what you have now.
 */
export async function publishAllToMarket(courseId?: string): Promise<boolean> {
  try {
    const status = await api.market.status()
    if (!status.url || !status.hasKey) {
      toast('Connect to a marketplace first: add its address and your API key here.', 'info')
      useStore.getState().go({ name: 'settings', tab: 'market' })
      return false
    }
    const weeks = await api.market.publishable(courseId ? { courseId } : undefined)
    if (!weeks.length) {
      toast('There’s nothing to publish yet: write some topics first.', 'info')
      return false
    }
    const courses = [...new Set(weeks.map((w) => w.course))]
    const ok = await confirmDialog(
      courseId ? `Publish ${courses[0]} to the marketplace?` : `Publish all your courses to the marketplace?`,
      `${plural(weeks.length, 'week')}${courseId ? '' : ` from ${plural(courses.length, 'course')} (${courses.join(', ')})`}, with their topics, questions, flashcards, slides and transcripts. Everyone on ${new URL(status.url).host} can see and add them. Weeks you published before are replaced with what you have now. Only weeks with a written topic are included, and your progress isn’t. Only publish material you’re allowed to share.`,
      { confirmText: `Publish ${plural(weeks.length, 'week')}` }
    )
    if (!ok) return false
    await api.market.publishAll(courseId ? { courseId } : undefined)
    toast(`Publishing ${plural(weeks.length, 'week')}. You can follow it in Jobs.`, 'info')
    return true
  } catch (e) {
    toast(errorText(e), 'bad')
    return false
  }
}

export const matchPercent = (m: MarketMatch) => `${Math.round(m.score * 100)}%`

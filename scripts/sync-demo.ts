// A desktop backend without the window, for trying the phone app: makes a demo
// library (decks, notes and a course written by the mock AI), then runs the
// phone sync server and prints the address and pairing code.
//
//   npm run sync:demo             (data in a temp folder, mock AI)
//   npm run mobile:dev            (in another terminal) then open http://localhost:5199

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

process.env.AI_MOCK ??= '1'
process.env.STUDYWISE_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'studywise-sync-demo-'))

async function main() {
  const db = await import('../src/main/db')
  const { paths } = await import('../src/main/paths')
  for (const d of [paths.userData, paths.attachments, paths.courses, paths.cache, paths.logs]) mkdirSync(d, { recursive: true })
  db.openDb(paths.db)
  const { seedPresets } = await import('../src/main/ai/presets')
  seedPresets()
  const repo = await import('../src/main/db/repo')
  const course = await import('../src/main/services/course')
  const { runHandler } = await import('../src/main/ipc')
  const server = await import('../src/main/sync/server')

  if (!repo.listDecks().length) {
    const ctx = { signal: new AbortController().signal, progress: () => {}, delta: () => {}, meta: () => {} }
    const c = course.createCourse({ name: 'Quantum 101', level: 'first-year physics' })
    const w = course.addWeek(c.id, 'Week 1')
    await course.addFiles(w.id, [resolve('tests/fixtures/photoelectric-lecture.pdf')])
    await course.planWeek(w.id, ctx)
    for (const t of course.listTopics(c.id).slice(0, 2)) await course.writeTopic(t.id, ctx)
    course.addWeek(c.id, 'Week 2')

    const folder = repo.createFolder('Biology', 'deck')
    const bio = repo.createDeck({ name: 'Cell biology', folder_id: folder.id, description: 'Organelles and what they do' })
    repo.createCards([
      { deck_id: bio.id, front: 'Mitochondria', back: 'Where aerobic respiration happens; makes most of the cell’s **ATP**.' },
      { deck_id: bio.id, front: 'Ribosome', back: 'Builds proteins from amino acids, reading mRNA.' },
      { deck_id: bio.id, front: 'Golgi apparatus', back: 'Modifies, packages and sends proteins and lipids.' },
      { deck_id: bio.id, front: 'Nucleus', back: 'Holds the DNA; controls the cell’s activity.' },
      { deck_id: bio.id, front: 'Cell membrane', back: 'Phospholipid bilayer that controls what enters and leaves.' }
    ] as never)
    const es = repo.createDeck({ name: 'Spanish verbs' })
    repo.createCards([
      { deck_id: es.id, front: 'tener', back: 'to have' },
      { deck_id: es.id, front: 'hacer', back: 'to do / to make' },
      { deck_id: es.id, front: 'poder', back: 'to be able to' }
    ] as never)
    repo.createNote({
      title: 'Enzymes',
      module: 'Biology',
      content: '# Enzymes\n\nBiological **catalysts**: they speed up reactions without being used up.\n\n- Lock and key: the substrate fits the active site\n- Induced fit: the active site changes shape slightly\n\n> [!tip] Denaturing\n> High temperature or the wrong pH changes the active site’s shape, so the substrate no longer fits.\n\n$$\\text{rate} \\propto [E]$$'
    })
  }

  server.configureSyncServer({ rpc: runHandler, onSynced: (n) => n && console.log(`[sync] ${n} change${n === 1 ? '' : 's'} from the phone`) })
  repo.setSetting('sync.port', Number(process.env.SYNC_PORT) || 47821)
  const st = await server.setSyncEnabled(true)
  if (!st.running) throw new Error(st.error ?? 'Server didn’t start')
  const codeFile = join(paths.userData, 'pair-code.txt')
  const showCode = () => {
    const code = server.newPairCode().pairCode!
    writeFileSync(codeFile, code)
    console.log(`Code:     ${code}   (also in ${codeFile})`)
  }
  console.log(`
Data:     ${paths.userData}`)
  console.log(`Address:  ${['127.0.0.1', ...st.addresses].map((a) => `${a}:${st.port}`).join('  ')}`)
  showCode()
  // A code works once (and for 10 minutes): keep one ready.
  setInterval(() => !server.syncStatus().pairCode && showCode(), 2000)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

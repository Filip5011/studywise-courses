# How Studywise Courses works

## Courses

A course is a run of weeks, and each week has its own files (PDF slides, transcripts as .txt/.vtt/.srt, Word, PowerPoint, Markdown). Files are copied into the course's folder, so moving the originals doesn't break anything.

**Planning a week.** The week's files are read as text (PDFs with `[page N]` markers; scanned PDFs are sent as files instead) and sent with the outline prompt, along with the topics earlier weeks already have. A topic is usually 4–8 one-screen sections; a genuinely complex one can have up to 10, and a section can run to about two screens when an idea needs it. Over about 300k characters, the week is planned one file at a time and the results are merged by title. Topics get course-wide ids like `w2t3`. Planning a week again replaces its topics.

**Writing a topic.** Only the topic's own week's files are sent, and PDFs are cut down to the pages in the outline's `sources` (a short PDF with no page range goes whole). Figures come back as a page in that excerpt and are mapped to the original page, then rendered to a PNG with pdf.js and cached. Questions that can't be asked as written are dropped. Recall cards go into that week's deck, tagged with the topic, replacing that topic's old cards.

**Flashcards by week.** Making a course makes a folder for it in Decks, and every week gets its own deck there ("Physics 101 · Week 1"), so the cards are grouped the way the course is. In Decks (and in the Notes sidebar), "All" groups items under their folders; click a folder to collapse it, and the app remembers which are collapsed. Notes folders can hold folders of their own (hover a folder in the sidebar and press the folder-plus button), and picking a folder shows everything inside it. Each written topic's notes go in the course's notes folder, in a folder for its week ("Physics 101 › Week 3"); notes from before that are moved there on startup, unless you've moved them somewhere else. Renaming the course or a week renames the folder and decks; deleting a week deletes its deck. Recall cards on the course page reviews what's due across all its weeks, and each week's page opens its own deck. Course → ⋯ → Models & instructions applies to every week deck at once, and new weeks pick it up. Courses made before this had one deck for everything: on startup their cards move into week decks (with their review history), and any cards you added yourself stay in a "· Other cards" deck in the same folder.

**Weeks.** The course page lists its weeks, one row each, with how many topics, files and flashcards it has and how far you've got. Click a week to open it: its topics come first, each with its sections listed underneath (ticked once you're past them; click one to open the topic at that section), then its files (click to open the course's copy, or show it in its folder), then its flashcards. Planning, writing, adding files, renaming and deleting the week all happen there, and the arrows at the bottom go to the week before or after.

**Learning.** Each section shows its notes, then that section's flashcards (the key terms), then its questions, so you know the definitions before you're tested. For each card you think of the answer, flip it, and rate yourself: Didn't know (1), Sort of (2) or Knew it (3). The rating goes into spaced repetition. After Didn't know or Sort of, the card goes to the back of the pile until you know it (up to four times; after that spaced review takes over), and you choose how to go over it: **Next**, **Re-read the notes** (the section's notes again, no AI) or **Explain it with AI** (a page that goes through it properly: plain meaning, the exact definition, why it matters, a worked example, the usual mistake and a way to remember it; one Explain call, only when you ask). **Back to the card** returns from either page. The ← button at the top (or B) goes back a step anywhere in a topic, for example from the questions to the notes; answers you already gave stay as they were. Topics written before this have no per-section cards and go straight to the questions; rewrite one (↻) to get them. Notes can include diagrams Claude draws itself as ```svg blocks; they're shown as images, so nothing inside them can run. **I don't get this** under a section's notes opens Explain with just that section: nothing runs until you type a question or pick Simpler, Example and so on, and only the section's notes are sent (no PDFs), so it's cheap. The ↻ button at the top rewrites the whole topic, with an optional note on what to change; that costs as much as writing it the first time, replaces its recall cards and resets its progress. The topic test is separate: the **Test** button on the week page (or **Take the test** when you finish a topic) asks the topic's 5–8 harder questions from memory, with no notes, and the week page shows your last score. Only your first try at each question counts. Multiple choice, true/false, fill in the blank (with alternatives), spot the wrong word, put in order, match and sort are marked in code; "in your own words" answers are marked by Claude out of 10. "I was right" overrides any mark. Your place is saved at every step (the notes, a flashcard or a particular question), so **Save & exit** (or Esc) and **Continue** on the week page carry on exactly where you were. After a section there's a 1 in 4 chance of a recall card from another topic you've started, due cards first; your answer goes into spaced repetition. A question you get wrong (or only partly right) comes back three steps later, marked "Try again", and keeps coming back until you get it right; only your first try counts towards the topic's score.

**Sharing a week.** A week's ⋯ menu has **Share this week…**, which saves a `.studyweek` file: the week's topics (notes, flashcards, questions and test), its recall cards and its source files (slides and transcripts, which topics need for their figures and for writing a topic again). Your progress, reviews and course settings stay behind. Whoever gets it adds it with **Add a shared week** on the Courses page (or the course's ⋯ menu, or by dropping or opening the file), into one of their courses or a new one named like yours. It goes in as that course's next week, with new ids, topic numbers to match its position (`w3t1` becomes `w5t1` as week 5), and a number on any week label or file name they already have. Nothing is generated, so it costs no tokens; topics that weren't written yet can be written there as normal. Slide figures aren't in the file: they're rendered again from the PDF when shown.

**Models.** The three course tasks are in Settings → Models like every other task (any model name, any effort). Course → ⋯ → Models & instructions overrides them for one course and adds extra instructions to its prompts.

`npm run ai:course-check` plans a week and writes a topic from the test PDF with real Claude calls (Sonnet by default, `-- --model=opus` to change). `node scripts/course-shots.mjs [dir]` walks through a mock course and screenshots each step.


## Talking to Claude

Every AI feature goes through one function, `runAI()` in `src/main/ai/`. It looks up the task's prompt and model, fills in the template, runs Claude Code, and checks what comes back.

Each prompt's fixed instructions, and the JSON format for JSON tasks, go in the system prompt, while the message only has what changes (the module, the files, the topic). Claude caches a repeated system prompt, so writing several topics, or the parts of a long PDF, reads those few thousand tokens from cache instead of paying for them again. Each call is `claude -p` in a new empty temp folder: prompt on stdin, `stream-json` output, no tools, limited turns, and no user settings or MCP servers. Structured tasks use `--json-schema` and the result is checked again with zod. If it doesn't fit, the reply and the problem are sent back on their own (no files or sources) to be corrected; only if that fails is the whole request run again. PDFs are the only exception to "no tools": the file is copied into the temp folder and only the read-only `Read` tool is allowed, so Claude sees the real pages, images included.

`ANTHROPIC_API_KEY` and similar variables are removed from the environment, so calls always use your Claude login and never an API account. Apps opened from Finder don't get your shell's `PATH`, so on startup Studywise asks your login shell for it, then also checks `~/.claude/local`, `~/.local/bin`, Homebrew, `/usr/local/bin` and npm's global bin. Settings → Claude Code shows what it found and lets you pick the binary yourself.

Calls run three at a time, time out after 120 seconds (15 minutes for generation), and retry once on network or overload errors. Each one is logged with its task, prompt version, model, time and tokens under Settings → AI usage. The plan-usage numbers Claude Code reports (5-hour and weekly) are shown in the top bar.

Long jobs (generating notes or cards) run in the main process. Closing the window doesn't stop them, you get a notification when one finishes, and the Jobs page can cancel them.

## Updating

A copy run from its git checkout (`npm run dev` or `npm start`) keeps itself up to date. Shortly after launch and every 30 minutes it runs `git fetch` and compares the branch with GitHub. When there are new commits, a banner under the top bar says how many and lists them. **Update & restart** runs `git pull --ff-only`, then `npm install` if `package.json` or `package-lock.json` changed, then quits and starts the app again with the same npm script. The new run is started from a detached helper, so it carries on after the old terminal session ends; its output goes to `logs/restart.log` in the data folder.

It won't start while a job is running. Uncommitted edits are kept unless they clash with the update, in which case nothing changes and the banner says so. If the branch has its own commits that aren't on GitHub, the banner tells you to merge by hand. **Later** hides the banner until more changes arrive. Installed builds don't show it.

## Using Ollama instead

Settings → AI provider switches every AI feature between Claude Code and Ollama. Ollama means Ollama Cloud (`https://ollama.com`, with an API key) or your own server (`http://localhost:11434`, which can also run `-cloud` models when you're signed in). The key is encrypted with the OS keychain (DPAPI on Windows), stored in the database as `secret.ollamaKey`, and never sent to the page. `OLLAMA_API_KEY` works too.

Calls go to `/api/chat`, streamed. Files can't be handed over as tools, so they're read in the app: text goes in `<file>` blocks (PDFs with `[page N]` markers), and PDFs with no text layer are sent as page images (24 at most), which needs a model with the `vision` capability. Cloud models don't support structured output, so JSON tasks rely on the schema in the prompt plus the usual zod check and one retry; local models also get `format` set to the schema and a bigger `num_ctx` (32k by default, changeable). Auto-continue keeps the conversation in memory. Thinking/effort maps to Ollama's `think` option: off, or low/medium/high (gpt-oss takes the level, other models just turn thinking on, and a model without thinking is retried without it). Inline `<think>` blocks are hidden.

Settings → Models lists the server's models (`/api/tags`) with their capabilities. Star a model to save it, and saved models come first in every picker; you can also save a model name that isn't listed. Pick a default model, then optionally a model and thinking level per task. Decks have their own Ollama overrides (stored as `ollama:<task>` in the deck's model overrides), and Claude settings are kept separately, so switching back loses nothing. A custom action whose model is a Claude name uses the task's Ollama model.

### On Windows

GUI apps get the full user PATH, so Studywise just looks there and in `%APPDATA%\npm` and `~\.local\bin`. npm installs `claude` as a `claude.cmd` shim, which can't be started without a shell, so Studywise runs the package's `cli.js` with `node.exe` directly. The native installer's `claude.exe` runs as is. The window uses Windows' own caption buttons, shortcuts show as Ctrl/Alt/Shift, and closing the window quits the app once no job is running. Data lives in `%APPDATA%\Studywise`.

## Plan usage per job

Each job (writing a topic, planning a week, generating notes or cards) shows how much of your Claude plan's 5-hour limit it used. Claude Code reports the 5-hour usage with every call, in whole percents and as it stood before that call, so the job takes the first reading during the job as "before", then makes one tiny Haiku call when it finishes to get a fresh "after". The difference shows in a toast, on the Jobs page and on the topic's row. It's marked as shared when other jobs ran at the same time, and it can't tell apart other use of your plan in the same minutes (Claude Code in a terminal, claude.ai). If the 5-hour window resets during a job, nothing is shown. Not measured with Ollama.

## Notes and flashcards

PDFs are split into 20-page chunks, the most Claude Code's Read tool takes in one go. Notes, flashcards and course topics leave out anything the material itself marks as not examinable ("non-examinable", "not assessed", "optional", "for interest only"), and keep anything that's unclear. For notes, each chunk is told what's already been written and the pieces are joined into one note that streams into the editor. Picking several sources switches to the "Linking texts" preset, which sends them in one call so they can be compared.

Cards come back in the StudySmarter text format (below). If a reply gets cut off, the half-finished card is dropped and Claude is told to "continue" in the same session, up to 10 times, with duplicates removed. Every card is checked: the `(n)` in a question has to match the number of bullets, fill-in-the-blank cards need one answer per blank and no `(n)`, and empty sides, duplicates and missing separators are flagged. Anything flagged gets a **Fix with AI** button in the preview.

## Learn mode

Each card becomes one of eight question types: Read & understand, Multiple choice, Free answer, True or false, Match pairs, Categorize, Fill in the blank and Choice blank. Blanks come from `___` in cloze cards or **bold** words in an answer. Questions are made eight cards per call when the session starts, the next batch is fetched ahead of time, and each question is cached per card and type until the card or prompt changes.

Multiple-choice options are shuffled in code (here and in course topics), so the right answer's position gives nothing away, and the prompts ask for options of the same length and level of detail, so the right one isn't simply the longest or most careful-sounding. Multiple choice, true/false, match pairs, categorize and choice blank are marked in code. Free answers are scored out of 10 by Claude against the card, with credit per required point (8+ correct, 4–7 partly right, 3 or less wrong; you can change these). Fill in the blank checks for an exact match first and only asks Claude about the blanks that don't match. Every result can be overridden with "I was right". A question you get wrong comes back three questions later, marked "Try again", and keeps coming back until it's right (Skip moves on without it). The retry is marked as normal but doesn't change the schedule or the session's score, since your first answer already did.

After an answer, **Get feedback** (or `w`) writes why yours was wrong, the key takeaways and a way to remember it. Nothing is generated until you press it. Hints come from the card first, then Claude, two at most, and never give away the answer.

Explain only runs when you ask. Open it on a card, a feedback panel or selected note text, then choose Explain, Simpler, Go deeper, Example, Diagram or Why was I wrong, or type a question. The answer can be saved to the card, saved to your notes (the whole conversation as a note, in a folder you pick, "Saved explanations" by default) or turned into new cards. **Back** (or Esc) closes it and returns to what you were doing.

## Models

Settings → Models sets a model and effort level for each task, with a Test button. Defaults: opus for notes and writing course topics; sonnet for planning course topics (it only reads text); haiku for marking blanks, hints and the quick note edits; sonnet for everything else. A deck can override any of these, and its "extra instructions" are added to every prompt for that deck.

## Prompts and custom actions

Every task's prompts live in Settings → Prompts. Built-in prompts you haven't edited follow the app's updates; once you edit one it's never overwritten, and Reset makes it follow updates again. You can edit them, see exactly what Claude will receive, test-run them, duplicate them, set a default, view the history with a diff, and reset built-ins. For JSON tasks the output format is added by the app, so a prompt edit can't break parsing.

Custom actions are your own AI buttons: a name, a prompt, a model, whether the result is Markdown or new cards, and where the button shows up (cards, note selection, Learn questions, after answering). Presets and actions export and import together as JSON.

## Spaced repetition

Two schedulers, switchable in Settings → General.

**Difficulty-based (default)**, modelled on real scheduling data: cards start at difficulty 0.60 with three 1-day steps, then intervals grow quickly (roughly 3, 8, 20, 115, 280 days and on) and shrink for harder cards. A card comes back after `interval × (0.694 − 0.187 × difficulty)` days. Success lowers difficulty, and forgetting a card sends it back to relearning.

**SM-2**: ease starts at 2.5, intervals go 1, 6, then interval × ease.

Flashcard mode uses Again / Hard / Good / Easy, Learn results feed the same schedule, and the Dock badge shows how many cards are due today. A card you mark Again comes back three cards later in the same session, and again each time, until you know it.

## Import and export

- **StudySmarter text**: `question/#*#/answer`, with cards separated by a line that's just `#`. A trailing `(n)` sets the required points, and `___` runs make a cloze card whose answers are the `- ` bullets. Round-trips exactly.
- **StudySmarter Excel**: Question, Answer A–F each followed by its "answer is correct" flag (TRUE/FALSE, `=TRUE()`, true/false or 1/0), then Tags, Hints and Explanation. A normal card exports as Answer A marked TRUE.
- Deck JSON and CSV.
- Notes from Notion or Obsidian: a single .md file, or a .zip of a Notion export or an Obsidian vault. Properties come from frontmatter (Obsidian) or the lines under the title (Notion) and fill Module, Type and Week; other frontmatter properties stay with the note. Notion's callouts (`<aside>`) and toggles (`<details>`) become callouts, links to other Notion pages become `[[links]]`, and images (Notion's relative paths, Obsidian's `![[embeds]]`, found next to the note or anywhere in the zip) are copied into the app. Notes show Obsidian's syntax: `> [!type]` callouts (foldable with + or -), `==highlights==`, `[[links]]` that open the note with that title, hidden `%%comments%%`, and frontmatter as a small properties table. **Export for Obsidian** writes frontmatter properties and native syntax, with images and drawn diagrams as files in `attachments/` next to the note. **Export for Notion** writes the title as a heading, properties as lines, callouts as quotes with an icon, highlights as bold and `[[links]]` as plain text; with images it's a .zip for Notion's Markdown import.
- **Anki** `.apkg` and `.colpkg`, both the old format (`collection.anki2`/`.anki21`, note types as JSON) and the current one (`collection.anki21b`, zstd-compressed, note types and media list in protobuf). Every Anki card becomes a card here: the card template is rendered (fields, `{{#…}}` sections, `text:`/`type:`/`hint:` filters, `{{FrontSide}}`), the answer side is cut at `<hr id=answer>`, and the HTML becomes Markdown, including bold, lists, sub/superscript, MathJax `\(…\)` and `[$]…[/$]` as KaTeX, and images copied into attachments. Sounds are dropped. Cloze notes become fill-in-the-blank cards, one per cloze number, with hints kept and "Back Extra" as the explanation. Image occlusion cards are skipped. Current Anki marks text columns with its own `unicase` collation, which SQLite outside Anki doesn't have; the importer swaps it for `NOCASE` in its temporary copy so the note type tables can be read. Import as new decks makes one deck per Anki deck (subdecks as "Parent › Child", in a folder named after the file when there are several), and importing into a deck puts everything there. Review progress comes too (interval, ease, reps, lapses, due date, last review, and FSRS difficulty when there is one) unless you turn it off in Settings → General. Drop an `.apkg` on the window or open it with Studywise to import it straight away.

PDF, Word and PowerPoint files can be dropped on the window or the Dock icon, or opened with **Open With → Studywise**.

## Shortcuts

There are a lot. `?` lists them all and `⌘K` searches everything. The main ones:

| | |
|---|---|
| `⌘N`, `⇧⌘N`, `⌥⌘N` | new card, note, deck |
| `⌘G`, `⇧⌘G` | generate flashcards, notes |
| `⌘L`, `⌘Y` | Learn, flashcards |
| `⌘E` | explain |
| `Space`, `1`–`4`, `↩` | flip, rate, submit |
| `h`, `s`, `r` | hint, skip, I was right |
| `g` then `d` / `n` / `s` | go to decks, notes, settings |
| `j`, `k`, `x`, `e` | move, select, explain in a card list |

## Your data

Everything is in `~/Library/Application Support/Studywise/` (on Windows, `%APPDATA%\Studywise`): the SQLite database, pasted images, a cache and logs. Settings → General can open the folder, back the whole library up to a zip, and restore it (the old database is kept alongside).

**Updating.** Run the new installer over the old one: it replaces the app wherever it was installed and never touches the data folder (on Windows that's `%APPDATA%\Studywise Courses`; uninstalling leaves it too). The first time a new version starts, it copies the database into `backups/before-<version>-…/` before migrating it, keeping the last five. To go back, quit the app and copy that `studywise.db` over the one in the data folder. A copy run from git counts a new commit (an update from the banner, or a pull) as a new version too, so it's backed up the same way.

**Moving to another computer.** Settings → General → Move to another computer exports everything to one `.studywise` file that works on Mac and Windows: decks, cards, notes, folders, courses with their copied files and figures, pasted images, prompts and custom actions. Progress (review history, due dates, where you are in each topic) only goes in if you tick "Include my progress". Importing (the same card, or dropping the file on the window) adds to the library that's there and never replaces anything; everything gets new ids, so importing twice gives two copies rather than a clash. Settings and API keys stay behind. Inside, it's a zip of `library.json`, `attachments/` and `courses/<id>/`, with course file paths stored relative to the course and file names made safe for both systems.

## Phone app and sync

The Android app (`src/mobile`, wrapped by Capacitor in `android/`) runs the same React app as the desktop, with a phone layout: a slim top bar, a tab bar at the bottom, study screens that take the whole screen, and keyboard hints, file pickers and desktop-only settings left out. Underneath, the desktop's main-process code (repo, course progress, learning) runs in the page on sql.js, SQLite compiled to WebAssembly; `vite.mobile.config.ts` swaps the database module and the Node, Electron, AI and file modules for phone versions. The database is saved to IndexedDB a moment after each write and when the app goes to the background.

`window.studywise` on the phone has the same channels as the desktop. Studying, reviews, decks, cards, notes and course progress run on the phone's copy. Anything that needs the computer (AI calls, writing topics, rendering slide figures, file imports) is sent to it: the phone syncs first, the computer runs the request through the same handlers as its own window, then the phone syncs again. Streamed text and job progress come back through a long poll. Figures and pasted images are fetched once and kept on the phone, so topics show them offline; figures for written topics are fetched after each sync.

**Syncing.** Thirteen tables sync (folders, decks, cards, notes and their deck links, review state and history, learn sessions and answers, courses, weeks, course files and topics). Settings, prompts, AI logs and caches stay on each device. Triggers record every write to a synced table in `sync_log` with a sequence number, a timestamp and the device it came from, so no other code knows about syncing. The phone sends the rows it changed since the computer last saw its log, then applies the computer's rows changed since it last looked (leaving out the phone's own changes). When both changed the same row, the later change wins. Deletes and cascades travel the same way; a row whose parent was deleted on the other side is removed (or its link cleared, for `ON DELETE SET NULL`). The first sync sends the whole library. The phone syncs when it opens, when it comes back to the front, every minute, a few seconds after a change, and before and after anything it asks the computer to do.

**Pairing.** Settings → Phone on the computer turns on a small HTTP server on the local network (port 47821) and shows the computer's addresses. Pair a phone shows a 6-digit code that works once, for 10 minutes, and is cancelled after 5 wrong tries. The phone gets a token (the computer keeps only its hash); everything except saying hello and pairing needs it. Unpairing on either side stops syncing; the phone keeps its copy. The server never opens dialogs for the phone, and it won't run anything that touches files on the computer, backups, settings or the Ollama key.


## Environment variables

| | |
|---|---|
| `AI_MOCK=1` | canned output for every AI task (used by tests) |
| `OLLAMA_API_KEY` | Ollama API key, if none is saved in Settings |
| `STUDYWISE_DATA_DIR` | use a different data folder |
| `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | signing and notarization at build time |

## Code layout

`src/main` is the Electron main process: database, Claude bridge, jobs, import/export and IPC. `src/preload` exposes `window.studywise.<area>.<method>()` to the page. `src/renderer` is the React UI. `src/shared` has the types, the StudySmarter parser, the schedulers, marking and the keymap. The page runs sandboxed with context isolation, a strict CSP and no remote content, and every IPC message is checked with zod.

Other scripts: `npm run ai:real-check` (one real call per task, plus notes and cards from a 12-page PDF), `node scripts/packaged-check.mjs` (a real generation through a built app with a Finder-like PATH), `npm run icons`, and `node scripts/screenshots.mjs [--dark]`.

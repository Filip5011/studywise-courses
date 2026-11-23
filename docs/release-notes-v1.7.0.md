## What's new

**You decide when a week is planned.** Adding files no longer starts planning by itself. Making a course, adding a week, Add files and dropping files on a week all add the files first, then ask whether to plan now. Pick **Not now** to add more files and plan later from the week page.

**Your own planning instructions, first.** The plan dialog has a box for instructions, such as "skip the guest lecture" or "give pointers their own topic". They're sent so they take priority over the app's usual planning rules.

**A note for the AI on every course.** Each course can have a note that goes into every prompt for that course: planning, writing topics, marking your answers, trimming cards, and Explain and Learn on its decks. For example: "This course is coding heavy and in C, so teach the theory and the coding together." Add it when you make the course, or from the course page.

**Three levels of detail for notes.**
- **Standard**: the usual notes, as before. This is the default.
- **Quick revision**: shorter sections that take less time, while still covering nearly everything.
- **In-depth**: a fuller write-up that goes slowly, with more worked examples, for topics you struggle with.

When you write topics you can tick more than one level. Every level you write is kept, and the week page has a switch on each topic to choose which one to study. Your progress is saved separately for each level. Inside a topic, ↻ (or ⋯ → Write at another level… on the week page) writes it at another level and keeps the ones you already have. A topic's recall cards stay the same across levels, so you keep their review history and don't get near-duplicate cards.

**Key-term flashcards: two greens to finish.** In a topic's flashcards:
- 🔴 **Didn't know**: the card comes back after 3 more cards.
- 🟡 **Sort of**: the card goes to the back of the pile.
- 🟢 **Knew it**: the card goes to the back too. Its second green finishes it, and then you move on.

Greens always count, whatever colours you pressed before, and dots by the card show how many greens it has. Only your first rating of each card goes into spaced repetition.

**Undo for "I was right".** After you press "I was right" (in a topic or in Learn), an **Undo** button puts the original mark back. In Learn this also puts your review schedule back. The U key works in topics, and pressing R again works in both.

**Answers move around when you redo questions.** Multiple-choice answers are in a new order each time you do a topic or its test again. A question that comes back to try again always has the right answer in a different place. Learn does the same, including for questions it saved from earlier sessions.

**More stats on the home page.** The flashcard preview on the home page is gone. In its place:
- time studied today, with a bar for each of the last 7 days
- total time studied, and the last 30 days
- your study streak
- topics done
- topic questions answered, and how many were right first time
- your topic test average
- cards reviewed
- retention

Time is counted while a topic, flashcards, Learn or a note is open and you're actively using the app. It syncs between your phone and computer.

## Download

Windows: download `Studywise-Courses-Setup.exe` and run it. If you already have Studywise Courses, it updates in place and keeps your courses, decks and progress (a backup of your library is saved first). On a Mac, build it from source with `npm install && npm run dist`.

You need Claude Code installed and logged in, or an Ollama server or an Ollama Cloud key:

```
npm install -g @anthropic-ai/claude-code
claude
```

The app isn't signed. On Windows, click More info, then Run anyway.

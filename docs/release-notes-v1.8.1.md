## What's new

**A course marketplace.** Weeks other people have made in Studywise, with their notes, questions, flashcards and slides, ready to add to your own courses. Adding one doesn't generate anything, so it costs no tokens.

**Connecting.** Make an account on a marketplace site (such as [courses.davidxie.dev](https://courses.davidxie.dev)), make an API key on its account page, then paste the site's address and the key into **Settings → Marketplace**. The key is stored encrypted, like an Ollama key.

**Browsing.** Open **Courses → Marketplace**.
- Search by course, module, topic or person, and sort by recent or popular.
- Open a course to see its weeks, and expand a week to see its topics, their sections and the levels they're written at.
- Every week shows who published it, which model and effort planned it, and which wrote its topics.
- **Add to my courses** puts a week into one of your courses or a new one.

Courses on the marketplace belong to nobody: everyone's weeks for the same course go into it, whatever they called it. "Software Engineering 1 (COMP23311)" and "Software Engineering 1" are one course, and so are "Intro to AI" and "Introduction to AI". Two different module codes are never merged. Each week belongs to whoever published it.

**Publishing.**
- **Publish to marketplace…** in a week's ⋯ menu publishes that week: its topics, cards, slides and transcripts, without your progress.
- **Publish course to marketplace…** in a course's ⋯ menu publishes every week of that course that has a written topic.
- **Publish all my courses** on the Marketplace page does it for everything.

**Publish my weeks automatically**, in Settings → Marketplace, publishes each week once its topics finish writing, and updates it when you write more. It's off until you turn it on. Weeks you added from someone else are never published automatically.

Publishing a week again replaces your earlier copy. Your own weeks show **Take down** instead of **Add to my courses**. Only publish slides and transcripts you're allowed to share.

**"Someone has already made this."** Before you plan a new week, Studywise checks whether someone else has published one made from the same material. If they have, it shows you what they made (how much matches, how many topics are written, which model wrote them) and offers **Use this week**, which fills your week from theirs at no cost, or **Plan it myself anyway**. Only a fingerprint of your files is sent for this check, never the files. With no marketplace connected, planning works as before.

**Which model made it.** Studywise now records the model and effort that planned each week and wrote each topic, and keeps that information when a week is shared. Weeks made before this version show "Model not recorded".

**Merging a shared week no longer duplicates your slides.** When a shared or marketplace week goes into one of your weeks that already has the same file, your copy is used instead of a second "(2)" copy.

**Host your own marketplace.** The server is [studywise-server](https://github.com/SnakeLuck360GT/studywise-server). It runs with Docker (`docker compose up -d`) or on an Ubuntu server with its setup script, and only accepts weeks made in Studywise.

## Download

Mac: download `Studywise-Courses.dmg`, open it and drag Studywise Courses to Applications. Windows: download `Studywise-Courses-Setup.exe` and run it. If you already have Studywise Courses, it updates in place and keeps your courses, decks and progress (a backup of your library is saved first).

You need Claude Code installed and logged in, or an Ollama server or an Ollama Cloud key:

```
npm install -g @anthropic-ai/claude-code
claude
```

The app isn't signed. On a Mac, right-click it and pick Open the first time. On Windows, click More info, then Run anyway.

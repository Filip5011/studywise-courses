## What's fixed

**Installing over an older version works again on Windows.** Installing a new version, or letting Studywise update itself, could stop with "Failed to uninstall old application files. Please try running the installer again.: 2" and leave the old version in place.

- Older versions included some files that only the phone app uses, buried in folders so deep that their full path went past Windows' 260-character limit. Windows' uninstaller can't remove files like that, so removing the old version failed. Whether you hit it depended on how long your Windows user name is.
- The installer now clears those files out first, so the old version uninstalls cleanly. Your courses, decks, notes and progress aren't touched.
- The desktop app no longer includes those files, so this won't happen again.

If you got the error with 1.8.7, this version fixes it: the update downloads by itself and installs when you restart, or download `Studywise-Courses-Setup.exe` and run it.

## Download

If you have 1.8.3 or later on Windows, Studywise offers this update by itself: it downloads in the background and installs when you restart.

Otherwise, on Windows, download `Studywise-Courses-Setup.exe` and run it. Your courses, decks and progress stay.

The app isn't signed. On Windows, click More info, then Run anyway.

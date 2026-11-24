/**
 * Self-update. A copy run from its git checkout (npm run dev / npm start)
 * pulls new commits ("git"). An installed build updates from GitHub releases
 * ("release"): on Windows it downloads and installs them; on a Mac (unsigned
 * builds can't replace themselves) it says there's a new version to download.
 */
export interface UpdateStatus {
  /** False for a folder that isn't a git checkout, or a build on another platform: no banner then. */
  supported: boolean
  kind: 'git' | 'release'
  /** Release updates: the newer version, once one is found. */
  version: string | null
  /** Release updates: downloaded, and installs on restart (Windows). */
  ready: boolean
  /** Release updates that can't install themselves (Mac): where to download it. */
  downloadUrl: string | null
  /** Commits on GitHub that this copy doesn't have yet (release updates: 1 when there's a new version). */
  behind: number
  /** Local commits that aren't on GitHub. An update would need a merge, so it isn't done automatically. */
  ahead: number
  /** Uncommitted edits to tracked files. Kept by the update unless they clash with it. */
  dirty: boolean
  branch: string | null
  /** Subjects of the new commits, newest first (up to 5). */
  changes: string[]
  state: 'idle' | 'checking' | 'updating' | 'restarting' | 'error'
  /** What an update is doing right now. */
  stage: string | null
  error: string | null
  checkedAt: string | null
}

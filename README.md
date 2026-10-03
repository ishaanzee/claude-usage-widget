# Claude Usage Widget

An iOS [Scriptable](https://scriptable.app) widget that shows your Claude session (5h) and weekly usage limits on your home or lock screen.

## How it works
- A SwiftBar plugin on your Mac (`~/.swiftbar/claude-usage.5m.sh`) writes `claude-usage.json` to `iCloud Drive/Claude Usage` every 5 minutes.
- The widget reads that file via iCloud and renders usage bars, reset times, and per-model weekly limits.

## Setup
1. Install Scriptable on your iPhone and add `Claude Usage.js` as a script.
2. In Scriptable: Settings → File Bookmarks → + → Pick Folder → `iCloud Drive/Claude Usage`. Name it `Claude Usage`.
3. Add a Scriptable widget to your home or lock screen and choose the script.

## Features
- Small, medium, and lock-screen (inline, circular, rectangular) sizes
- Bars turn amber at 70% and red at 90%
- Stale-data warning if the Mac hasn't updated in 30 minutes
- Tap to open claude.ai usage settings

# Claude Usage Widget

An iOS [Scriptable](https://scriptable.app) widget that shows your Claude session (5h) and weekly usage limits on your home or lock screen.

## Screenshots
| Small | Medium | Lock screen |
| --- | --- | --- |
| <img src="docs/small.png" width="180"> | <img src="docs/medium.png" width="380"> | <img src="docs/lock-screen.png" width="260"> |

## How it works
- The widget fetches usage directly from the phone, using your Claude Code login token stored in the iPhone Keychain.
- If that fails, it falls back to `claude-usage.json`, which a SwiftBar plugin on your Mac (`~/.swiftbar/claude-usage.5m.sh`) writes to `iCloud Drive/Claude Usage` every 5 minutes.
- The last good reading is cached on the phone, and the widget renders usage bars, reset times, and per-model weekly limits.

## Setup
1. Install Scriptable on your iPhone and add `Claude Usage.js` as a script.
2. Open the script once in the Scriptable app. It asks for your login token. On your Mac, get it with:
   ```sh
   security find-generic-password -s "Claude Code-credentials" -w | jq -r .claudeAiOauth.accessToken
   ```
   Paste the output. The token is stored in the Keychain and never written to this repo.
3. Optional fallback: Settings → File Bookmarks → + → Pick Folder → `iCloud Drive/Claude Usage`. Name it `Claude Usage`.
4. Add a Scriptable widget to your home or lock screen and choose the script.

If the token expires (HTTP 401), run the command again and paste the new token into the script. The widget does not refresh tokens itself, so it can't log Claude Code out.

## Features
- Small, medium, and lock-screen (inline, circular, rectangular) sizes
- Bars turn amber at 70% and red at 90%
- Remembers the last reading on-device, so it never goes blank if iCloud or the Mac is offline
- Static "Updated 3:45 PM" label, with an amber warning if data is over 30 minutes old
- Shows 0% once a reset time has passed, until fresh data arrives
- Tap to open claude.ai usage settings

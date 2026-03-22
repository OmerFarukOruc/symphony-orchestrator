# agent-browser Command Reference

Condensed reference for the most useful commands. Run `agent-browser --help` for the full list.

## Navigation

```bash
agent-browser open <url>              # Navigate to URL
agent-browser back                    # Go back
agent-browser forward                 # Go forward
agent-browser reload                  # Reload page
agent-browser close                   # Close browser
```

## Snapshots (AI-optimized)

```bash
agent-browser snapshot                # Full accessibility tree
agent-browser snapshot -i             # Interactive elements only (recommended)
agent-browser snapshot -i -C          # Include cursor-interactive elements
agent-browser snapshot -c             # Compact (remove empty nodes)
agent-browser snapshot -s "#selector" # Scope to CSS selector
agent-browser snapshot -d 3           # Limit depth
```

## Interaction (use @refs from snapshot)

```bash
agent-browser click @e1               # Click element
agent-browser fill @e2 "text"         # Clear and fill
agent-browser type @e2 "text"         # Type without clearing
agent-browser select @e1 "option"     # Select dropdown
agent-browser check @e1               # Check checkbox
agent-browser press Enter             # Press key
agent-browser scroll down 500         # Scroll page
agent-browser hover @e3               # Hover element
```

## Screenshots

```bash
agent-browser screenshot              # To temp dir
agent-browser screenshot path.png     # To specific path
agent-browser screenshot --full       # Full page
agent-browser screenshot --annotate   # With numbered element labels
agent-browser screenshot --annotate path.png  # Annotated to path
```

## Diffing

```bash
# Pixel diff against baseline
agent-browser diff screenshot --baseline before.png

# Save diff image
agent-browser diff screenshot --baseline before.png -o diff.png

# Adjust color threshold (0-1, default varies)
agent-browser diff screenshot --baseline before.png -t 0.2

# DOM-level diff (compares accessibility trees)
agent-browser diff snapshot
agent-browser diff snapshot --baseline before.txt

# Compare two URLs
agent-browser diff url <url1> <url2>
agent-browser diff url <url1> <url2> --screenshot
```

## Video Recording

```bash
agent-browser record start output.webm  # Start recording
agent-browser record stop               # Stop recording
```

## Get Info

```bash
agent-browser get text @e1            # Element text
agent-browser get url                 # Current URL
agent-browser get title               # Page title
agent-browser get count ".selector"   # Count matching elements
agent-browser get styles @e1          # Computed styles
```

## Wait

```bash
agent-browser wait @e1                # Wait for element
agent-browser wait --load networkidle # Wait for network idle
agent-browser wait --text "Welcome"   # Wait for text
agent-browser wait 2000               # Wait milliseconds
agent-browser wait "#el" --state hidden  # Wait for element to hide
```

## Viewport & Device

```bash
agent-browser set viewport 1920 1080      # Desktop
agent-browser set viewport 768 1024       # Tablet
agent-browser set viewport 375 812        # Mobile
agent-browser set viewport 1920 1080 2    # 2x retina
agent-browser set device "iPhone 14"      # Device emulation
agent-browser set media dark              # Dark mode
agent-browser set media light             # Light mode
```

## Sessions

```bash
agent-browser --session name open <url>   # Named session
agent-browser session list                # List active sessions
agent-browser --session name close        # Close specific session
```

## Debug

```bash
agent-browser errors                  # JS exceptions
agent-browser console                 # Console messages
agent-browser highlight @e1           # Highlight element
agent-browser inspect                 # Open Chrome DevTools
```

## Cookies & Storage

```bash
agent-browser cookies                 # View all cookies
agent-browser storage local           # View localStorage
agent-browser storage local clear     # Clear localStorage
```

## Network

```bash
agent-browser network requests                # View requests
agent-browser network requests --filter api   # Filter requests
agent-browser network har start               # Start HAR capture
agent-browser network har stop output.har     # Stop and save
```

## JavaScript Evaluation

```bash
# Simple expression
agent-browser eval 'document.title'

# Complex JS (use --stdin to avoid shell escaping)
agent-browser eval --stdin <<'EVALEOF'
JSON.stringify(
  Array.from(document.querySelectorAll("img"))
    .filter(i => !i.alt)
    .map(i => ({ src: i.src, width: i.width }))
)
EVALEOF
```

## Command Chaining

Chain independent commands with `&&`:

```bash
agent-browser open http://127.0.0.1:4000 && agent-browser wait --load networkidle && agent-browser snapshot -i
```

Run commands separately when you need to parse output first (e.g., snapshot to discover refs before interacting).

## Configuration

Project-level config in `agent-browser.json`:

```json
{
  "headed": true,
  "screenshotDir": "./docs/archive/screenshots",
  "screenshotFormat": "png"
}
```

> **Note:** `agent-browser` uses its own bundled Chromium. Run `agent-browser install` to download it. No `executablePath` is needed.

Priority: `~/.agent-browser/config.json` < `./agent-browser.json` < env vars < CLI flags.

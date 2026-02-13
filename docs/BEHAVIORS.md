# Expected Behaviors

This document tracks all expected behaviors of the Twitch Song Request Queue application. Use this as a reference when adding features or making changes to ensure existing behaviors are not broken.

**Testing Checklist:** When making changes, verify that all relevant behaviors listed here still work as expected.

---

## Now Playing Overlay

### Endpoint

- **Now Playing Overlay:**
  - Separate endpoint `/now-playing/` for OBS Browser Source
  - Displays currently playing song information as an overlay
  - Shows: thumbnail, title, requester name, progress bar with time
  - Can be added separately from the player endpoint

### Display Modes

- **Standard Mode** (rotation disabled):
  - Shows current song with progress bar
  - Auto-hides after configured duration (5s, 10s, or always)
  - Shows again when a new song starts playing
  - When queue is empty, shows "—" or hides completely

- **Rotation Mode** (rotation enabled):
  - Cycles through three views with smooth fade transitions:
    1. **Current song view**: Shows currently playing song with progress bar, title, requester
    2. **Next song preview**: Shows next song in queue (if available) with thumbnail and title
    3. **Instruction message**: Shows "Add songs using !{prefix} <youtube url>"
  - Each view displays for a fixed duration (current: ~4s, next: ~3s, instruction: ~3s)
  - Overlay stays visible continuously (doesn't auto-hide)
  - If queue is empty, skips next song view and shows instruction message more frequently
  - If only one song in queue, skips next song preview view
  - When song changes, immediately switches to current song view and restarts cycle

### Updates

- Overlay receives `NOW_PLAYING_UPDATE` messages with current song info and progress
- Overlay receives `QUEUE_UPDATE` messages when queue changes
- Progress updates in real-time (every second)
- Song info updates immediately when song changes

---

## Queue Management

### Adding Songs to Queue

- **Manual Add via URL Input:**
  - User can paste a YouTube URL (`https://www.youtube.com/watch?v=VIDEO_ID` or `https://youtu.be/VIDEO_ID`) into the URL input field
  - Clicking the "+" button or pressing Enter adds the video to the queue
  - If the same video (same videoId) is already in the queue, the song is not added and an alert shows: "This song is already in the queue."
  - Invalid URLs show an alert message
  - Added songs appear at the end of the queue
  - Queue count updates immediately
  - Video title is fetched asynchronously (may show videoId initially)
  - If queue was empty and `autoplayWhenEmpty` is enabled, the video starts playing automatically

- **Twitch Chat Commands:**
  - When Twitch is connected, viewers can use `!{commandPrefix} {YouTube URL}` to add songs
  - Command prefix defaults to `sr` (configurable in Settings)
  - Only valid YouTube URLs are processed
  - If the same video (same videoId) is already in the queue, the request is ignored (no message to chat; song is not added)
  - The requester's Twitch username is stored with the song
  - Songs are added to the end of the queue
  - Queue updates immediately in the dock

### Queue Display

- **Queue List:**
  - Shows all queued songs in order
  - First item (currently playing) is marked with "playing" class
  - First item cannot be dragged or double-clicked
  - Other items can be dragged to reorder (except first item)
  - Other items can be double-clicked to play immediately
  - Each item shows thumbnail, title, and requester name
  - Empty queue shows "Queue empty" message

- **Now Playing Section:**
  - Shows thumbnail, title, and requester of the currently playing song
  - Progress bar shows current time and duration
  - Updates in real-time as video plays
  - Shows "—" when queue is empty
  - Progress resets to "0:00 / 0:00" when queue is empty

### Queue Manipulation

- **Remove Song:**
  - Clicking "×" button removes a song from the queue
  - If removing the first (playing) song:
    - If queue has more songs, next song starts playing automatically
    - If queue becomes empty, player is cleared (no video shown)
  - If removing any other song, it's removed without affecting playback
  - Queue count updates immediately
  - Changes persist to localStorage

- **Skip to Next:**
  - Clicking "Skip" button removes the first song and plays the next
  - If queue becomes empty after skip, player is cleared (no video shown)
  - Queue count updates immediately
  - Changes persist to localStorage

- **Clear Queue:**
  - Clicking "Clear" button removes all songs from the queue
  - Player is cleared (no video shown) if connected
  - Queue count updates to "0 in queue"
  - Now Playing section shows "—"
  - Changes persist to localStorage

- **Reorder Queue:**
  - Songs (except first) can be dragged to reorder
  - Reordering does not affect currently playing song
  - Changes persist to localStorage

- **Play Song Immediately:**
  - Double-clicking any queued song (except first) moves it to the front and plays it
  - Currently playing song is moved back into the queue
  - Changes persist to localStorage

---

## Player Control

### Playback Commands

- **Play Button:**
  - If queue has songs and no video is loaded (`lastProgressDuration === 0`), loads and plays the first song
  - Otherwise, resumes playback of the current video
  - Only works when player is connected

- **Pause Button:**
  - Pauses the currently playing video
  - Does not clear the video from the player
  - Only works when player is connected

- **Skip Button:**
  - Removes current song from queue
  - Plays next song if available
  - Clears player if queue becomes empty
  - Only works when player is connected

### Player State

- **When Queue Becomes Empty:**
  - Player receives `CLEAR` message
  - YouTube player stops and clears the video
  - No video or player UI is shown
  - This happens when:
    - Last song is skipped
    - Last song is removed
    - Queue is cleared
    - Last song ends naturally (if no more songs)

- **Video Progress:**
  - Progress bar updates every second
  - Shows current time and total duration
  - Clicking progress bar seeks to that position
  - Progress resets when queue is empty

- **Volume Control:**
  - Volume slider controls player volume (0-100)
  - Changes are sent immediately to player
  - Only works when player is connected

- **Show Video Toggle:**
  - Toggles visibility of video on the overlay
  - Audio continues playing when video is hidden
  - Setting persists in localStorage
  - Only works when player is connected

---

## Twitch Integration

### Connection

- **Initial State:**
  - Dock starts with Twitch disconnected
  - Shows "Set your Twitch channel in Settings to listen to chat"
  - Connection status indicator shows "disconnected"

- **Connecting:**
  - User sets channel name and command prefix in Settings
  - Clicking "Save and reconnect" initiates connection
  - Status shows "Reconnecting…" during connection
  - Uses ComfyJS for anonymous Twitch chat connection

- **Connected State:**
  - Status shows "Connected"
  - Connection status indicator shows "connected"
  - Chat commands are processed and added to queue
  - Connection status updates in header and settings

- **Disconnecting:**
  - Clicking "Disconnect from Twitch" disconnects
  - Status shows "Disconnected"
  - Chat commands are no longer processed

- **Error Handling:**
  - Connection errors are displayed in status message
  - Connection state updates to "disconnected"
  - User can retry by saving settings again

### Chat Commands

- **Command Format:**
  - `!{commandPrefix} {YouTube URL}`
  - Default prefix is `sr` (e.g., `!sr https://youtube.com/...`)
  - Prefix is configurable (without the `!`)

- **Processing:**
  - Only valid YouTube URLs are processed
  - Invalid URLs are ignored (no error shown to user)
  - Requester's username is stored with the song
  - Songs are added to the end of the queue

---

## Settings

### Configuration

- **Twitch Channel:**
  - Text input for channel name
  - Must be set to enable Twitch connection
  - Saved to localStorage
  - Changes require "Save and reconnect" to take effect

- **Command Prefix:**
  - Text input for command prefix (without `!`)
  - Defaults to `sr`
  - Saved to localStorage
  - Changes require "Save and reconnect" to take effect

- **Autoplay When Empty:**
  - Checkbox toggle
  - When enabled, first song added to empty queue starts playing automatically
  - Only works when player is connected
  - Saved to localStorage

- **Show Video Toggle:**
  - Button toggle (eye icon)
  - Controls video visibility on overlay
  - Audio continues when video is hidden
  - Saved to localStorage

- **Show Wheel on Stream:**
  - Button toggle (eye icon) in Spin the Wheel tab
  - When enabled, shows wheel overlay on player
  - Saved to localStorage

- **Now Playing Display Duration:**
  - Select dropdown with options: "5 seconds", "10 seconds", "Always"
  - Controls how long the Now Playing overlay stays visible (when rotation is disabled)
  - Default: "5 seconds"
  - Saved to localStorage

- **Enable Rotation Effect:**
  - Checkbox toggle
  - When enabled, Now Playing overlay cycles through: current song, next song preview, instruction message
  - When disabled, shows only current song and respects display duration setting
  - Default: disabled
  - Saved to localStorage

### Settings Panel

- **Opening:**
  - Click gear icon in header
  - Panel slides in from right
  - Overlay appears behind panel

- **Closing:**
  - Click "×" button
  - Click overlay
  - Panel slides out

- **Connection Status Display:**
  - Shows overlay and Twitch connection status
  - Updates in real-time
  - Color-coded (connected/waiting/disconnected)

---

## Spin the Wheel

### Wheel Display

- **Initial State:**
  - Wheel is hidden when queue is empty
  - Hint message shows: "Add songs to the queue, then spin to pick one"
  - Spin button is disabled when queue is empty

- **With Songs:**
  - Wheel shows all songs in queue as segments
  - Each segment is color-coded
  - Labels show song titles (truncated if too long)
  - Spin button is enabled

### Spinning

- **Spin Action:**
  - Clicking "SPIN!" button starts animation
  - Random winner is selected before animation starts
  - Wheel animates for 4 seconds
  - Animation uses easing for smooth stop
  - Spin button is disabled during animation

- **Winner Display:**
  - After animation, winner is shown
  - "Play this song" button appears
  - Winner can be played immediately

- **Playing Winner:**
  - Clicking "Play this song" removes winner from queue
  - Winner plays immediately (becomes now playing)
  - Wheel overlay hides
  - If "Show wheel on stream" is enabled, player shows spin animation

### Stream Overlay

- **Show Wheel on Stream:**
  - Toggle button in Spin the Wheel tab
  - When enabled, player shows wheel overlay
  - Wheel updates when queue changes
  - Can be toggled on/off

- **Spin Animation on Stream:**
  - When spin is triggered and "Show wheel on stream" is enabled
  - Player shows dimmed video with spinning wheel overlay
  - Animation matches dock animation
  - Overlay hides when winner is played or spin ends

---

## Connection States

### Player (Overlay) Connection

- **Waiting:**
  - Initial state when dock loads
  - Status indicator shows "waiting" (yellow)
  - Tooltip: "Connecting to player… Open the player as a Browser Source in OBS"
  - Player commands are not sent

- **Connected:**
  - Player sends `PLAYER_HELLO` and periodic `PLAYER_PING`
  - Status indicator shows "connected" (green)
  - Tooltip: "Player (overlay) is connected — videos will play in OBS"
  - Player commands are sent and executed
  - Ping timeout is 10 seconds

- **Disconnected:**
  - No ping received for 10 seconds
  - Status indicator shows "disconnected" (red)
  - Tooltip: "Player disconnected — open the player as a Browser Source in OBS"
  - Player commands are not sent

### Twitch Connection

- **Disconnected:**
  - Initial state or after disconnect
  - Status indicator shows "disconnected" (red)
  - Tooltip: "Set your Twitch channel in Settings to listen to chat" (if no channel) or "Twitch disconnected. Check Settings or reconnect."
  - Chat commands are not processed

- **Connecting:**
  - After saving settings with channel name
  - Status indicator shows "connecting" (yellow)
  - Tooltip: "Reconnecting to Twitch…"

- **Connected:**
  - Successfully connected to Twitch chat
  - Status indicator shows "connected" (green)
  - Tooltip: "Connected to #{channel} — chat requests will be added to the queue"
  - Chat commands are processed

---

## Persistence

### Queue Persistence

- **Storage:**
  - Queue is saved to localStorage with key `mr-queue`
  - Saved whenever queue changes (add, remove, reorder, clear)
  - Includes videoId, requestedBy, and title (if fetched)

- **Restoration:**
  - Queue is loaded from localStorage on dock startup
  - Titles are refetched if missing
  - Queue count and display update immediately

### Configuration Persistence

- **Storage:**
  - Configuration saved to localStorage with key `mr-config`
  - Includes: channel, commandPrefix, showVideo, showWheelOnStream, autoplayWhenEmpty, nowPlayingDisplayDuration, nowPlayingRotationEnabled
  - Saved when settings are changed

- **Restoration:**
  - Configuration loaded on dock startup
  - Settings panel shows saved values
  - Twitch connection attempts to reconnect if channel is set

---

## Video Playback

### Automatic Playback

- **When Video Ends:**
  - Player sends `VIDEO_ENDED` message
  - If `nowPlayingOverride` exists (from spin), it's cleared
  - Current song is removed from queue
  - Next song starts playing automatically
  - If queue becomes empty, player is cleared

- **Autoplay When Empty:**
  - When enabled and player is connected
  - First song added to empty queue starts playing immediately
  - Does not require manual play button

### Manual Playback Control

- **Play Button:**
  - If no video loaded and queue has songs, loads first song
  - Otherwise resumes paused video
  - Only works when player connected

- **Pause Button:**
  - Pauses current video
  - Does not clear video
  - Only works when player connected

- **Seeking:**
  - Click progress bar to seek
  - Only works when video is loaded and player connected
  - Seeks to clicked position immediately

---

## UI/UX

### Status Indicators

- **Header Status:**
  - Shows overlay and Twitch connection status
  - Color-coded dots (green/yellow/red)
  - Tooltips explain current state
  - Updates in real-time

- **Settings Status:**
  - Shows connection status summary
  - Updates when connections change
  - Color-coded based on overall state

### Queue Count

- **Display:**
  - Shows "{count} in queue" in header
  - Updates immediately when queue changes
  - Shows "0 in queue" when empty

### Empty States

- **Empty Queue:**
  - Queue list shows "Queue empty"
  - Now Playing shows "—" for title and requester
  - Progress shows "0:00 / 0:00"
  - Spin button disabled
  - Wheel hidden

- **No Player Connection:**
  - Play/Pause/Skip buttons may not work
  - Volume slider may not work
  - Status shows disconnected state

---

## Error Handling

### Invalid URLs

- **Manual Add:**
  - Shows alert: "Paste a YouTube URL: https://www.youtube.com/watch?v=VIDEO_ID or https://youtu.be/VIDEO_ID"
  - Song is not added to queue

- **Twitch Commands:**
  - Invalid URLs are silently ignored
  - No error shown to user or streamer

### Connection Errors

- **Twitch Connection:**
  - Errors are displayed in status message
  - Connection state updates to disconnected
  - User can retry by saving settings

- **Player Connection:**
  - Timeout after 10 seconds of no ping
  - Status updates to disconnected
  - User must open player in OBS to reconnect

### Missing Titles

- **Title Fetching:**
  - Multiple fallback methods used
  - If all fail, videoId is displayed instead
  - Titles are cached to avoid refetching

---

## Testing Checklist

When making changes, verify these behaviors:

- [ ] Adding songs via URL input works
- [ ] Duplicate song (same videoId) is rejected for manual add with alert; Twitch duplicate is silently ignored
- [ ] Adding songs via Twitch chat works
- [ ] Removing songs works (first and others)
- [ ] Skipping songs works
- [ ] Clearing queue works
- [ ] Reordering queue works
- [ ] Playing song immediately works
- [ ] Queue persists across page reload
- [ ] Settings persist across page reload
- [ ] Player clears when queue becomes empty
- [ ] Next song plays automatically when current ends
- [ ] Autoplay when empty works
- [ ] Connection states update correctly
- [ ] Progress bar updates and seeking works
- [ ] Volume control works
- [ ] Show video toggle works
- [ ] Spin wheel works
- [ ] Show wheel on stream works
- [ ] Now Playing updates correctly
- [ ] Queue count updates correctly
- [ ] Now Playing overlay endpoint works
- [ ] Now Playing overlay shows/hides based on duration setting
- [ ] Now Playing overlay rotation mode cycles through views correctly
- [ ] Now Playing overlay shows correct song info and progress

---

## Notes

- All behaviors assume dock and player are in the same browser process
- Player commands only work when player is connected
- Queue changes persist to localStorage immediately
- Video titles are fetched asynchronously and may appear after song is added
- Player clears completely when queue becomes empty (no video shown)

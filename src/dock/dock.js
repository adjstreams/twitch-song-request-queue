(function () {
  "use strict";

  const BC_NAME = "streamgood-mr";
  const PING_INTERVAL_MS = 3000;
  const DISCONNECT_TIMEOUT_MS = 10000;
  const STORAGE_KEY_QUEUE = "mr-queue";
  const STORAGE_KEY_CONFIG = "mr-config";
  const DEFAULT_CONFIG = { channel: "", commandPrefix: "sr", showVideo: false, showWheelOnStream: false, autoplayWhenEmpty: false, nowPlayingDisplayMode: "always", nowPlayingShowNext: false, nowPlayingShowAddMessage: false, nowPlayingPanelDuration: 3 };

  const overlayStatusEl = document.getElementById("overlayStatus");
  const channelStatusEl = document.getElementById("channelStatus");
  const settingsConnectionStatusEl = document.getElementById("settingsConnectionStatus");
  const queueListEl = document.getElementById("queueList");
  const urlInputEl = document.getElementById("urlInput");
  const addUrlBtn = document.getElementById("addUrl");
  const twitchStatusEl = document.getElementById("twitchStatus");
  const twitchDisconnectBtn = document.getElementById("twitchDisconnect");
  const configChannelEl = document.getElementById("configChannel");
  const configCommandEl = document.getElementById("configCommand");
  const configSaveBtn = document.getElementById("configSave");
  const settingsPanel = document.getElementById("settingsPanel");
  const settingsToggle = document.getElementById("settingsToggle");
  const settingsClose = document.getElementById("settingsClose");
  const settingsOverlay = document.getElementById("settingsOverlay");
  const tabQueue = document.getElementById("tabQueue");
  const tabSpinner = document.getElementById("tabSpinner");
  const panelQueue = document.getElementById("panelQueue");
  const panelSpinner = document.getElementById("panelSpinner");
  const queueCountEl = document.getElementById("queueCount");
  const nowPlayingThumb = document.getElementById("nowPlayingThumb");
  const nowPlayingTitle = document.getElementById("nowPlayingTitle");
  const nowPlayingRequestedBy = document.getElementById("nowPlayingRequestedBy");
  const progressBar = document.getElementById("progressBar");
  const progressFill = document.getElementById("progressFill");
  const progressCurrent = document.getElementById("progressCurrent");
  const progressDuration = document.getElementById("progressDuration");
  const volumeSlider = document.getElementById("volumeSlider");
  const showVideoToggle = document.getElementById("showVideoToggle");
  const spinBtn = document.getElementById("spinBtn");
  const spinWheelWrap = document.getElementById("spinWheelWrap");
  const spinWheelCanvas = document.getElementById("spinWheelCanvas");
  const spinResult = document.getElementById("spinResult");
  const spinWinnerTitle = document.getElementById("spinWinnerTitle");
  const spinPlayWinner = document.getElementById("spinPlayWinner");
  const spinHint = document.getElementById("spinHint");
  const showWheelOnStreamBtn = document.getElementById("showWheelOnStreamBtn");
  const autoplayWhenEmptyToggle = document.getElementById("autoplayWhenEmptyToggle");
  const nowPlayingDisplayModeEl = document.getElementById("nowPlayingDisplayMode");
  const nowPlayingShowNextEl = document.getElementById("nowPlayingShowNext");
  const nowPlayingShowAddMessageEl = document.getElementById("nowPlayingShowAddMessage");
  const nowPlayingPanelDurationEl = document.getElementById("nowPlayingPanelDuration");
  const panelDurationValueEl = document.getElementById("panelDurationValue");

  let queue = [];
  let playerConnected = false;
  let playerStatus = "waiting";
  let twitchInitialized = false;
  let twitchConnectionState = "disconnected";
  let lastPingAt = 0;
  let pingTimeoutId = null;
  let lastProgressDuration = 0;
  let lastProgressCurrentTime = 0;
  let draggedIndex = -1;
  let spinWinnerItem = null;
  let nowPlayingOverride = null;
  const titleCache = {};
  const WHEEL_COLORS = ["#a855f7", "#7c3aed", "#6d28d9", "#5b21b6", "#4c1d95"];

  function formatTime(seconds) {
    if (typeof seconds !== "number" || !isFinite(seconds) || seconds < 0) return "0:00";
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function updateProgress(currentTime, duration) {
    lastProgressDuration = duration;
    lastProgressCurrentTime = currentTime;
    if (progressFill) progressFill.style.width = duration > 0 ? (100 * currentTime / duration) + "%" : "0%";
    if (progressCurrent) progressCurrent.textContent = formatTime(currentTime);
    if (progressDuration) progressDuration.textContent = formatTime(duration);
    sendNowPlayingUpdate(currentTime, duration);
  }

  function sendNowPlayingUpdate(currentTime, duration) {
    var item = nowPlayingOverride || (queue.length > 0 ? queue[0] : null);
    if (item) {
      send({
        type: "NOW_PLAYING_UPDATE",
        videoId: item.videoId,
        title: item.label || item.title || null,
        requestedBy: item.requestedBy || "—",
        currentTime: typeof currentTime === "number" ? currentTime : 0,
        duration: typeof duration === "number" ? duration : 0
      });
    } else {
      send({
        type: "NOW_PLAYING_UPDATE",
        videoId: "",
        title: null,
        requestedBy: "—",
        currentTime: 0,
        duration: 0
      });
    }
  }

  function sendQueueUpdate() {
    var config = getConfig();
    send({
      type: "QUEUE_UPDATE",
      queue: queue.map(function (item) {
        return {
          videoId: item.videoId,
          title: item.label || item.title || null,
          requestedBy: item.requestedBy || "—"
        };
      }),
      commandPrefix: config.commandPrefix || "sr",
      displayMode: config.nowPlayingDisplayMode || "always",
      showNext: config.nowPlayingShowNext === true,
      showAddMessage: config.nowPlayingShowAddMessage === true,
      panelDuration: config.nowPlayingPanelDuration || 3
    });
  }

  function getConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.channel === "string" && typeof parsed.commandPrefix === "string") {
          return {
            channel: (parsed.channel && parsed.channel.trim()) || "",
            commandPrefix: (parsed.commandPrefix.trim() || DEFAULT_CONFIG.commandPrefix).replace(/^!/, ""),
            showVideo: parsed.showVideo === true,
            showWheelOnStream: parsed.showWheelOnStream === true,
            autoplayWhenEmpty: parsed.autoplayWhenEmpty === true,
            nowPlayingDisplayMode: parsed.nowPlayingDisplayMode === "once" || parsed.nowPlayingDisplayMode === "always" ? parsed.nowPlayingDisplayMode : (parsed.nowPlayingDisplayDuration === "always" ? "always" : "once"),
            nowPlayingShowNext: parsed.nowPlayingShowNext === true,
            nowPlayingShowAddMessage: parsed.nowPlayingShowAddMessage === true,
            nowPlayingPanelDuration: typeof parsed.nowPlayingPanelDuration === "number" ? parsed.nowPlayingPanelDuration : (typeof parsed.nowPlayingRotationInterval === "number" ? parsed.nowPlayingRotationInterval : DEFAULT_CONFIG.nowPlayingPanelDuration),
          };
        }
      }
    } catch (_) {}
    return { ...DEFAULT_CONFIG };
  }

  function saveConfig(config) {
    try {
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
    } catch (_) {}
  }

  function setStatus(s) {
    playerStatus = s;
    playerConnected = s === "connected";
    updateHeaderStatus();
    updateSettingsConnectionStatus();
  }

  function updateHeaderStatus() {
    var overlayDot = overlayStatusEl && overlayStatusEl.querySelector(".status-dot");
    if (overlayDot) {
      overlayDot.className = "status-dot " + (playerConnected ? "connected" : playerStatus === "waiting" ? "waiting" : "disconnected");
      overlayStatusEl.title = playerConnected ? "Player (overlay) is connected — videos will play in OBS." : (playerStatus === "waiting" ? "Connecting to player… Open the player as a Browser Source in OBS." : "Player disconnected — open the player as a Browser Source in OBS.");
    }
    var channelDot = channelStatusEl && channelStatusEl.querySelector(".status-dot");
    if (channelDot) {
      channelDot.className = "status-dot " + twitchConnectionState;
      var config = getConfig();
      var ch = config.channel && config.channel.trim();
      if (twitchConnectionState === "connected") channelStatusEl.title = "Connected to #" + ch + " — chat requests will be added to the queue.";
      else if (twitchConnectionState === "connecting") channelStatusEl.title = "Reconnecting to Twitch…";
      else channelStatusEl.title = ch ? "Twitch disconnected. Check Settings or reconnect." : "Set your Twitch channel in Settings to listen to chat.";
    }
  }

  function updateSettingsConnectionStatus() {
    if (!settingsConnectionStatusEl) return;
    var overlayText = playerConnected ? "Connected" : (playerStatus === "waiting" ? "Connecting…" : "Disconnected");
    var channelText = twitchConnectionState === "connected" ? "Connected" : (twitchConnectionState === "connecting" ? "Reconnecting…" : "Disconnected");
    var config = getConfig();
    if (!(config.channel && config.channel.trim())) channelText = "Set channel below";
    settingsConnectionStatusEl.textContent = "Overlay: " + overlayText + " · Twitch: " + channelText;
    var state = "disconnected";
    if (playerConnected && twitchConnectionState === "connected") state = "connected";
    else if (playerStatus === "waiting" || twitchConnectionState === "connecting") state = "waiting";
    settingsConnectionStatusEl.className = "settings-connection-status state-" + state;
  }

  function extractVideoId(text) {
    var t = text.trim();
    var m = t.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
    m = t.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  function thumbnailUrl(videoId) {
    return "https://img.youtube.com/vi/" + videoId + "/mqdefault.jpg";
  }

  function parseTitleFromHtml(html) {
    if (!html || typeof html !== "string") return null;
    // Try og:title meta tag first
    var ogMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
    if (ogMatch && ogMatch[1]) return ogMatch[1];
    // Try JSON-LD structured data
    var jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (jsonLdMatch && jsonLdMatch[1]) {
      try {
        var jsonLd = JSON.parse(jsonLdMatch[1]);
        if (jsonLd && jsonLd.name && typeof jsonLd.name === "string") return jsonLd.name;
        if (jsonLd && Array.isArray(jsonLd) && jsonLd[0] && jsonLd[0].name) return jsonLd[0].name;
      } catch (_) {}
    }
    // Try title tag (format: "Video Title - YouTube")
    var titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      var title = titleMatch[1].trim();
      if (title.endsWith(" - YouTube")) title = title.slice(0, -10).trim();
      if (title) return title;
    }
    return null;
  }

  function fetchVideoTitle(videoId, callback) {
    if (titleCache[videoId] !== undefined) {
      callback(titleCache[videoId]);
      return;
    }
    var watchUrl = "https://www.youtube.com/watch?v=" + encodeURIComponent(videoId);
    
    function tryNextFallback(fallbackIndex) {
      if (fallbackIndex >= fallbacks.length) {
        titleCache[videoId] = null;
        callback(null);
        return;
      }
      var fallback = fallbacks[fallbackIndex];
      fallback()
        .then(function (title) {
          if (title) {
            titleCache[videoId] = title;
            callback(title);
          } else {
            tryNextFallback(fallbackIndex + 1);
          }
        })
        .catch(function () {
          tryNextFallback(fallbackIndex + 1);
        });
    }
    
    var fallbacks = [
      // Primary: Try oEmbed via allOrigins proxy
      function () {
        var oembedUrl = "https://www.youtube.com/oembed?url=" + encodeURIComponent(watchUrl) + "&format=json";
        var proxyUrl = "https://api.allorigins.win/raw?url=" + encodeURIComponent(oembedUrl);
        return fetch(proxyUrl)
          .then(function (res) { return res.ok ? res.text() : Promise.reject(); })
          .then(function (text) {
            try {
              var data = JSON.parse(text);
              return data && typeof data.title === "string" ? data.title : null;
            } catch (_) {
              return null;
            }
          })
          .catch(function () { return null; });
      },
      // Fallback 1: Try noembed.com (direct call, no proxy needed)
      function () {
        return fetch("https://noembed.com/embed?dataType=json&url=" + encodeURIComponent(watchUrl))
          .then(function (res) { return res.ok ? res.json() : Promise.reject(); })
          .then(function (data) {
            return data && typeof data.title === "string" ? data.title : null;
          })
          .catch(function () { return null; });
      },
      // Fallback 2: Try alternative CORS proxy (corsproxy.io) for oEmbed
      function () {
        var oembedUrl = "https://www.youtube.com/oembed?url=" + encodeURIComponent(watchUrl) + "&format=json";
        return fetch("https://corsproxy.io/?" + encodeURIComponent(oembedUrl))
          .then(function (res) { return res.ok ? res.text() : Promise.reject(); })
          .then(function (text) {
            try {
              var data = JSON.parse(text);
              return data && typeof data.title === "string" ? data.title : null;
            } catch (_) {
              return null;
            }
          })
          .catch(function () { return null; });
      },
      // Fallback 3: Scrape YouTube watch page HTML via allOrigins
      function () {
        return fetch("https://api.allorigins.win/raw?url=" + encodeURIComponent(watchUrl))
          .then(function (res) { return res.ok ? res.text() : Promise.reject(); })
          .then(function (html) {
            return parseTitleFromHtml(html);
          })
          .catch(function () { return null; });
      },
      // Fallback 4: Try alternative proxy for HTML scraping
      function () {
        return fetch("https://corsproxy.io/?" + encodeURIComponent(watchUrl))
          .then(function (res) { return res.ok ? res.text() : Promise.reject(); })
          .then(function (html) {
            return parseTitleFromHtml(html);
          })
          .catch(function () { return null; });
      }
    ];
    
    tryNextFallback(0);
  }

  function displayTitle(item) {
    return (item && (item.title || item.videoId)) || "—";
  }

  function ensureTitlesThenRefresh() {
    queue.forEach(function (item) {
      if (item.title !== undefined) return;
      fetchVideoTitle(item.videoId, function (title) {
        item.title = title !== null ? title : item.videoId;
        updateNowPlaying();
        renderQueue();
      });
    });
  }

  function isInQueue(videoId) {
    if (!videoId || typeof videoId !== "string") return false;
    return queue.some(function (item) { return item.videoId === videoId; });
  }

  function addToQueue(videoId, requestedBy) {
    if (isInQueue(videoId)) return false;
    queue.push({ videoId: videoId, requestedBy: requestedBy || "Manual Add" });
    persistQueue();
    renderQueue();
    updateNowPlaying();
    updateQueueCount();
    ensureTitlesThenRefresh();
    if (playerConnected && queue.length === 1 && getConfig().autoplayWhenEmpty) {
      sendLoadAndPlay(queue[0].videoId);
    }
    return true;
  }

  function persistQueue() {
    try {
      localStorage.setItem(STORAGE_KEY_QUEUE, JSON.stringify(queue.map(function (q) {
        return { videoId: q.videoId, requestedBy: q.requestedBy || "—", title: q.title };
      })));
    } catch (_) {}
  }

  function loadQueueFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_QUEUE);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          queue = parsed.map(function (item) {
            if (typeof item === "string") return { videoId: item, requestedBy: "—" };
            return { videoId: item.videoId, requestedBy: item.requestedBy || "—", title: item.title };
          });
        }
        renderQueue();
        updateNowPlaying();
        updateQueueCount();
        ensureTitlesThenRefresh();
      }
    } catch (_) {}
  }

  function updateNowPlaying() {
    var item = nowPlayingOverride || (queue.length > 0 ? queue[0] : null);
    if (nowPlayingThumb) {
      nowPlayingThumb.innerHTML = "";
      if (item) {
        var img = document.createElement("img");
        img.src = thumbnailUrl(item.videoId);
        img.alt = "";
        nowPlayingThumb.appendChild(img);
      }
    }
    if (nowPlayingTitle) nowPlayingTitle.textContent = item ? (item.label || item.title || item.videoId) : "—";
    if (nowPlayingRequestedBy) nowPlayingRequestedBy.textContent = item ? "Requested by " + (item.requestedBy || "—") : "Requested by —";
    if (queue.length === 0 && progressFill && progressCurrent && progressDuration) {
      progressFill.style.width = "0%";
      progressCurrent.textContent = "0:00";
      progressDuration.textContent = "0:00";
      lastProgressDuration = 0;
    }
    sendNowPlayingUpdate(lastProgressCurrentTime, lastProgressDuration);
    sendQueueUpdate();
  }

  function updateQueueCount() {
    if (queueCountEl) queueCountEl.textContent = queue.length + " in queue";
  }

  function moveQueueItem(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= queue.length || toIndex >= queue.length) return;
    var item = queue.splice(fromIndex, 1)[0];
    queue.splice(toIndex, 0, item);
    persistQueue();
    renderQueue();
    updateNowPlaying();
    updateQueueCount();
  }

  function playQueueItemAt(index) {
    if (index <= 0 || index >= queue.length) return;
    var item = queue.splice(index, 1)[0];
    queue.unshift(item);
    sendLoadAndPlay(queue[0].videoId);
    persistQueue();
    renderQueue();
    updateNowPlaying();
    updateQueueCount();
  }

  function removeQueueItemAt(index) {
    if (index < 0 || index >= queue.length) return;
    var wasFirst = index === 0;
    queue.splice(index, 1);
    persistQueue();
    renderQueue();
    updateNowPlaying();
    updateQueueCount();
    if (wasFirst && playerConnected) {
      if (queue.length > 0) sendLoadAndPlay(queue[0].videoId);
      else {
        lastProgressDuration = 0;
        send({ type: "CLEAR" });
        updateVideoVisibility();
      }
    }
  }

  function drawWheel(ctx, segments, rotationDeg, size) {
    var cx = size;
    var cy = size;
    var r = size - 4;
    var n = segments.length;
    if (n === 0) return;
    var step = (2 * Math.PI) / n;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((rotationDeg * Math.PI) / 180);
    ctx.translate(-cx, -cy);
    for (var i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, i * step, (i + 1) * step);
      ctx.closePath();
      ctx.fillStyle = WHEEL_COLORS[i % WHEEL_COLORS.length];
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();
      var midAngle = (i + 0.5) * step;
      var label = segments[i].label;
      if (label && label.length > 12) label = label.slice(0, 11) + "…";
      ctx.save();
      ctx.translate(cx + (r * 0.6) * Math.sin(midAngle), cy - (r * 0.6) * Math.cos(midAngle));
      ctx.rotate(midAngle);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.font = "11px sans-serif";
      ctx.fillText(label || "", 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  function runWheelAnimation(canvas, segments, winnerIndex, durationMs, onComplete) {
    var ctx = canvas.getContext("2d");
    var size = Math.min(canvas.width, canvas.height) / 2;
    var n = segments.length;
    if (n === 0) { if (onComplete) onComplete(); return; }
    var spins = 5;
    var segmentDeg = 360 / n;
    var endRotation = spins * 360 + (360 - (winnerIndex + 0.5) * segmentDeg);
    var startTime = null;
    function frame(t) {
      if (!startTime) startTime = t;
      var elapsed = t - startTime;
      var progress = Math.min(1, elapsed / durationMs);
      var ease = 1 - Math.pow(1 - progress, 3);
      var rotation = endRotation * ease;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawWheel(ctx, segments, rotation, size);
      if (progress < 1) requestAnimationFrame(frame);
      else if (onComplete) onComplete();
    }
    requestAnimationFrame(frame);
  }

  function updateSpinButtonState() {
    if (spinBtn) spinBtn.disabled = queue.length === 0;
    if (spinHint) spinHint.hidden = queue.length > 0;
    if (spinWheelWrap) spinWheelWrap.hidden = queue.length === 0;
    if (queue.length > 0 && spinWheelWrap && !spinWheelWrap.hidden && spinWheelCanvas && !spinWinnerItem) {
      var segs = queue.map(function (item) { return { videoId: item.videoId, label: item.title || item.videoId }; });
      var ctx = spinWheelCanvas.getContext("2d");
      var size = Math.min(spinWheelCanvas.width, spinWheelCanvas.height) / 2;
      ctx.clearRect(0, 0, spinWheelCanvas.width, spinWheelCanvas.height);
      drawWheel(ctx, segs, 0, size);
    }
  }

  function renderQueue() {
    if (!queueListEl) return;
    queueListEl.innerHTML = "";
    if (queue.length === 0) {
      var empty = document.createElement("li");
      empty.className = "queue-empty";
      empty.textContent = "Queue empty";
      queueListEl.appendChild(empty);
      return;
    }
    queue.forEach(function (item, i) {
      var li = document.createElement("li");
      li.setAttribute("data-index", i);
      if (i === 0) li.classList.add("playing");
      if (i >= 1) {
        li.setAttribute("draggable", "true");
        li.title = "Double-click to play now";
      }
      var thumb = document.createElement("div");
      thumb.className = "queue-item-thumb";
      var img = document.createElement("img");
      img.src = thumbnailUrl(item.videoId);
      img.alt = "";
      thumb.appendChild(img);
      var body = document.createElement("div");
      body.className = "queue-item-body";
      var title = document.createElement("p");
      title.className = "queue-item-title";
      title.textContent = displayTitle(item);
      var meta = document.createElement("p");
      meta.className = "queue-item-meta";
      meta.textContent = (item.requestedBy || "—");
      body.appendChild(title);
      body.appendChild(meta);
      li.appendChild(thumb);
      li.appendChild(body);

      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "queue-item-remove icon-btn";
      removeBtn.setAttribute("aria-label", "Remove from queue");
      removeBtn.title = "Remove from queue";
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        e.preventDefault();
        removeQueueItemAt(i);
      });
      li.appendChild(removeBtn);

      if (i >= 1) {
        li.addEventListener("dragstart", function (e) {
          draggedIndex = i;
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", i);
          li.classList.add("queue-item-dragging");
        });
        li.addEventListener("dragend", function () {
          queueListEl.querySelectorAll(".queue-item-dragging, .queue-item-drop-target").forEach(function (el) {
            el.classList.remove("queue-item-dragging", "queue-item-drop-target");
          });
          draggedIndex = -1;
        });
        li.addEventListener("dragover", function (e) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          var targetIndex = parseInt(li.getAttribute("data-index"), 10);
          if (targetIndex >= 1 && draggedIndex >= 1 && targetIndex !== draggedIndex) {
            li.classList.add("queue-item-drop-target");
          }
        });
        li.addEventListener("dragleave", function () {
          li.classList.remove("queue-item-drop-target");
        });
        li.addEventListener("drop", function (e) {
          e.preventDefault();
          li.classList.remove("queue-item-drop-target");
          var dropIndex = parseInt(li.getAttribute("data-index"), 10);
          if (draggedIndex >= 1 && dropIndex >= 1 && draggedIndex !== dropIndex) {
            var toIndex = draggedIndex < dropIndex ? dropIndex - 1 : dropIndex;
            moveQueueItem(draggedIndex, toIndex);
          }
          draggedIndex = -1;
        });
        li.addEventListener("dblclick", function () {
          playQueueItemAt(i);
        });
      }

      queueListEl.appendChild(li);
    });
    updateSpinButtonState();
  }

  var bc = new BroadcastChannel(BC_NAME);

  bc.onmessage = function (e) {
    var msg = e.data;
    if (!msg || typeof msg.type !== "string") return;
    if (msg.type === "PLAYER_HELLO" || msg.type === "PLAYER_PING") {
      lastPingAt = Date.now();
      if (!playerConnected) {
        setStatus("connected");
        var cfg = getConfig();
        updateVideoVisibility();
        if (cfg.showWheelOnStream) sendShowWheelOnStream();
      }
      if (pingTimeoutId) clearTimeout(pingTimeoutId);
      pingTimeoutId = setTimeout(checkPingTimeout, DISCONNECT_TIMEOUT_MS);
    } else if (msg.type === "NOW_PLAYING_REQUEST") {
      // Now-playing overlay is requesting current state
      sendNowPlayingUpdate(lastProgressCurrentTime, lastProgressDuration);
      sendQueueUpdate();
    } else if (msg.type === "PLAYER_PROGRESS") {
      if (typeof msg.currentTime === "number" && typeof msg.duration === "number") {
        updateProgress(msg.currentTime, msg.duration);
      }
    } else if (msg.type === "VIDEO_ENDED") {
      if (nowPlayingOverride) {
        nowPlayingOverride = null;
        updateNowPlaying();
        updateQueueCount();
        if (queue.length > 0) sendLoadAndPlay(queue[0].videoId);
        else {
          lastProgressDuration = 0;
          send({ type: "CLEAR" });
          updateVideoVisibility();
        }
      } else if (queue.length > 0) {
        queue.shift();
        persistQueue();
        renderQueue();
        updateNowPlaying();
        updateQueueCount();
        if (queue.length > 0) sendLoadAndPlay(queue[0].videoId);
        else {
          lastProgressDuration = 0;
          send({ type: "CLEAR" });
          updateVideoVisibility();
        }
      }
    }
  };

  function checkPingTimeout() {
    if (Date.now() - lastPingAt >= DISCONNECT_TIMEOUT_MS) {
      setStatus("disconnected");
      pingTimeoutId = null;
    }
  }

  function send(msg) {
    bc.postMessage(msg);
  }

  function updateVideoVisibility() {
    if (!playerConnected) return;
    var c = getConfig();
    // Only show video if showVideo is enabled AND there's a video loaded or queued
    var shouldShow = c.showVideo && (lastProgressDuration > 0 || queue.length > 0);
    send({ type: "SET_VIDEO_VISIBLE", visible: shouldShow });
  }

  function seekTo(timeSeconds) {
    if (!playerConnected || lastProgressDuration <= 0) return;
    var t = Math.max(0, Math.min(lastProgressDuration, timeSeconds));
    send({ type: "SEEK", timeSeconds: t });
  }

  function sendLoadAndPlay(videoId) {
    if (!playerConnected) return;
    var c = getConfig();
    if (c.showVideo) {
      send({ type: "SET_VIDEO_VISIBLE", visible: true });
    }
    send({ type: "LOAD_VIDEO", videoId: videoId });
    send({ type: "PLAY" });
  }

  function startQueue() {
    if (!playerConnected) return;
    // Don't play if queue is empty
    if (queue.length === 0) return;
    // If there's a video in the queue but no video is currently loaded (lastProgressDuration === 0),
    // load and play it. This handles the case when autoplay is disabled and a video was just added.
    // Otherwise, resume playback of the current video.
    if (queue.length > 0 && lastProgressDuration === 0) {
      sendLoadAndPlay(queue[0].videoId);
    } else {
      // If there's a current video (override or queue[0]), resume playback instead of restarting
      // The player's PLAY handler will resume if paused, or play if ended/cued
      send({ type: "PLAY" });
    }
  }

  function stopQueue() {
    if (!playerConnected) return;
    send({ type: "PAUSE" });
  }

  function skipToNext() {
    if (!playerConnected) return;
    if (queue.length > 0) {
      queue.shift();
      persistQueue();
      renderQueue();
      updateNowPlaying();
      updateQueueCount();
      if (queue.length > 0) {
        sendLoadAndPlay(queue[0].videoId);
      } else {
        lastProgressDuration = 0;
        send({ type: "CLEAR" });
        updateVideoVisibility();
      }
    }
  }

  function connectTwitch() {
    var config = getConfig();
    if (!config.channel || !config.channel.trim()) {
      twitchConnectionState = "disconnected";
      if (twitchStatusEl) twitchStatusEl.textContent = "Set your Twitch channel in Settings to listen to chat.";
      updateHeaderStatus();
      updateSettingsConnectionStatus();
      return;
    }
    ComfyJS.onCommand = function (user, command, message, flags, extra) {
      if (command !== config.commandPrefix) return;
      var videoId = extractVideoId(message || "");
      if (videoId) addToQueue(videoId, user || "—");
    };
    ComfyJS.onConnected = function () {
      twitchConnectionState = "connected";
      twitchStatusEl.textContent = "Connected.";
      updateHeaderStatus();
      updateSettingsConnectionStatus();
    };
    ComfyJS.onError = function (err) {
      twitchConnectionState = "disconnected";
      twitchStatusEl.textContent = "Error: " + (err && err.message ? err.message : String(err));
      updateHeaderStatus();
      updateSettingsConnectionStatus();
    };
    twitchConnectionState = "connecting";
    updateHeaderStatus();
    updateSettingsConnectionStatus();
    ComfyJS.Init(config.channel.trim());
    twitchInitialized = true;
  }

  addUrlBtn.addEventListener("click", function () {
    var videoId = extractVideoId(urlInputEl.value);
    if (videoId) {
      if (addToQueue(videoId)) {
        urlInputEl.value = "";
      } else {
        alert("This song is already in the queue.");
      }
    } else {
      alert("Paste a YouTube URL: https://www.youtube.com/watch?v=VIDEO_ID or https://youtu.be/VIDEO_ID");
    }
  });

  urlInputEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter") addUrlBtn.click();
  });

  document.getElementById("clearQueue").addEventListener("click", function () {
    queue = [];
    persistQueue();
    renderQueue();
    updateNowPlaying();
    updateQueueCount();
    if (playerConnected) {
      lastProgressDuration = 0;
      send({ type: "CLEAR" });
      updateVideoVisibility();
    }
  });

  document.getElementById("startQueue").addEventListener("click", startQueue);
  document.getElementById("stopQueue").addEventListener("click", stopQueue);
  document.getElementById("skipNext").addEventListener("click", skipToNext);

  if (progressBar) {
    progressBar.addEventListener("click", function (e) {
      if (lastProgressDuration <= 0) return;
      var rect = progressBar.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var ratio = Math.max(0, Math.min(1, x / rect.width));
      seekTo(ratio * lastProgressDuration);
    });
  }

  if (tabQueue && tabSpinner && panelQueue && panelSpinner) {
    tabQueue.addEventListener("click", function () {
      tabQueue.classList.add("active");
      tabQueue.setAttribute("aria-selected", "true");
      tabSpinner.classList.remove("active");
      tabSpinner.setAttribute("aria-selected", "false");
      panelQueue.classList.add("active");
      panelQueue.hidden = false;
      panelSpinner.classList.remove("active");
      panelSpinner.hidden = true;
    });
    tabSpinner.addEventListener("click", function () {
      tabSpinner.classList.add("active");
      tabSpinner.setAttribute("aria-selected", "true");
      tabQueue.classList.remove("active");
      tabQueue.setAttribute("aria-selected", "false");
      panelSpinner.classList.add("active");
      panelSpinner.hidden = false;
      panelQueue.classList.remove("active");
      panelQueue.hidden = true;
    });
  }

  function openSettings() {
    updateSettingsConnectionStatus();
    if (settingsPanel) settingsPanel.classList.add("open");
    if (settingsPanel) settingsPanel.setAttribute("aria-hidden", "false");
    if (settingsOverlay) settingsOverlay.classList.add("open");
  }
  function closeSettings() {
    if (settingsPanel) settingsPanel.classList.remove("open");
    if (settingsPanel) settingsPanel.setAttribute("aria-hidden", "true");
    if (settingsOverlay) settingsOverlay.classList.remove("open");
  }
  if (settingsToggle) settingsToggle.addEventListener("click", openSettings);
  if (settingsClose) settingsClose.addEventListener("click", closeSettings);
  if (settingsOverlay) settingsOverlay.addEventListener("click", closeSettings);

  if (spinBtn) {
    spinBtn.addEventListener("click", function () {
      if (queue.length === 0) return;
      var winnerIndex = Math.floor(Math.random() * queue.length);
      var segments = queue.map(function (item) {
        return { videoId: item.videoId, label: item.title || item.videoId };
      });
      spinWinnerItem = { videoId: queue[winnerIndex].videoId, label: segments[winnerIndex].label };
      var showWheelOnStream = showWheelOnStreamBtn && showWheelOnStreamBtn.getAttribute("aria-pressed") === "true";
      if (!showWheelOnStream) showWheelOnStream = getConfig().showWheelOnStream === true;
      if (showWheelOnStream) {
        send({
          type: "SPIN_START",
          segments: segments,
          winnerIndex: winnerIndex,
        });
      }
      if (spinResult) spinResult.hidden = true;
      if (spinWheelWrap) spinWheelWrap.hidden = false;
      spinBtn.disabled = true;
      runWheelAnimation(
        spinWheelCanvas,
        segments,
        winnerIndex,
        4000,
        function () {
          if (spinWinnerTitle) spinWinnerTitle.textContent = spinWinnerItem.label;
          if (spinResult) spinResult.hidden = false;
          spinBtn.disabled = false;
        }
      );
    });
  }

  if (spinPlayWinner) {
    spinPlayWinner.addEventListener("click", function () {
      if (!spinWinnerItem) return;
      var videoId = spinWinnerItem.videoId;
      var label = spinWinnerItem.label;
      var item = queue.find(function (q) { return q.videoId === videoId; });
      if (item) {
        queue.splice(queue.indexOf(item), 1);
        persistQueue();
        renderQueue();
        updateQueueCount();
      }
      nowPlayingOverride = { videoId: videoId, label: label, requestedBy: "Spin" };
      sendLoadAndPlay(videoId);
      send({ type: "SPIN_END" });
      spinWinnerItem = null;
      if (spinResult) spinResult.hidden = true;
      updateSpinButtonState();
      updateNowPlaying();
    });
  }

  function sendShowWheelOnStream() {
    var segments = queue.map(function (item) {
      return { videoId: item.videoId, label: item.title || item.videoId };
    });
    send({ type: "SPIN_SHOW_WHEEL", segments: segments });
  }

  if (showWheelOnStreamBtn) {
    function updateShowWheelOnStreamButton() {
      var c = getConfig();
      showWheelOnStreamBtn.setAttribute("aria-pressed", c.showWheelOnStream ? "true" : "false");
    }
    updateShowWheelOnStreamButton();
    showWheelOnStreamBtn.addEventListener("click", function () {
      var c = getConfig();
      c.showWheelOnStream = !c.showWheelOnStream;
      saveConfig({ channel: c.channel, commandPrefix: c.commandPrefix, showVideo: c.showVideo, showWheelOnStream: c.showWheelOnStream, autoplayWhenEmpty: c.autoplayWhenEmpty, nowPlayingDisplayMode: c.nowPlayingDisplayMode, nowPlayingShowNext: c.nowPlayingShowNext, nowPlayingShowAddMessage: c.nowPlayingShowAddMessage, nowPlayingPanelDuration: c.nowPlayingPanelDuration });
      updateShowWheelOnStreamButton();
      if (c.showWheelOnStream) sendShowWheelOnStream();
      else send({ type: "SPIN_END" });
    });
  }

  if (volumeSlider) {
    volumeSlider.addEventListener("input", function () {
      var val = parseInt(volumeSlider.value, 10);
      if (!isNaN(val)) send({ type: "SET_VOLUME", value: val });
    });
  }

  if (showVideoToggle) {
    function updateShowVideoButton() {
      var c = getConfig();
      showVideoToggle.setAttribute("aria-pressed", c.showVideo ? "true" : "false");
    }
    updateShowVideoButton();
    showVideoToggle.addEventListener("click", function () {
      var c = getConfig();
      c.showVideo = !c.showVideo;
      saveConfig({ channel: c.channel, commandPrefix: c.commandPrefix, showVideo: c.showVideo, showWheelOnStream: c.showWheelOnStream, autoplayWhenEmpty: c.autoplayWhenEmpty, nowPlayingDisplayMode: c.nowPlayingDisplayMode, nowPlayingShowNext: c.nowPlayingShowNext, nowPlayingShowAddMessage: c.nowPlayingShowAddMessage, nowPlayingPanelDuration: c.nowPlayingPanelDuration });
      updateShowVideoButton();
      updateVideoVisibility();
    });
  }

  if (autoplayWhenEmptyToggle) {
    function updateAutoplayToggle() {
      var c = getConfig();
      autoplayWhenEmptyToggle.checked = c.autoplayWhenEmpty === true;
    }
    updateAutoplayToggle();
    autoplayWhenEmptyToggle.addEventListener("change", function () {
      var c = getConfig();
      c.autoplayWhenEmpty = autoplayWhenEmptyToggle.checked;
      saveConfig({ channel: c.channel, commandPrefix: c.commandPrefix, showVideo: c.showVideo, showWheelOnStream: c.showWheelOnStream, autoplayWhenEmpty: c.autoplayWhenEmpty, nowPlayingDisplayMode: c.nowPlayingDisplayMode, nowPlayingShowNext: c.nowPlayingShowNext, nowPlayingShowAddMessage: c.nowPlayingShowAddMessage, nowPlayingPanelDuration: c.nowPlayingPanelDuration });
    });
  }

  if (nowPlayingDisplayModeEl) {
    function updateNowPlayingDisplayMode() {
      var c = getConfig();
      nowPlayingDisplayModeEl.value = c.nowPlayingDisplayMode || "always";
    }
    updateNowPlayingDisplayMode();
    nowPlayingDisplayModeEl.addEventListener("change", function () {
      var c = getConfig();
      c.nowPlayingDisplayMode = nowPlayingDisplayModeEl.value === "once" ? "once" : "always";
      saveConfig({ channel: c.channel, commandPrefix: c.commandPrefix, showVideo: c.showVideo, showWheelOnStream: c.showWheelOnStream, autoplayWhenEmpty: c.autoplayWhenEmpty, nowPlayingDisplayMode: c.nowPlayingDisplayMode, nowPlayingShowNext: c.nowPlayingShowNext, nowPlayingShowAddMessage: c.nowPlayingShowAddMessage, nowPlayingPanelDuration: c.nowPlayingPanelDuration });
    });
  }

  if (nowPlayingShowNextEl) {
    function updateNowPlayingShowNext() {
      var c = getConfig();
      nowPlayingShowNextEl.checked = c.nowPlayingShowNext === true;
    }
    updateNowPlayingShowNext();
    nowPlayingShowNextEl.addEventListener("change", function () {
      var c = getConfig();
      c.nowPlayingShowNext = nowPlayingShowNextEl.checked;
      saveConfig({ channel: c.channel, commandPrefix: c.commandPrefix, showVideo: c.showVideo, showWheelOnStream: c.showWheelOnStream, autoplayWhenEmpty: c.autoplayWhenEmpty, nowPlayingDisplayMode: c.nowPlayingDisplayMode, nowPlayingShowNext: c.nowPlayingShowNext, nowPlayingShowAddMessage: c.nowPlayingShowAddMessage, nowPlayingPanelDuration: c.nowPlayingPanelDuration });
    });
  }

  if (nowPlayingShowAddMessageEl) {
    function updateNowPlayingShowAddMessage() {
      var c = getConfig();
      nowPlayingShowAddMessageEl.checked = c.nowPlayingShowAddMessage === true;
    }
    updateNowPlayingShowAddMessage();
    nowPlayingShowAddMessageEl.addEventListener("change", function () {
      var c = getConfig();
      c.nowPlayingShowAddMessage = nowPlayingShowAddMessageEl.checked;
      saveConfig({ channel: c.channel, commandPrefix: c.commandPrefix, showVideo: c.showVideo, showWheelOnStream: c.showWheelOnStream, autoplayWhenEmpty: c.autoplayWhenEmpty, nowPlayingDisplayMode: c.nowPlayingDisplayMode, nowPlayingShowNext: c.nowPlayingShowNext, nowPlayingShowAddMessage: c.nowPlayingShowAddMessage, nowPlayingPanelDuration: c.nowPlayingPanelDuration });
    });
  }

  if (nowPlayingPanelDurationEl && panelDurationValueEl) {
    function updatePanelDuration() {
      var c = getConfig();
      var duration = c.nowPlayingPanelDuration || 3;
      nowPlayingPanelDurationEl.value = duration;
      panelDurationValueEl.textContent = duration;
    }
    updatePanelDuration();
    nowPlayingPanelDurationEl.addEventListener("input", function () {
      var duration = parseInt(nowPlayingPanelDurationEl.value, 10);
      panelDurationValueEl.textContent = duration;
      var c = getConfig();
      c.nowPlayingPanelDuration = duration;
      saveConfig({ channel: c.channel, commandPrefix: c.commandPrefix, showVideo: c.showVideo, showWheelOnStream: c.showWheelOnStream, autoplayWhenEmpty: c.autoplayWhenEmpty, nowPlayingDisplayMode: c.nowPlayingDisplayMode, nowPlayingShowNext: c.nowPlayingShowNext, nowPlayingShowAddMessage: c.nowPlayingShowAddMessage, nowPlayingPanelDuration: c.nowPlayingPanelDuration });
    });
  }

  twitchDisconnectBtn.addEventListener("click", function () {
    if (twitchInitialized) {
      ComfyJS.Disconnect();
      twitchInitialized = false;
    }
    twitchConnectionState = "disconnected";
    twitchStatusEl.textContent = "Disconnected.";
    updateHeaderStatus();
    updateSettingsConnectionStatus();
  });

  if (configSaveBtn && configChannelEl && configCommandEl) {
    var config = getConfig();
    configChannelEl.value = config.channel;
    configCommandEl.value = config.commandPrefix;
    configSaveBtn.addEventListener("click", function () {
      var prev = getConfig();
      var channel = (configChannelEl.value || "").trim();
      var commandPrefix = (configCommandEl.value || "").trim().replace(/^!/, "") || DEFAULT_CONFIG.commandPrefix;
      saveConfig({ channel: channel, commandPrefix: commandPrefix, showVideo: prev.showVideo, showWheelOnStream: prev.showWheelOnStream, autoplayWhenEmpty: prev.autoplayWhenEmpty, nowPlayingDisplayMode: prev.nowPlayingDisplayMode, nowPlayingShowNext: prev.nowPlayingShowNext, nowPlayingShowAddMessage: prev.nowPlayingShowAddMessage, nowPlayingPanelDuration: prev.nowPlayingPanelDuration });
      if (twitchInitialized) {
        ComfyJS.Disconnect();
        twitchInitialized = false;
      }
      twitchConnectionState = "connecting";
      twitchStatusEl.textContent = "Reconnecting…";
      updateTwitchLabel();
      updateHeaderStatus();
      updateSettingsConnectionStatus();
      connectTwitch();
    });
  }

  function updateTwitchLabel() {
    var config = getConfig();
    var label = document.getElementById("twitchChannelLabel");
    if (label) {
      if (config.channel && config.channel.trim()) {
        label.textContent = "Twitch: listening to #" + config.channel + " (anonymous). ";
      } else {
        label.textContent = "Twitch: set your channel in the field below to listen to chat.";
      }
    }
  }

  updateTwitchLabel();
  loadQueueFromStorage();
  updateQueueCount();
  updateNowPlaying();
  setStatus("waiting");
  connectTwitch();
  updateHeaderStatus();
  updateSettingsConnectionStatus();
})();

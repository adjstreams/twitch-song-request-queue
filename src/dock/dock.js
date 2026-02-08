(function () {
  "use strict";

  const BC_NAME = "streamgood-mr";
  const PING_INTERVAL_MS = 3000;
  const DISCONNECT_TIMEOUT_MS = 10000;
  const STORAGE_KEY_QUEUE = "mr-queue";
  const STORAGE_KEY_CONFIG = "mr-config";
  const DEFAULT_CONFIG = { channel: "adjstreams", commandPrefix: "sr", showVideo: false };

  const statusEl = document.getElementById("statusText");
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

  let queue = [];
  let playerConnected = false;
  let lastPingAt = 0;
  let pingTimeoutId = null;
  let lastProgressDuration = 0;
  let draggedIndex = -1;
  const titleCache = {};

  function formatTime(seconds) {
    if (typeof seconds !== "number" || !isFinite(seconds) || seconds < 0) return "0:00";
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function updateProgress(currentTime, duration) {
    lastProgressDuration = duration;
    if (progressFill) progressFill.style.width = duration > 0 ? (100 * currentTime / duration) + "%" : "0%";
    if (progressCurrent) progressCurrent.textContent = formatTime(currentTime);
    if (progressDuration) progressDuration.textContent = formatTime(duration);
  }

  function getConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.channel === "string" && typeof parsed.commandPrefix === "string") {
          return {
            channel: parsed.channel.trim() || DEFAULT_CONFIG.channel,
            commandPrefix: (parsed.commandPrefix.trim() || DEFAULT_CONFIG.commandPrefix).replace(/^!/, ""),
            showVideo: parsed.showVideo === true,
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
    if (statusEl) {
      statusEl.className = "connection-status " + s;
      if (s === "waiting") statusEl.textContent = "Connecting…";
      else if (s === "connected") statusEl.textContent = "Connected";
      else statusEl.textContent = "Disconnected";
    }
    playerConnected = s === "connected";
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

  function fetchVideoTitle(videoId, callback) {
    if (titleCache[videoId] !== undefined) {
      callback(titleCache[videoId]);
      return;
    }
    var oembedUrl = "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=" + encodeURIComponent(videoId) + "&format=json";
    var proxyUrl = "https://api.allorigins.win/raw?url=" + encodeURIComponent(oembedUrl);
    fetch(proxyUrl)
      .then(function (res) { return res.ok ? res.text() : null; })
      .then(function (text) {
        if (!text) { titleCache[videoId] = null; callback(null); return; }
        try {
          var data = JSON.parse(text);
          var title = data && typeof data.title === "string" ? data.title : null;
          titleCache[videoId] = title;
          callback(title);
        } catch (_) {
          titleCache[videoId] = null;
          callback(null);
        }
      })
      .catch(function () {
        titleCache[videoId] = null;
        callback(null);
      });
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

  function addToQueue(videoId, requestedBy) {
    queue.push({ videoId: videoId, requestedBy: requestedBy || "Manual Add" });
    persistQueue();
    renderQueue();
    updateNowPlaying();
    updateQueueCount();
    ensureTitlesThenRefresh();
    if (playerConnected && queue.length === 1) {
      sendLoadAndPlay(queue[0].videoId);
    }
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
    var item = queue.length > 0 ? queue[0] : null;
    if (nowPlayingThumb) {
      nowPlayingThumb.innerHTML = "";
      if (item) {
        var img = document.createElement("img");
        img.src = thumbnailUrl(item.videoId);
        img.alt = "";
        nowPlayingThumb.appendChild(img);
      }
    }
    if (nowPlayingTitle) nowPlayingTitle.textContent = item ? displayTitle(item) : "—";
    if (nowPlayingRequestedBy) nowPlayingRequestedBy.textContent = item ? "Requested by " + (item.requestedBy || "—") : "Requested by —";
    if (queue.length === 0 && progressFill && progressCurrent && progressDuration) {
      progressFill.style.width = "0%";
      progressCurrent.textContent = "0:00";
      progressDuration.textContent = "0:00";
      lastProgressDuration = 0;
    }
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
      else send({ type: "PAUSE" });
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
  }

  var bc = new BroadcastChannel(BC_NAME);

  bc.onmessage = function (e) {
    var msg = e.data;
    if (!msg || typeof msg.type !== "string") return;
    if (msg.type === "PLAYER_HELLO" || msg.type === "PLAYER_PING") {
      lastPingAt = Date.now();
      if (!playerConnected) {
        setStatus("connected");
        send({ type: "SET_VIDEO_VISIBLE", visible: getConfig().showVideo });
      }
      if (pingTimeoutId) clearTimeout(pingTimeoutId);
      pingTimeoutId = setTimeout(checkPingTimeout, DISCONNECT_TIMEOUT_MS);
    } else if (msg.type === "PLAYER_PROGRESS") {
      if (typeof msg.currentTime === "number" && typeof msg.duration === "number") {
        updateProgress(msg.currentTime, msg.duration);
      }
    } else if (msg.type === "VIDEO_ENDED") {
      if (queue.length > 0) {
        queue.shift();
        persistQueue();
        renderQueue();
        updateNowPlaying();
        updateQueueCount();
        if (queue.length > 0) sendLoadAndPlay(queue[0].videoId);
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

  function seekTo(timeSeconds) {
    if (!playerConnected || lastProgressDuration <= 0) return;
    var t = Math.max(0, Math.min(lastProgressDuration, timeSeconds));
    send({ type: "SEEK", timeSeconds: t });
  }

  function sendLoadAndPlay(videoId) {
    if (!playerConnected) return;
    send({ type: "LOAD_VIDEO", videoId: videoId });
    send({ type: "PLAY" });
  }

  function startQueue() {
    if (!playerConnected) return;
    if (queue.length > 0) {
      sendLoadAndPlay(queue[0].videoId);
    } else {
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
        send({ type: "PAUSE" });
      }
    }
  }

  function connectTwitch() {
    var config = getConfig();
    ComfyJS.onCommand = function (user, command, message, flags, extra) {
      if (command !== config.commandPrefix) return;
      var videoId = extractVideoId(message || "");
      if (videoId) addToQueue(videoId, user || "—");
    };
    ComfyJS.onConnected = function () {
      twitchStatusEl.textContent = "Connected.";
    };
    ComfyJS.onError = function (err) {
      twitchStatusEl.textContent = "Error: " + (err && err.message ? err.message : String(err));
    };
    ComfyJS.Init(config.channel);
  }

  addUrlBtn.addEventListener("click", function () {
    var videoId = extractVideoId(urlInputEl.value);
    if (videoId) {
      addToQueue(videoId);
      urlInputEl.value = "";
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

  if (document.getElementById("spinBtn")) {
    document.getElementById("spinBtn").addEventListener("click", function () {
      if (!playerConnected || queue.length === 0) return;
      var idx = Math.floor(Math.random() * queue.length);
      var item = queue[idx];
      queue.splice(idx, 1);
      queue.unshift(item);
      persistQueue();
      renderQueue();
      updateNowPlaying();
      updateQueueCount();
      sendLoadAndPlay(item.videoId);
    });
  }

  if (volumeSlider) {
    volumeSlider.addEventListener("input", function () {
      var val = parseInt(volumeSlider.value, 10);
      if (!isNaN(val)) send({ type: "SET_VOLUME", value: val });
    });
  }

  if (showVideoToggle) {
    var config = getConfig();
    showVideoToggle.checked = config.showVideo;
    showVideoToggle.addEventListener("change", function () {
      config = getConfig();
      config.showVideo = showVideoToggle.checked;
      saveConfig(config);
      send({ type: "SET_VIDEO_VISIBLE", visible: config.showVideo });
    });
  }

  twitchDisconnectBtn.addEventListener("click", function () {
    ComfyJS.Disconnect();
    twitchStatusEl.textContent = "Disconnected.";
  });

  if (configSaveBtn && configChannelEl && configCommandEl) {
    var config = getConfig();
    configChannelEl.value = config.channel;
    configCommandEl.value = config.commandPrefix;
    configSaveBtn.addEventListener("click", function () {
      var prev = getConfig();
      var channel = (configChannelEl.value || "").trim() || DEFAULT_CONFIG.channel;
      var commandPrefix = (configCommandEl.value || "").trim().replace(/^!/, "") || DEFAULT_CONFIG.commandPrefix;
      saveConfig({ channel: channel, commandPrefix: commandPrefix, showVideo: prev.showVideo });
      ComfyJS.Disconnect();
      twitchStatusEl.textContent = "Reconnecting…";
      updateTwitchLabel();
      connectTwitch();
    });
  }

  function updateTwitchLabel() {
    var config = getConfig();
    var label = document.getElementById("twitchChannelLabel");
    if (label) label.textContent = "Twitch: listening to #" + config.channel + " (anonymous). ";
  }

  updateTwitchLabel();
  loadQueueFromStorage();
  updateQueueCount();
  updateNowPlaying();
  setStatus("waiting");
  connectTwitch();
})();

(function () {
  "use strict";

  const BC_NAME = "streamgood-mr";
  const PING_INTERVAL_MS = 3000;
  const DISCONNECT_TIMEOUT_MS = 10000;
  const STORAGE_KEY_QUEUE = "mr-queue";
  const STORAGE_KEY_CONFIG = "mr-config";
  const DEFAULT_CONFIG = { channel: "adjstreams", commandPrefix: "sr" };

  const statusEl = document.getElementById("statusText");
  const queueListEl = document.getElementById("queueList");
  const urlInputEl = document.getElementById("urlInput");
  const addUrlBtn = document.getElementById("addUrl");
  const twitchStatusEl = document.getElementById("twitchStatus");
  const twitchDisconnectBtn = document.getElementById("twitchDisconnect");
  const configChannelEl = document.getElementById("configChannel");
  const configCommandEl = document.getElementById("configCommand");
  const configSaveBtn = document.getElementById("configSave");

  let queue = [];
  let playerConnected = false;
  let lastPingAt = 0;
  let pingTimeoutId = null;

  function getConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.channel === "string" && typeof parsed.commandPrefix === "string") {
          return {
            channel: parsed.channel.trim() || DEFAULT_CONFIG.channel,
            commandPrefix: (parsed.commandPrefix.trim() || DEFAULT_CONFIG.commandPrefix).replace(/^!/, ""),
          };
        }
      }
    } catch (_) {}
    return { ...DEFAULT_CONFIG };
  }

  function setStatus(s) {
    statusEl.className = "status " + s;
    if (s === "waiting") statusEl.textContent = "🟡 Waiting for player";
    else if (s === "connected") statusEl.textContent = "🟢 Connected";
    else statusEl.textContent = "🔴 Disconnected";
    playerConnected = s === "connected";
  }

  function extractVideoId(text) {
    const m = text.trim().match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  function addToQueue(videoId) {
    queue.push({ videoId });
    persistQueue();
    renderQueue();
    if (playerConnected && queue.length === 1) {
      sendLoadAndPlay(queue[0].videoId);
    }
  }

  function persistQueue() {
    try {
      localStorage.setItem(STORAGE_KEY_QUEUE, JSON.stringify(queue.map(function (q) { return q.videoId; })));
    } catch (_) {}
  }

  function loadQueueFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_QUEUE);
      if (raw) {
        const ids = JSON.parse(raw);
        if (Array.isArray(ids)) queue = ids.map(function (videoId) { return { videoId: videoId }; });
        renderQueue();
      }
    } catch (_) {}
  }

  function renderQueue() {
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
      li.textContent = item.videoId;
      if (i === 0) li.classList.add("playing");
      queueListEl.appendChild(li);
    });
  }

  var bc = new BroadcastChannel(BC_NAME);

  bc.onmessage = function (e) {
    var msg = e.data;
    if (!msg || typeof msg.type !== "string") return;
    if (msg.type === "PLAYER_HELLO" || msg.type === "PLAYER_PING") {
      lastPingAt = Date.now();
      if (!playerConnected) setStatus("connected");
      if (pingTimeoutId) clearTimeout(pingTimeoutId);
      pingTimeoutId = setTimeout(checkPingTimeout, DISCONNECT_TIMEOUT_MS);
    } else if (msg.type === "VIDEO_ENDED") {
      if (queue.length > 0) {
        queue.shift();
        persistQueue();
        renderQueue();
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
      if (videoId) addToQueue(videoId);
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
      alert("Paste a YouTube URL in the form: https://www.youtube.com/watch?v=VIDEO_ID");
    }
  });

  urlInputEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter") addUrlBtn.click();
  });

  document.getElementById("clearQueue").addEventListener("click", function () {
    queue = [];
    persistQueue();
    renderQueue();
  });

  document.getElementById("startQueue").addEventListener("click", startQueue);
  document.getElementById("stopQueue").addEventListener("click", stopQueue);
  document.getElementById("skipNext").addEventListener("click", skipToNext);

  twitchDisconnectBtn.addEventListener("click", function () {
    ComfyJS.Disconnect();
    twitchStatusEl.textContent = "Disconnected.";
  });

  if (configSaveBtn && configChannelEl && configCommandEl) {
    var config = getConfig();
    configChannelEl.value = config.channel;
    configCommandEl.value = config.commandPrefix;
    configSaveBtn.addEventListener("click", function () {
      var channel = (configChannelEl.value || "").trim() || DEFAULT_CONFIG.channel;
      var commandPrefix = (configCommandEl.value || "").trim().replace(/^!/, "") || DEFAULT_CONFIG.commandPrefix;
      try {
        localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify({ channel: channel, commandPrefix: commandPrefix }));
      } catch (_) {}
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
  setStatus("waiting");
  connectTwitch();
})();

(function () {
  "use strict";

  const BC_NAME = "streamgood-mr";
  const PING_INTERVAL_MS = 3000;
  const DISCONNECT_TIMEOUT_MS = 10000;
  const STORAGE_KEY_QUEUE = "mr-queue";
  const STORAGE_KEY_CONFIG = "mr-config";
  const DEFAULT_CONFIG = { channel: "", commandPrefix: "sr", showVideo: false, wheelDisplayLocation: "now-playing", nowPlayingPosition: "top-left", shuffleMode: false, autoplayWhenEmpty: false, nowPlayingDisplayMode: "always", nowPlayingShowNext: false, nowPlayingShowAddMessage: false, nowPlayingPanelDuration: 3 };

  const overlayStatusEl = document.getElementById("overlayStatus");
  const nowPlayingStatusEl = document.getElementById("nowPlayingStatus");
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
  const autoplayWhenEmptyToggle = document.getElementById("autoplayWhenEmptyToggle");
  const nowPlayingDisplayModeEl = document.getElementById("nowPlayingDisplayMode");
  const nowPlayingShowNextEl = document.getElementById("nowPlayingShowNext");
  const nowPlayingShowAddMessageEl = document.getElementById("nowPlayingShowAddMessage");
  const nowPlayingPanelDurationEl = document.getElementById("nowPlayingPanelDuration");
  const panelDurationValueEl = document.getElementById("panelDurationValue");
  const nowPlayingPositionEl = document.getElementById("nowPlayingPosition");
  const wheelDisplayLocationEl = document.getElementById("wheelDisplayLocation");
  const shuffleModeEl = document.getElementById("shuffleMode");

  let queue = [];
  let playerConnected = false;
  let playerStatus = "waiting";
  let twitchInitialized = false;
  let twitchConnectionState = "disconnected";
  let lastPingAt = 0;
  let pingTimeoutId = null;
  let lastNowPlayingPingAt = 0;
  let nowPlayingPingTimeoutId = null;
  let nowPlayingConnected = false;
  let lastProgressDuration = 0;
  let lastProgressCurrentTime = 0;
  let draggedIndex = -1;
  let spinWinnerItem = null;
  let spinWheel = null;
  let nowPlayingOverride = null;
  let isSpinnerTabActive = false;
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
      var payload = {
        type: "NOW_PLAYING_UPDATE",
        videoId: item.videoId,
        title: displayTitle(item),
        requestedBy: item.requestedBy || "—",
        currentTime: typeof currentTime === "number" ? currentTime : 0,
        duration: typeof duration === "number" ? duration : 0,
        source: item.source || "youtube"
      };
      if (item.source === "soundcloud" && item.thumbnailUrl) payload.thumbnailUrl = item.thumbnailUrl;
      send(payload);
    } else {
      send({
        type: "NOW_PLAYING_UPDATE",
        videoId: "",
        title: null,
        requestedBy: "—",
        currentTime: 0,
        duration: 0,
        source: "youtube"
      });
    }
  }

  function sendQueueUpdate() {
    var config = getConfig();
    send({
      type: "QUEUE_UPDATE",
      queue: queue.map(function (item) {
        var out = {
          videoId: item.videoId,
          title: displayTitle(item),
          requestedBy: item.requestedBy || "—",
          source: item.source || "youtube"
        };
        if (item.source === "soundcloud" && item.thumbnailUrl) out.thumbnailUrl = item.thumbnailUrl;
        return out;
      }),
      commandPrefix: config.commandPrefix || "sr",
      displayMode: config.nowPlayingDisplayMode || "always",
      showNext: config.nowPlayingShowNext === true,
      showAddMessage: config.nowPlayingShowAddMessage === true,
      panelDuration: config.nowPlayingPanelDuration || 3,
      nowPlayingPosition: config.nowPlayingPosition || "top-left",
      wheelDisplayLocation: config.wheelDisplayLocation || "now-playing",
      showVideo: config.showVideo === true
    });
  }

  function getConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.channel === "string" && typeof parsed.commandPrefix === "string") {
          // Migrate old showWheelOnStream to wheelDisplayLocation
          var wheelDisplayLocation = parsed.wheelDisplayLocation;
          if (!wheelDisplayLocation && parsed.showWheelOnStream === true) {
            wheelDisplayLocation = "player";
          } else if (!wheelDisplayLocation) {
            wheelDisplayLocation = DEFAULT_CONFIG.wheelDisplayLocation;
          }
          if (wheelDisplayLocation !== "none" && wheelDisplayLocation !== "now-playing" && wheelDisplayLocation !== "player") {
            wheelDisplayLocation = DEFAULT_CONFIG.wheelDisplayLocation;
          }
          
          return {
            channel: (parsed.channel && parsed.channel.trim()) || "",
            commandPrefix: (parsed.commandPrefix.trim() || DEFAULT_CONFIG.commandPrefix).replace(/^!/, ""),
            showVideo: parsed.showVideo === true,
            wheelDisplayLocation: wheelDisplayLocation,
            nowPlayingPosition: parsed.nowPlayingPosition === "bottom-left" ? "bottom-left" : "top-left",
            shuffleMode: parsed.shuffleMode === true,
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

  function saveConfigWithDefaults(partialConfig) {
    var c = getConfig();
    saveConfig({
      channel: partialConfig.channel !== undefined ? partialConfig.channel : c.channel,
      commandPrefix: partialConfig.commandPrefix !== undefined ? partialConfig.commandPrefix : c.commandPrefix,
      showVideo: partialConfig.showVideo !== undefined ? partialConfig.showVideo : c.showVideo,
      wheelDisplayLocation: partialConfig.wheelDisplayLocation !== undefined ? partialConfig.wheelDisplayLocation : c.wheelDisplayLocation,
      nowPlayingPosition: partialConfig.nowPlayingPosition !== undefined ? partialConfig.nowPlayingPosition : c.nowPlayingPosition,
      shuffleMode: partialConfig.shuffleMode !== undefined ? partialConfig.shuffleMode : c.shuffleMode,
      autoplayWhenEmpty: partialConfig.autoplayWhenEmpty !== undefined ? partialConfig.autoplayWhenEmpty : c.autoplayWhenEmpty,
      nowPlayingDisplayMode: partialConfig.nowPlayingDisplayMode !== undefined ? partialConfig.nowPlayingDisplayMode : c.nowPlayingDisplayMode,
      nowPlayingShowNext: partialConfig.nowPlayingShowNext !== undefined ? partialConfig.nowPlayingShowNext : c.nowPlayingShowNext,
      nowPlayingShowAddMessage: partialConfig.nowPlayingShowAddMessage !== undefined ? partialConfig.nowPlayingShowAddMessage : c.nowPlayingShowAddMessage,
      nowPlayingPanelDuration: partialConfig.nowPlayingPanelDuration !== undefined ? partialConfig.nowPlayingPanelDuration : c.nowPlayingPanelDuration
    });
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
      overlayStatusEl.title = playerConnected ? "Player overlay is connected — videos will play in OBS." : (playerStatus === "waiting" ? "Connecting to player… Open the player as a Browser Source in OBS." : "Player disconnected — open the player as a Browser Source in OBS.");
    }
    var nowPlayingDot = nowPlayingStatusEl && nowPlayingStatusEl.querySelector(".status-dot");
    if (nowPlayingDot) {
      nowPlayingDot.className = "status-dot " + (nowPlayingConnected ? "connected" : "disconnected");
      nowPlayingStatusEl.title = nowPlayingConnected ? "Now Playing overlay is connected — song info will show in OBS." : "Now Playing overlay disconnected — open the Now Playing overlay as a Browser Source in OBS.";
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
    var playerText = playerConnected ? "Connected" : (playerStatus === "waiting" ? "Connecting…" : "Disconnected");
    var nowPlayingText = nowPlayingConnected ? "Connected" : "Disconnected";
    var channelText = twitchConnectionState === "connected" ? "Connected" : (twitchConnectionState === "connecting" ? "Reconnecting…" : "Disconnected");
    var config = getConfig();
    if (!(config.channel && config.channel.trim())) channelText = "Set channel below";
    settingsConnectionStatusEl.textContent = "Player: " + playerText + " · Now Playing: " + nowPlayingText + " · Twitch: " + channelText;
    var state = "disconnected";
    if (playerConnected && nowPlayingConnected && twitchConnectionState === "connected") state = "connected";
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

  function extractSoundCloudUrl(text) {
    var t = text.trim();
    var m = t.match(/(https?:\/\/)?(www\.)?soundcloud\.com\/[^\s"'<>]+/i);
    if (m) {
      var url = m[0];
      if (!/^https?:\/\//i.test(url)) url = "https://" + url;
      return url.split(/[)\]\s"'<>]/)[0];
    }
    m = t.match(/(https?:\/\/)?snd\.sc\/[^\s"'<>]+/i);
    if (m) {
      var shortUrl = m[0];
      if (!/^https?:\/\//i.test(shortUrl)) shortUrl = "https://" + shortUrl;
      return shortUrl.split(/[)\]\s"'<>]/)[0];
    }
    return null;
  }

  /** Canonical track URL for oEmbed/cache: strip query and hash so metadata is stable. */
  function normalizeSoundCloudTrackUrl(url) {
    if (!url || typeof url !== "string") return url;
    try {
      var idx = url.indexOf("?");
      if (idx !== -1) url = url.slice(0, idx);
      idx = url.indexOf("#");
      if (idx !== -1) url = url.slice(0, idx);
      return url.trim() || null;
    } catch (_) {
      return url;
    }
  }

  /** Derive a display title from SoundCloud URL path: /artist-slug/track-slug -> "Track Title by Artist Name". */
  function parseSoundCloudUrlForTitle(url) {
    if (!url || typeof url !== "string") return null;
    try {
      var path = url;
      var domain = "soundcloud.com/";
      var i = path.toLowerCase().indexOf(domain);
      if (i !== -1) path = path.slice(i + domain.length);
      var q = path.indexOf("?");
      if (q !== -1) path = path.slice(0, q);
      var h = path.indexOf("#");
      if (h !== -1) path = path.slice(0, h);
      var segments = path.split("/").filter(function (s) { return s.length > 0; });
      function humanize(slug) {
        return slug.replace(/-/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      }
      if (segments.length >= 2) return humanize(segments[1]) + " by " + humanize(segments[0]);
      if (segments.length === 1) return humanize(segments[0]);
      return null;
    } catch (_) {
      return null;
    }
  }

  function parseMediaUrl(text) {
    var yt = extractVideoId(text);
    if (yt) return { source: "youtube", id: yt };
    var sc = extractSoundCloudUrl(text);
    if (sc) return { source: "soundcloud", id: sc };
    return null;
  }

  function thumbnailForItem(item) {
    if (!item) return "";
    if (item.source === "soundcloud" && item.thumbnailUrl) return item.thumbnailUrl;
    if (item.source === "soundcloud") return "";
    return "https://img.youtube.com/vi/" + (item.videoId || "") + "/mqdefault.jpg";
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

  var soundcloudMetaCache = {};

  function fetchSoundCloudMeta(trackUrl, callback) {
    var canonicalUrl = normalizeSoundCloudTrackUrl(trackUrl) || trackUrl;
    if (soundcloudMetaCache[canonicalUrl]) {
      var c = soundcloudMetaCache[canonicalUrl];
      return callback(c.title, c.thumbnailUrl);
    }
    var oembedUrl = "https://soundcloud.com/oembed?format=json&url=" + encodeURIComponent(canonicalUrl);
    var proxyUrl = "https://api.allorigins.win/raw?url=" + encodeURIComponent(oembedUrl);
    fetch(proxyUrl)
      .then(function (res) { return res.ok ? res.text() : Promise.reject(new Error("oembed failed")); })
      .then(function (text) {
        try {
          var data = JSON.parse(text);
          var title = data && typeof data.title === "string" && data.title.trim() ? data.title.trim() : null;
          if (!title && data && typeof data.author_name === "string") title = "By " + data.author_name;
          if (!title) title = parseSoundCloudUrlForTitle(canonicalUrl);
          var thumbnailUrl = data && typeof data.thumbnail_url === "string" ? data.thumbnail_url : undefined;
          soundcloudMetaCache[canonicalUrl] = { title: title, thumbnailUrl: thumbnailUrl };
          callback(title, thumbnailUrl);
        } catch (_) {
          var fallbackTitle = parseSoundCloudUrlForTitle(canonicalUrl);
          soundcloudMetaCache[canonicalUrl] = { title: fallbackTitle, thumbnailUrl: undefined };
          callback(fallbackTitle, undefined);
        }
      })
      .catch(function () {
        var fallbackTitle = parseSoundCloudUrlForTitle(canonicalUrl);
        soundcloudMetaCache[canonicalUrl] = { title: fallbackTitle, thumbnailUrl: undefined };
        callback(fallbackTitle, undefined);
      });
  }

  function displayTitle(item) {
    if (!item) return "—";
    if (item.source === "soundcloud" && item.videoId) {
      return item.title || item.label || parseSoundCloudUrlForTitle(item.videoId) || item.videoId;
    }
    return item.title || item.label || item.videoId || "—";
  }

  function ensureTitlesThenRefresh() {
    queue.forEach(function (item) {
      if (item.source === "soundcloud") {
        if (item.title !== undefined && item.title !== null) return;
        fetchSoundCloudMeta(item.videoId, function (title, thumbnailUrl) {
          item.title = title !== null ? title : (parseSoundCloudUrlForTitle(item.videoId) || item.videoId);
          if (thumbnailUrl) item.thumbnailUrl = thumbnailUrl;
          updateNowPlaying();
          renderQueue();
        });
      } else {
        if (item.title !== undefined) return;
        fetchVideoTitle(item.videoId, function (title) {
          item.title = title !== null ? title : item.videoId;
          updateNowPlaying();
          renderQueue();
        });
      }
    });
  }

  function isInQueue(source, id) {
    if (!id || typeof id !== "string") return false;
    if (source === "soundcloud") id = normalizeSoundCloudTrackUrl(id) || id;
    return queue.some(function (item) {
      var itemId = (item.source || "youtube") === "soundcloud" && item.videoId ? normalizeSoundCloudTrackUrl(item.videoId) || item.videoId : item.videoId;
      return (item.source || "youtube") === source && itemId === id;
    });
  }

  function addToQueue(source, id, requestedBy) {
    if (source === "soundcloud" && id) id = normalizeSoundCloudTrackUrl(id) || id;
    if (isInQueue(source, id)) return false;
    queue.push({ source: source || "youtube", videoId: id, requestedBy: requestedBy || "Manual Add" });
    persistQueue();
    renderQueue();
    updateNowPlaying();
    updateQueueCount();
    ensureTitlesThenRefresh();
    if (playerConnected && queue.length === 1 && getConfig().autoplayWhenEmpty) {
      sendLoadAndPlay(queue[0]);
    }
    return true;
  }

  function persistQueue() {
    try {
      localStorage.setItem(STORAGE_KEY_QUEUE, JSON.stringify(queue.map(function (q) {
        var out = { videoId: q.videoId, requestedBy: q.requestedBy || "—", title: q.title, source: q.source || "youtube" };
        if (q.thumbnailUrl) out.thumbnailUrl = q.thumbnailUrl;
        return out;
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
            if (typeof item === "string") return { videoId: item, requestedBy: "—", source: "youtube" };
            return {
              videoId: item.videoId,
              requestedBy: item.requestedBy || "—",
              title: item.title,
              source: item.source === "soundcloud" ? "soundcloud" : "youtube",
              thumbnailUrl: item.thumbnailUrl || undefined
            };
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
        var thumbSrc = thumbnailForItem(item);
        if (thumbSrc) {
          var img = document.createElement("img");
          img.src = thumbSrc;
          img.alt = "";
          nowPlayingThumb.appendChild(img);
        }
      }
    }
    if (nowPlayingTitle) nowPlayingTitle.textContent = displayTitle(item);
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
    sendLoadAndPlay(queue[0]);
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
      if (queue.length > 0) sendLoadAndPlay(queue[0]);
      else {
        lastProgressDuration = 0;
        send({ type: "CLEAR" });
        updateVideoVisibility();
      }
    }
  }

  function buildWinwheelSegments(segs) {
    return segs.map(function (s, i) {
      var label = (s.label && String(s.label).trim()) || "—";
      if (label.length > 12) label = label.slice(0, 11) + "…";
      return { fillStyle: WHEEL_COLORS[i % WHEEL_COLORS.length], text: label };
    });
  }

  function getWheelSegments() {
    var firstItemIsPlaying = !nowPlayingOverride && queue.length > 0 && lastProgressDuration > 0;
    var startIndex = firstItemIsPlaying ? 1 : 0;
    return queue.slice(startIndex).map(function (item) {
      return { source: item.source || "youtube", videoId: item.videoId, label: displayTitle(item) };
    });
  }

  function updateSpinButtonState() {
    var segs = getWheelSegments();
    if (spinBtn) spinBtn.disabled = segs.length === 0;
    if (spinHint) spinHint.hidden = segs.length > 0;
    if (spinWheelWrap) spinWheelWrap.hidden = segs.length === 0;
    if (segs.length === 0 && spinWheelCanvas) {
      var ctx = spinWheelCanvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, spinWheelCanvas.width, spinWheelCanvas.height);
      spinWheel = null;
    } else if (segs.length > 0 && spinWheelWrap && !spinWheelWrap.hidden && spinWheelCanvas && !spinWinnerItem && typeof Winwheel !== "undefined") {
      spinWheel = new Winwheel({
        canvasId: "spinWheelCanvas",
        numSegments: segs.length,
        segments: buildWinwheelSegments(segs),
        animation: { type: "spinToStop", duration: 4, spins: 5, callbackAfter: "onDockWheelSpinComplete()" },
        textFontSize: 11,
        textFillStyle: "#fff",
        strokeStyle: "rgba(0,0,0,0.3)",
        lineWidth: 1
      });
    }
  }

  function renderQueue() {
    if (!queueListEl) return;
    queueListEl.innerHTML = "";
    if (queue.length === 0) {
      updateSpinButtonState();
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
      img.src = thumbnailForItem(item) || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='68'/%3E";
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
    // Update wheel on overlays only when Spin the Wheel tab is active
    var cfg = getConfig();
    if (isSpinnerTabActive && cfg.wheelDisplayLocation !== "none") {
      sendShowWheelOnStream();
    }
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
        if (isSpinnerTabActive && cfg.wheelDisplayLocation !== "none") sendShowWheelOnStream();
      }
      if (pingTimeoutId) clearTimeout(pingTimeoutId);
      pingTimeoutId = setTimeout(checkPingTimeout, DISCONNECT_TIMEOUT_MS);
    } else if (msg.type === "NOW_PLAYING_HELLO" || msg.type === "NOW_PLAYING_PING") {
      lastNowPlayingPingAt = Date.now();
      if (!nowPlayingConnected) {
        nowPlayingConnected = true;
        updateHeaderStatus();
        updateSettingsConnectionStatus();
      }
      if (nowPlayingPingTimeoutId) clearTimeout(nowPlayingPingTimeoutId);
      nowPlayingPingTimeoutId = setTimeout(checkNowPlayingPingTimeout, DISCONNECT_TIMEOUT_MS);
    } else if (msg.type === "NOW_PLAYING_REQUEST") {
      // Now-playing overlay is requesting current state — treat as connection signal (same as HELLO/PING)
      lastNowPlayingPingAt = Date.now();
      if (!nowPlayingConnected) {
        nowPlayingConnected = true;
        updateHeaderStatus();
        updateSettingsConnectionStatus();
      }
      if (nowPlayingPingTimeoutId) clearTimeout(nowPlayingPingTimeoutId);
      nowPlayingPingTimeoutId = setTimeout(checkNowPlayingPingTimeout, DISCONNECT_TIMEOUT_MS);
      sendNowPlayingUpdate(lastProgressCurrentTime, lastProgressDuration);
      sendQueueUpdate();
    } else if (msg.type === "PLAYER_PROGRESS") {
      if (typeof msg.currentTime === "number" && typeof msg.duration === "number") {
        updateProgress(msg.currentTime, msg.duration);
      }
    } else if (msg.type === "VIDEO_ENDED") {
      var cfg = getConfig();
      if (cfg.shuffleMode && queue.length > 0) {
        // Shuffle mode: spin wheel and play winner
        var winnerIndex = Math.floor(Math.random() * queue.length);
        var segments = queue.map(function (item) {
          return { videoId: item.videoId, label: displayTitle(item) };
        });
        var winnerItem = queue[winnerIndex];
        if (cfg.wheelDisplayLocation !== "none") {
          send({
            type: "SPIN_START",
            segments: segments,
            winnerIndex: winnerIndex,
            startIn: 0,
            target: cfg.wheelDisplayLocation
          });
        }
        
        // Remove winner from queue and play it
        queue.splice(winnerIndex, 1);
        persistQueue();
        renderQueue();
        updateQueueCount();
        nowPlayingOverride = { videoId: winnerItem.videoId, label: winnerItem.title || winnerItem.videoId, requestedBy: "Shuffle", source: winnerItem.source || "youtube", thumbnailUrl: winnerItem.thumbnailUrl };
        sendLoadAndPlay(winnerItem);
        
        // Hide wheel after a delay
        setTimeout(function() {
          send({ type: "SPIN_END", target: cfg.wheelDisplayLocation });
        }, 4000);
      } else {
        // Normal mode: play next in queue
        if (nowPlayingOverride) {
          nowPlayingOverride = null;
          updateNowPlaying();
          updateQueueCount();
          if (queue.length > 0) sendLoadAndPlay(queue[0]);
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
          if (queue.length > 0) sendLoadAndPlay(queue[0]);
          else {
            lastProgressDuration = 0;
            send({ type: "CLEAR" });
            updateVideoVisibility();
          }
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

  function checkNowPlayingPingTimeout() {
    if (Date.now() - lastNowPlayingPingAt >= DISCONNECT_TIMEOUT_MS) {
      nowPlayingConnected = false;
      nowPlayingPingTimeoutId = null;
      updateHeaderStatus();
      updateSettingsConnectionStatus();
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

  function sendLoadAndPlay(item) {
    if (!playerConnected || !item) return;
    var source = item.source || "youtube";
    var id = item.videoId || item.id;
    if (!id) return;
    var c = getConfig();
    if (c.showVideo) {
      send({ type: "SET_VIDEO_VISIBLE", visible: true });
    }
    var payload = { type: "LOAD_MEDIA", source: source, id: id };
    if (source === "soundcloud" && item.thumbnailUrl) payload.thumbnailUrl = item.thumbnailUrl;
    send(payload);
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
      sendLoadAndPlay(queue[0]);
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
        sendLoadAndPlay(queue[0]);
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
      var parsed = parseMediaUrl(message || "");
      if (parsed) addToQueue(parsed.source, parsed.id, user || "—");
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
    var parsed = parseMediaUrl(urlInputEl.value);
    if (parsed) {
      if (addToQueue(parsed.source, parsed.id, "Manual Add")) {
        urlInputEl.value = "";
      } else {
        alert("This song is already in the queue.");
      }
    } else {
      alert("Paste a YouTube or SoundCloud URL.");
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

  function switchToQueueTab() {
    if (!tabQueue || !tabSpinner || !panelQueue || !panelSpinner) return;
    isSpinnerTabActive = false;
    tabQueue.classList.add("active");
    tabQueue.setAttribute("aria-selected", "true");
    tabSpinner.classList.remove("active");
    tabSpinner.setAttribute("aria-selected", "false");
    panelQueue.classList.add("active");
    panelQueue.hidden = false;
    panelSpinner.classList.remove("active");
    panelSpinner.hidden = true;
    var cfg = getConfig();
    if (cfg.wheelDisplayLocation !== "none") {
      send({ type: "SPIN_END", target: cfg.wheelDisplayLocation });
    }
  }

  if (tabQueue && tabSpinner && panelQueue && panelSpinner) {
    tabQueue.addEventListener("click", function () {
      switchToQueueTab();
    });
    tabSpinner.addEventListener("click", function () {
      isSpinnerTabActive = true;
      tabSpinner.classList.add("active");
      tabSpinner.setAttribute("aria-selected", "true");
      tabQueue.classList.remove("active");
      tabQueue.setAttribute("aria-selected", "false");
      panelSpinner.classList.add("active");
      panelSpinner.hidden = false;
      panelQueue.classList.remove("active");
      panelQueue.hidden = true;
      if (getConfig().wheelDisplayLocation !== "none") sendShowWheelOnStream();
      updateSpinButtonState();
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

  window.onDockWheelSpinComplete = function () {
    if (spinWinnerTitle) spinWinnerTitle.textContent = spinWinnerItem ? spinWinnerItem.label : "—";
    if (spinResult) spinResult.hidden = false;
    if (spinBtn) spinBtn.disabled = false;
  };

  if (spinBtn) {
    spinBtn.addEventListener("click", function () {
      var segments = getWheelSegments();
      if (segments.length === 0) return;
      var winnerIndex = Math.floor(Math.random() * segments.length);
      spinWinnerItem = { source: segments[winnerIndex].source, videoId: segments[winnerIndex].videoId, label: segments[winnerIndex].label };
      var cfg = getConfig();
      var startInMs = 80;
      var stopAngle = null;
      if (typeof Winwheel !== "undefined" && spinWheelCanvas) {
        spinWheel = new Winwheel({
          canvasId: "spinWheelCanvas",
          numSegments: segments.length,
          segments: buildWinwheelSegments(segments),
          animation: { type: "spinToStop", duration: 4, spins: 5, callbackAfter: "onDockWheelSpinComplete()" },
          textFontSize: 11,
          textFillStyle: "#fff",
          strokeStyle: "rgba(0,0,0,0.3)",
          lineWidth: 1
        });
        stopAngle = spinWheel.getRandomForSegment(winnerIndex + 1);
        spinWheel.animation.stopAngle = stopAngle;
      }
      if (cfg.wheelDisplayLocation !== "none") {
        send({
          type: "SPIN_START",
          segments: segments,
          winnerIndex: winnerIndex,
          stopAngle: stopAngle,
          startIn: startInMs,
          target: cfg.wheelDisplayLocation
        });
      }
      if (spinResult) spinResult.hidden = true;
      if (spinWheelWrap) spinWheelWrap.hidden = false;
      spinBtn.disabled = true;
      if (spinWheel) {
        setTimeout(function () {
          if (spinWheel) spinWheel.startAnimation();
        }, startInMs);
      } else {
        setTimeout(function () {
          window.onDockWheelSpinComplete();
        }, startInMs);
      }
    });
  }

  if (spinPlayWinner) {
    spinPlayWinner.addEventListener("click", function () {
      if (!spinWinnerItem) return;
      var videoId = spinWinnerItem.videoId;
      var label = spinWinnerItem.label;
      var source = spinWinnerItem.source || "youtube";
      var item = queue.find(function (q) { return (q.source || "youtube") === source && q.videoId === videoId; });
      if (item) {
        queue.splice(queue.indexOf(item), 1);
        persistQueue();
        renderQueue();
        updateQueueCount();
      }
      nowPlayingOverride = { videoId: videoId, label: label, requestedBy: item ? (item.requestedBy || "—") : "Spin", source: (item || spinWinnerItem).source || "youtube", thumbnailUrl: (item || spinWinnerItem).thumbnailUrl };
      sendLoadAndPlay(spinWinnerItem);
      var cfg = getConfig();
      send({ type: "SPIN_END", target: cfg.wheelDisplayLocation });
      spinWinnerItem = null;
      if (spinResult) spinResult.hidden = true;
      updateSpinButtonState();
      updateNowPlaying();
      switchToQueueTab();
    });
  }

  function sendShowWheelOnStream() {
    var cfg = getConfig();
    if (cfg.wheelDisplayLocation === "none") return;
    
    var segments = getWheelSegments();
    
    // Send to appropriate overlay based on wheelDisplayLocation
    // BroadcastChannel messages go to all listeners, so we need to include target info
    // Actually, both overlays listen, so we'll include a target field
    if (cfg.wheelDisplayLocation === "player") {
      send({ type: "SPIN_SHOW_WHEEL", segments: segments, target: "player" });
    } else if (cfg.wheelDisplayLocation === "now-playing") {
      send({ type: "SPIN_SHOW_WHEEL", segments: segments, target: "now-playing" });
    }
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
      saveConfigWithDefaults({ showVideo: c.showVideo });
      updateShowVideoButton();
      updateVideoVisibility();
      sendQueueUpdate(); // so Now Playing overlay gets showVideo and hides/shows artwork+embed
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
      saveConfigWithDefaults({ autoplayWhenEmpty: c.autoplayWhenEmpty });
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
      saveConfigWithDefaults({ nowPlayingDisplayMode: c.nowPlayingDisplayMode });
      sendQueueUpdate();
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
      saveConfigWithDefaults({ nowPlayingShowNext: c.nowPlayingShowNext });
      sendQueueUpdate();
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
      saveConfigWithDefaults({ nowPlayingShowAddMessage: c.nowPlayingShowAddMessage });
      sendQueueUpdate();
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
      saveConfigWithDefaults({ nowPlayingPanelDuration: duration });
      sendQueueUpdate();
    });
  }

  if (nowPlayingPositionEl) {
    function updateNowPlayingPosition() {
      var c = getConfig();
      nowPlayingPositionEl.value = c.nowPlayingPosition || "top-left";
    }
    updateNowPlayingPosition();
    nowPlayingPositionEl.addEventListener("change", function () {
      var c = getConfig();
      var position = nowPlayingPositionEl.value === "bottom-left" ? "bottom-left" : "top-left";
      saveConfigWithDefaults({ nowPlayingPosition: position });
      sendQueueUpdate();
    });
  }

  if (wheelDisplayLocationEl) {
    function updateWheelDisplayLocation() {
      var c = getConfig();
      wheelDisplayLocationEl.value = c.wheelDisplayLocation || "now-playing";
    }
    updateWheelDisplayLocation();
    wheelDisplayLocationEl.addEventListener("change", function () {
      var c = getConfig();
      var prevLocation = c.wheelDisplayLocation;
      var location = wheelDisplayLocationEl.value;
      if (location !== "none" && location !== "now-playing" && location !== "player") {
        location = "now-playing";
      }
      saveConfigWithDefaults({ wheelDisplayLocation: location });
      updateWheelDisplayLocation();
      // Hide wheel on previous location, show on new location only when spinner tab is active
      if (prevLocation !== "none") {
        send({ type: "SPIN_END", target: prevLocation });
      }
      if (location !== "none" && isSpinnerTabActive) {
        sendShowWheelOnStream();
      }
    });
  }

  if (shuffleModeEl) {
    function updateShuffleMode() {
      var c = getConfig();
      shuffleModeEl.checked = c.shuffleMode === true;
    }
    updateShuffleMode();
    shuffleModeEl.addEventListener("change", function () {
      var c = getConfig();
      saveConfigWithDefaults({ shuffleMode: shuffleModeEl.checked });
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
      saveConfigWithDefaults({ channel: channel, commandPrefix: commandPrefix });
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

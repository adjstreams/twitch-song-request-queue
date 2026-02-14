(function () {
  "use strict";

  const BC_NAME = "streamgood-mr";
  const PING_INTERVAL_MS = 3000;
  const PROGRESS_INTERVAL_MS = 1000;

  var playerId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "p-" + Math.random().toString(36).slice(2);
  var bc = new BroadcastChannel(BC_NAME);
  var ytPlayer = null;
  var containerEl = document.getElementById("player-container");
  var ytSurfaceEl = document.getElementById("player");
  var scArtworkEl = document.getElementById("soundcloud-artwork");
  var scContainerEl = document.getElementById("soundcloud-container");
  var scIframeEl = document.getElementById("soundcloud-iframe");
  var spinOverlayEl = document.getElementById("spin-overlay");
  var spinOverlayCanvas = document.getElementById("spin-overlay-canvas");
  var playWhenReady = false;
  var currentSource = null;
  var scWidget = null;
  var scProgressIntervalId = null;
  var WHEEL_COLORS = ["#a855f7", "#7c3aed", "#6d28d9", "#5b21b6", "#4c1d95"];
  var spinWheel = null;

  function buildWinwheelSegments(segs) {
    return segs.map(function (s, i) {
      var label = (s.label && String(s.label).trim()) || "—";
      if (label.length > 12) label = label.slice(0, 11) + "…";
      return { fillStyle: WHEEL_COLORS[i % WHEEL_COLORS.length], text: label };
    });
  }

  function send(msg) {
    var payload = {};
    for (var k in msg) if (Object.prototype.hasOwnProperty.call(msg, k)) payload[k] = msg[k];
    payload.playerId = playerId;
    bc.postMessage(payload);
  }

  send({ type: "PLAYER_HELLO", playerId: playerId });
  setInterval(function () { send({ type: "PLAYER_PING", playerId: playerId }); }, PING_INTERVAL_MS);

  var tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);

  function sendProgress() {
    if (!ytPlayer || typeof ytPlayer.getCurrentTime !== "function") return;
    var current = ytPlayer.getCurrentTime();
    var duration = ytPlayer.getDuration();
    if (typeof current !== "number" || typeof duration !== "number" || duration <= 0) return;
    send({ type: "PLAYER_PROGRESS", currentTime: current, duration: duration });
  }

  function stopScProgressPolling() {
    if (scProgressIntervalId) {
      clearInterval(scProgressIntervalId);
      scProgressIntervalId = null;
    }
  }

  function startScProgressPolling() {
    stopScProgressPolling();
    if (!scWidget) return;
    scProgressIntervalId = setInterval(function () {
      if (!scWidget || currentSource !== "soundcloud") return;
      scWidget.getPosition(function (posMs) {
        scWidget.getDuration(function (durMs) {
          var current = typeof posMs === "number" ? posMs / 1000 : 0;
          var duration = typeof durMs === "number" ? durMs / 1000 : 0;
          if (duration > 0) send({ type: "PLAYER_PROGRESS", currentTime: current, duration: duration });
        });
      });
    }, PROGRESS_INTERVAL_MS);
  }

  function clearSoundCloudArtwork() {
    if (containerEl) containerEl.classList.remove("soundcloud-with-artwork");
    if (scArtworkEl) {
      scArtworkEl.style.backgroundImage = "";
      scArtworkEl.classList.remove("soundcloud-artwork-fallback");
      scArtworkEl.setAttribute("aria-hidden", "true");
      scArtworkEl.hidden = true;
    }
  }

  function showYouTube() {
    currentSource = "youtube";
    clearSoundCloudArtwork();
    if (scWidget && typeof scWidget.pause === "function") scWidget.pause();
    if (ytSurfaceEl) { ytSurfaceEl.removeAttribute("aria-hidden"); ytSurfaceEl.hidden = false; }
    if (scContainerEl) { scContainerEl.setAttribute("aria-hidden", "true"); scContainerEl.hidden = true; }
    stopScProgressPolling();
  }

  function showSoundCloud(artworkUrl) {
    currentSource = "soundcloud";
    if (ytSurfaceEl) { ytSurfaceEl.setAttribute("aria-hidden", "true"); ytSurfaceEl.hidden = true; }
    if (scContainerEl) { scContainerEl.removeAttribute("aria-hidden"); scContainerEl.hidden = false; }
    if (scArtworkEl) {
      scArtworkEl.classList.remove("soundcloud-artwork-fallback");
      if (artworkUrl) {
        scArtworkEl.style.backgroundImage = "url(" + artworkUrl + ")";
        scArtworkEl.removeAttribute("aria-hidden");
        scArtworkEl.hidden = false;
      } else {
        scArtworkEl.style.backgroundImage = "";
        scArtworkEl.classList.add("soundcloud-artwork-fallback");
        scArtworkEl.removeAttribute("aria-hidden");
        scArtworkEl.hidden = false;
      }
      if (containerEl) containerEl.classList.add("soundcloud-with-artwork");
    } else {
      if (containerEl) containerEl.classList.add("soundcloud-with-artwork");
    }
    startScProgressPolling();
  }

  function onYouTubeIframeAPIReady() {
    ytPlayer = new YT.Player("player", {
      height: "100%",
      width: "100%",
      videoId: "",
      events: {
        onReady: function () {},
        onStateChange: onPlayerStateChange,
      },
    });
    setInterval(sendProgress, PROGRESS_INTERVAL_MS);
  }

  function onPlayerStateChange(e) {
    if (e.data === YT.PlayerState.ENDED) {
      bc.postMessage({ type: "VIDEO_ENDED", playerId: playerId });
    }
    if (playWhenReady && (e.data === YT.PlayerState.CUED || e.data === YT.PlayerState.BUFFERING)) {
      playWhenReady = false;
      if (ytPlayer && typeof ytPlayer.playVideo === "function") ytPlayer.playVideo();
    }
  }

  window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

  bc.onmessage = function (e) {
    var msg = e.data;
    if (!msg || typeof msg.type !== "string") return;

    if (msg.type === "SET_VIDEO_VISIBLE") {
      if (containerEl) {
        if (msg.visible === true) containerEl.classList.add("video-visible");
        else containerEl.classList.remove("video-visible");
      }
      return;
    }

    if (msg.type === "SPIN_SHOW_WHEEL") {
      if (msg.target === "player" || !msg.target) {
        if (spinOverlayEl && spinOverlayCanvas && typeof Winwheel !== "undefined") {
          spinOverlayEl.classList.add("spin-overlay-visible");
          spinOverlayEl.hidden = false;
          spinOverlayEl.setAttribute("aria-hidden", "false");
          var segments = Array.isArray(msg.segments) ? msg.segments : [];
          if (segments.length > 0) {
            spinWheel = new Winwheel({
              canvasId: "spin-overlay-canvas",
              numSegments: segments.length,
              segments: buildWinwheelSegments(segments),
              textFontSize: 16,
              textFillStyle: "#fff",
              strokeStyle: "rgba(0,0,0,0.3)",
              lineWidth: 1
            });
          } else {
            var ctx = spinOverlayCanvas.getContext("2d");
            if (ctx) ctx.clearRect(0, 0, spinOverlayCanvas.width, spinOverlayCanvas.height);
            spinWheel = null;
          }
        }
      }
      return;
    }

    if (msg.type === "SPIN_START") {
      if (msg.target === "player" || !msg.target) {
        if (spinOverlayEl && spinOverlayCanvas && Array.isArray(msg.segments) && typeof msg.winnerIndex === "number" && typeof Winwheel !== "undefined") {
          spinOverlayEl.classList.add("spin-overlay-visible");
          spinOverlayEl.hidden = false;
          spinOverlayEl.setAttribute("aria-hidden", "false");
          var segs = msg.segments;
          var startIn = typeof msg.startIn === "number" ? msg.startIn : 0;
          spinWheel = new Winwheel({
            canvasId: "spin-overlay-canvas",
            numSegments: segs.length,
            segments: buildWinwheelSegments(segs),
            animation: { type: "spinToStop", duration: 4, spins: 5 },
            textFontSize: 16,
            textFillStyle: "#fff",
            strokeStyle: "rgba(0,0,0,0.3)",
            lineWidth: 1
          });
          spinWheel.animation.stopAngle = typeof msg.stopAngle === "number" ? msg.stopAngle : spinWheel.getRandomForSegment(msg.winnerIndex + 1);
          var startAnimation = function () {
            if (spinWheel) spinWheel.startAnimation();
          };
          if (startIn > 0) {
            setTimeout(startAnimation, startIn);
          } else {
            startAnimation();
          }
        }
      }
      return;
    }

    if (msg.type === "SPIN_END") {
      if (msg.target === "player" || !msg.target) {
        if (spinOverlayEl) {
          spinOverlayEl.classList.remove("spin-overlay-visible");
          spinOverlayEl.hidden = true;
          spinOverlayEl.setAttribute("aria-hidden", "true");
        }
        spinWheel = null;
      }
      return;
    }

    if (msg.type === "CLEAR") {
      playWhenReady = false;
      currentSource = null;
      stopScProgressPolling();
      if (ytPlayer) {
        if (typeof ytPlayer.stopVideo === "function") ytPlayer.stopVideo();
        if (typeof ytPlayer.clearVideo === "function") ytPlayer.clearVideo();
      }
      if (scWidget && typeof scWidget.pause === "function") scWidget.pause();
      clearSoundCloudArtwork();
      if (ytSurfaceEl) { ytSurfaceEl.removeAttribute("aria-hidden"); ytSurfaceEl.hidden = false; }
      if (scContainerEl) { scContainerEl.setAttribute("aria-hidden", "true"); scContainerEl.hidden = true; }
      if (containerEl) containerEl.classList.remove("video-visible");
      return;
    }

    if (msg.type === "LOAD_MEDIA") {
      var source = msg.source === "soundcloud" ? "soundcloud" : "youtube";
      var id = typeof msg.id === "string" ? msg.id : "";
      if (!id) return;
      playWhenReady = true;
      if (source === "soundcloud") {
        var trackUrl = id.indexOf("http") === 0 ? id : "https://soundcloud.com/" + id;
        var artworkUrl = typeof msg.thumbnailUrl === "string" && msg.thumbnailUrl.trim() ? msg.thumbnailUrl.trim() : null;
        showSoundCloud(artworkUrl);
        if (scWidget && typeof scWidget.load === "function") {
          scWidget.load(trackUrl, { auto_play: true });
        } else if (scIframeEl) {
          scIframeEl.src = "https://w.soundcloud.com/player/?url=" + encodeURIComponent(trackUrl) + "&auto_play=true";
          scIframeEl.onload = function () {
            if (typeof SC !== "undefined" && SC.Widget && scIframeEl && !scWidget) {
              scWidget = SC.Widget(scIframeEl);
              scWidget.bind(SC.Widget.Events.FINISH, function () {
                bc.postMessage({ type: "VIDEO_ENDED", playerId: playerId });
              });
            }
            if (scWidget && typeof scWidget.play === "function") scWidget.play();
            startScProgressPolling();
          };
        }
        return;
      }
      showYouTube();
      if (ytPlayer && typeof ytPlayer.loadVideoById === "function") ytPlayer.loadVideoById(id);
      return;
    }

    if (msg.type === "LOAD_VIDEO") {
      playWhenReady = true;
      showYouTube();
      if (ytPlayer && typeof msg.videoId === "string") ytPlayer.loadVideoById(msg.videoId);
      return;
    }

    if (msg.type === "PLAY") {
      playWhenReady = true;
      if (currentSource === "soundcloud" && scWidget && typeof scWidget.play === "function") {
        scWidget.play();
        playWhenReady = false;
        return;
      }
      if (ytPlayer && typeof ytPlayer.getPlayerState === "function") {
        var state = ytPlayer.getPlayerState();
        if (state === YT.PlayerState.PAUSED || state === YT.PlayerState.CUED || state === YT.PlayerState.ENDED) {
          ytPlayer.playVideo();
          playWhenReady = false;
        }
      }
      return;
    }

    if (msg.type === "PAUSE") {
      playWhenReady = false;
      if (currentSource === "soundcloud" && scWidget && typeof scWidget.pause === "function") {
        scWidget.pause();
        return;
      }
      if (ytPlayer && typeof ytPlayer.pauseVideo === "function") ytPlayer.pauseVideo();
      return;
    }

    if (msg.type === "SEEK") {
      var timeSeconds = typeof msg.timeSeconds === "number" ? msg.timeSeconds : 0;
      if (currentSource === "soundcloud" && scWidget && typeof scWidget.seekTo === "function") {
        scWidget.seekTo(timeSeconds * 1000);
        return;
      }
      if (ytPlayer && typeof ytPlayer.seekTo === "function") ytPlayer.seekTo(timeSeconds, true);
      return;
    }

    if (msg.type === "SET_VOLUME") {
      var vol = typeof msg.value === "number" ? Math.max(0, Math.min(100, msg.value)) : 100;
      // SoundCloud widget expects 0–100 (not 0–1); passing 0–1 makes 100% be interpreted as 1% and volume never recovers
      if (scWidget && typeof scWidget.setVolume === "function") scWidget.setVolume(vol);
      if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(vol);
      return;
    }
  };
})();

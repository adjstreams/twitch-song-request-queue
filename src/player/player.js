(function () {
  "use strict";

  const BC_NAME = "streamgood-mr";
  const PING_INTERVAL_MS = 3000;
  const PROGRESS_INTERVAL_MS = 1000;

  var playerId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "p-" + Math.random().toString(36).slice(2);
  var bc = new BroadcastChannel(BC_NAME);
  var ytPlayer = null;
  var containerEl = document.getElementById("player-container");
  var spinOverlayEl = document.getElementById("spin-overlay");
  var spinOverlayCanvas = document.getElementById("spin-overlay-canvas");
  var playWhenReady = false;
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
      if (ytPlayer) {
        if (typeof ytPlayer.stopVideo === "function") ytPlayer.stopVideo();
        if (typeof ytPlayer.clearVideo === "function") ytPlayer.clearVideo();
      }
      if (containerEl) {
        containerEl.classList.remove("video-visible");
      }
      return;
    }

    if (!ytPlayer || typeof ytPlayer.loadVideoById !== "function") return;
    switch (msg.type) {
      case "LOAD_VIDEO":
        playWhenReady = true;
        if (typeof msg.videoId === "string") ytPlayer.loadVideoById(msg.videoId);
        break;
      case "PLAY":
        playWhenReady = true;
        var state = typeof ytPlayer.getPlayerState === "function" ? ytPlayer.getPlayerState() : -1;
        if (state === YT.PlayerState.PAUSED || state === YT.PlayerState.CUED || state === YT.PlayerState.ENDED) {
          ytPlayer.playVideo();
          playWhenReady = false;
        }
        break;
      case "PAUSE":
        playWhenReady = false;
        ytPlayer.pauseVideo();
        break;
      case "SEEK":
        if (typeof msg.timeSeconds === "number") ytPlayer.seekTo(msg.timeSeconds, true);
        break;
      case "SET_VOLUME":
        if (typeof msg.value === "number" && ytPlayer.setVolume) {
          var vol = Math.max(0, Math.min(100, msg.value));
          ytPlayer.setVolume(vol);
        }
        break;
    }
  };
})();

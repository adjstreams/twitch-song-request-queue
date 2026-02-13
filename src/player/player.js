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
  var spinAnimationId = null;

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
      if (label && label.length > 18) label = label.slice(0, 17) + "…";
      ctx.save();
      ctx.translate(cx + (r * 0.6) * Math.sin(midAngle), cy - (r * 0.6) * Math.cos(midAngle));
      ctx.rotate(midAngle);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.font = "16px sans-serif";
      ctx.fillText(label || "", 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  function runSpinAnimation(canvas, segments, winnerIndex, durationMs) {
    var ctx = canvas.getContext("2d");
    var size = Math.min(canvas.width, canvas.height) / 2;
    var n = segments.length;
    if (n === 0) return;
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
      if (progress < 1) spinAnimationId = requestAnimationFrame(frame);
    }
    spinAnimationId = requestAnimationFrame(frame);
  }

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
      if (spinOverlayEl && spinOverlayCanvas) {
        spinOverlayEl.classList.add("spin-overlay-visible");
        spinOverlayEl.hidden = false;
        spinOverlayEl.setAttribute("aria-hidden", "false");
        if (spinAnimationId != null) cancelAnimationFrame(spinAnimationId);
        spinAnimationId = null;
        var segments = Array.isArray(msg.segments) ? msg.segments : [];
        var ctx = spinOverlayCanvas.getContext("2d");
        var size = Math.min(spinOverlayCanvas.width, spinOverlayCanvas.height) / 2;
        ctx.clearRect(0, 0, spinOverlayCanvas.width, spinOverlayCanvas.height);
        if (segments.length > 0) drawWheel(ctx, segments, 0, size);
      }
      return;
    }

    if (msg.type === "SPIN_START") {
      if (spinOverlayEl && spinOverlayCanvas && Array.isArray(msg.segments) && typeof msg.winnerIndex === "number") {
        spinOverlayEl.classList.add("spin-overlay-visible");
        spinOverlayEl.hidden = false;
        spinOverlayEl.setAttribute("aria-hidden", "false");
        if (spinAnimationId != null) cancelAnimationFrame(spinAnimationId);
        runSpinAnimation(spinOverlayCanvas, msg.segments, msg.winnerIndex, 4000);
      }
      return;
    }

    if (msg.type === "SPIN_END") {
      if (spinOverlayEl) {
        spinOverlayEl.classList.remove("spin-overlay-visible");
        spinOverlayEl.hidden = true;
        spinOverlayEl.setAttribute("aria-hidden", "true");
      }
      if (spinAnimationId != null) {
        cancelAnimationFrame(spinAnimationId);
        spinAnimationId = null;
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

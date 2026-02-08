(function () {
  "use strict";

  const BC_NAME = "streamgood-mr";
  const PING_INTERVAL_MS = 3000;

  var playerId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "p-" + Math.random().toString(36).slice(2);
  var bc = new BroadcastChannel(BC_NAME);
  var ytPlayer = null;

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
  }

  function onPlayerStateChange(e) {
    if (e.data === YT.PlayerState.ENDED) {
      bc.postMessage({ type: "VIDEO_ENDED", playerId: playerId });
    }
  }

  window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

  bc.onmessage = function (e) {
    var msg = e.data;
    if (!msg || typeof msg.type !== "string" || !ytPlayer || typeof ytPlayer.loadVideoById !== "function") return;
    switch (msg.type) {
      case "LOAD_VIDEO":
        if (typeof msg.videoId === "string") ytPlayer.loadVideoById(msg.videoId);
        break;
      case "PLAY":
        ytPlayer.playVideo();
        break;
      case "PAUSE":
        ytPlayer.pauseVideo();
        break;
      case "SEEK":
        if (typeof msg.timeSeconds === "number") ytPlayer.seekTo(msg.timeSeconds, true);
        break;
    }
  };
})();

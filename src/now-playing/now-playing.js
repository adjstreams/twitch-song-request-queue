(function () {
  "use strict";

  const BC_NAME = "streamgood-mr";

  var bc = new BroadcastChannel(BC_NAME);
  var container = document.getElementById("now-playing-container");
  var currentView = document.getElementById("view-current");
  var nextView = document.getElementById("view-next");
  var instructionView = document.getElementById("view-instruction");

  // Current song elements
  var currentThumb = document.getElementById("current-thumb");
  var currentTitle = document.getElementById("current-title");
  var currentRequested = document.getElementById("current-requested");
  var currentProgressFill = document.getElementById("current-progress-fill");
  var currentTime = document.getElementById("current-time");
  var currentDuration = document.getElementById("current-duration");

  // Next song elements
  var nextThumb = document.getElementById("next-thumb");
  var nextTitle = document.getElementById("next-title");
  var nextRequested = document.getElementById("next-requested");

  // Instruction element
  var instructionText = document.getElementById("instruction-text");

  var currentSong = null;
  var queue = [];
  var commandPrefix = "sr";
  var displayMode = "always"; // "once" or "always"
  var showNext = false;
  var showAddMessage = false;
  var panelDuration = 3; // seconds per panel
  var hideTimer = null;
  var rotationTimer = null;
  var currentRotationView = "current"; // "current", "next", "instruction"
  var panelsShown = 0; // Track how many panels shown in "once" mode
  var enabledPanels = []; // Array of panel names to show

  function formatTime(seconds) {
    if (typeof seconds !== "number" || !isFinite(seconds) || seconds < 0) return "0:00";
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function thumbnailUrl(videoId) {
    return "https://img.youtube.com/vi/" + videoId + "/mqdefault.jpg";
  }

  function showView(viewName) {
    currentView.classList.remove("active");
    nextView.classList.remove("active");
    instructionView.classList.remove("active");
    
    if (viewName === "current") {
      currentView.classList.add("active");
    } else if (viewName === "next") {
      nextView.classList.add("active");
    } else if (viewName === "instruction") {
      instructionView.classList.add("active");
    }
  }

  function showOverlay() {
    if (container) {
      container.classList.remove("hidden");
    }
  }

  function hideOverlay() {
    if (container) {
      container.classList.add("hidden");
    }
  }

  function updateCurrentSongView(song, timeSeconds, durationSeconds) {
    if (!song) {
      currentTitle.textContent = "—";
      currentRequested.textContent = "Requested by —";
      if (currentThumb) currentThumb.innerHTML = "";
      currentProgressFill.style.width = "0%";
      if (currentTime) currentTime.textContent = "0:00";
      if (currentDuration) currentDuration.textContent = "0:00";
      return;
    }

    if (currentTitle) currentTitle.textContent = song.title || song.videoId || "—";
    if (currentRequested) currentRequested.textContent = "Requested by " + (song.requestedBy || "—");
    
    if (currentThumb) {
      currentThumb.innerHTML = "";
      var img = document.createElement("img");
      img.src = thumbnailUrl(song.videoId);
      img.alt = "";
      currentThumb.appendChild(img);
    }

    if (typeof timeSeconds === "number" && typeof durationSeconds === "number" && durationSeconds > 0) {
      currentProgressFill.style.width = (100 * timeSeconds / durationSeconds) + "%";
      if (currentTime) currentTime.textContent = formatTime(timeSeconds);
      if (currentDuration) currentDuration.textContent = formatTime(durationSeconds);
    } else {
      currentProgressFill.style.width = "0%";
      if (currentTime) currentTime.textContent = "0:00";
      if (currentDuration) currentDuration.textContent = "0:00";
    }
  }

  function updateNextSongView(nextSong) {
    if (!nextSong) {
      nextTitle.textContent = "—";
      nextRequested.textContent = "Requested by —";
      if (nextThumb) nextThumb.innerHTML = "";
      return;
    }

    if (nextTitle) nextTitle.textContent = nextSong.title || nextSong.videoId || "—";
    if (nextRequested) nextRequested.textContent = "Requested by " + (nextSong.requestedBy || "—");
    
    if (nextThumb) {
      nextThumb.innerHTML = "";
      var img = document.createElement("img");
      img.src = thumbnailUrl(nextSong.videoId);
      img.alt = "";
      nextThumb.appendChild(img);
    }
  }

  function updateInstructionView() {
    if (instructionText) {
      instructionText.textContent = "Add songs using !" + commandPrefix + " <youtube url>";
    }
  }

  function buildEnabledPanels() {
    enabledPanels = [];
    var hasCurrent = currentSong !== null;
    var hasNext = queue.length > 1 && showNext;
    var shouldShowAddMessage = showAddMessage;
    
    // Always include current if available
    if (hasCurrent) {
      enabledPanels.push("current");
    }
    
    // Include next if enabled and available
    if (hasNext) {
      enabledPanels.push("next");
    }
    
    // Include instruction if enabled
    if (shouldShowAddMessage) {
      enabledPanels.push("instruction");
    }
    
    // If no panels enabled but we have a current song, show it
    if (enabledPanels.length === 0 && hasCurrent) {
      enabledPanels.push("current");
    }
    
    // If still no panels, show instruction as fallback
    if (enabledPanels.length === 0) {
      enabledPanels.push("instruction");
    }
  }

  function startRotation() {
    clearRotationTimer();
    buildEnabledPanels();
    
    if (enabledPanels.length === 0) {
      hideOverlay();
      return;
    }
    
    // If only one panel, no need to rotate
    if (enabledPanels.length === 1) {
      currentRotationView = enabledPanels[0];
      showView(currentRotationView);
      if (displayMode === "once") {
        // Show once then hide
        rotationTimer = setTimeout(function () {
          hideOverlay();
        }, panelDuration * 1000);
      }
      // In "always" mode with one panel, just show it (no rotation needed)
      return;
    }
    
    var intervalMs = panelDuration * 1000;
    panelsShown = 0;
    var currentPanelIndex = 0;
    
    function rotate() {
      // Show current panel
      currentRotationView = enabledPanels[currentPanelIndex];
      showView(currentRotationView);
      
      if (displayMode === "once") {
        panelsShown++;
        // Check if we've shown all panels
        if (panelsShown >= enabledPanels.length) {
          // "once" mode - all panels shown, hide overlay after delay
          rotationTimer = setTimeout(function () {
            hideOverlay();
          }, intervalMs);
          return;
        }
      }
      
      // Move to next panel (wrap around for continuous rotation)
      currentPanelIndex = (currentPanelIndex + 1) % enabledPanels.length;
      
      // Schedule next rotation (always continue in "always" mode)
      rotationTimer = setTimeout(rotate, intervalMs);
    }
    
    // Start rotation immediately
    rotate();
  }

  function clearRotationTimer() {
    if (rotationTimer) {
      clearTimeout(rotationTimer);
      rotationTimer = null;
    }
  }

  function startHideTimer() {
    // Hide timer only used when displayMode is "once" and no rotation
    if (displayMode === "always") return;
    if (enabledPanels.length > 1) return; // Rotation handles hiding
    
    clearHideTimer();
    
    // If only one panel, show it for panelDuration then hide
    var durationMs = panelDuration * 1000;
    hideTimer = setTimeout(function () {
      hideOverlay();
    }, durationMs);
  }

  function clearHideTimer() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function handleNowPlayingUpdate(msg) {
    var songChanged = false;
    
    // Only set currentSong if there's actually a videoId
    if (msg.videoId && msg.videoId.trim() !== "") {
      var newVideoId = msg.videoId;
      if (!currentSong || currentSong.videoId !== newVideoId) {
        songChanged = true;
      }
      
      currentSong = {
        videoId: newVideoId,
        title: msg.title || null,
        requestedBy: msg.requestedBy || "—"
      };
      
      updateCurrentSongView(currentSong, msg.currentTime, msg.duration);
    } else {
      // No song playing
      if (currentSong !== null) {
        songChanged = true;
      }
      currentSong = null;
      updateCurrentSongView(null, 0, 0);
    }
    
    // Only restart rotation if song actually changed, not on every progress update
    if (songChanged) {
      buildEnabledPanels();
      if (enabledPanels.length > 1 || displayMode === "always") {
        showOverlay();
        startRotation();
      } else if (enabledPanels.length === 1) {
        showOverlay();
        showView(enabledPanels[0]);
        startHideTimer();
      } else {
        hideOverlay();
      }
    } else {
      // Song didn't change, just update the current view if we're showing it
      if (currentRotationView === "current" && currentSong) {
        updateCurrentSongView(currentSong, msg.currentTime, msg.duration);
      }
    }
  }

  function handleQueueUpdate(msg) {
    queue = Array.isArray(msg.queue) ? msg.queue : [];
    commandPrefix = msg.commandPrefix || "sr";
    
    // Update settings from message
    var settingsChanged = false;
    if (typeof msg.displayMode !== "undefined") {
      displayMode = msg.displayMode === "once" ? "once" : "always";
      settingsChanged = true;
    }
    if (typeof msg.showNext !== "undefined") {
      showNext = msg.showNext === true;
      settingsChanged = true;
    }
    if (typeof msg.showAddMessage !== "undefined") {
      showAddMessage = msg.showAddMessage === true;
      settingsChanged = true;
    }
    if (typeof msg.panelDuration !== "undefined") {
      panelDuration = typeof msg.panelDuration === "number" ? msg.panelDuration : 3;
      settingsChanged = true;
    }
    
    updateInstructionView();
    
    // Update next song preview
    var nextSong = queue.length > 1 ? queue[1] : null;
    updateNextSongView(nextSong);
    
    // If we're showing next view but next song changed, update it
    if (currentRotationView === "next") {
      updateNextSongView(nextSong);
    }
    
    // Restart rotation/display if settings changed
    // Only restart if settings changed, not on every queue update (to avoid interrupting rotation)
    if (settingsChanged) {
      buildEnabledPanels();
      if (enabledPanels.length > 0) {
        showOverlay();
        if (enabledPanels.length > 1 || displayMode === "always") {
          startRotation();
        } else {
          showView(enabledPanels[0]);
          startHideTimer();
        }
      } else {
        hideOverlay();
      }
    } else {
      // Settings didn't change, but queue might have - just update the next song view if we're showing it
      if (currentRotationView === "next") {
        updateNextSongView(nextSong);
      }
      // Rebuild enabled panels in case queue state changed (e.g., next song became available/unavailable)
      var oldPanelsLength = enabledPanels.length;
      buildEnabledPanels();
      // If panel count changed, restart rotation
      if (enabledPanels.length !== oldPanelsLength) {
        if (enabledPanels.length > 0) {
          showOverlay();
          if (enabledPanels.length > 1 || displayMode === "always") {
            startRotation();
          } else {
            showView(enabledPanels[0]);
            startHideTimer();
          }
        } else {
          hideOverlay();
        }
      }
    }
  }

  bc.onmessage = function (e) {
    var msg = e.data;
    if (!msg || typeof msg.type !== "string") return;

    if (msg.type === "NOW_PLAYING_UPDATE") {
      handleNowPlayingUpdate(msg);
    } else if (msg.type === "QUEUE_UPDATE") {
      handleQueueUpdate(msg);
    }
  };

  // Request initial update by sending a message that dock can respond to
  // Dock will send updates when it receives any message, but we'll also
  // request it explicitly
  function requestInitialUpdate() {
    // Send a ping-like message to trigger dock to send current state
    bc.postMessage({ type: "NOW_PLAYING_REQUEST" });
  }

  // Initialize instruction view
  updateInstructionView();
  
  // Start with overlay hidden
  hideOverlay();
  
  // Request initial update after a short delay to ensure dock is ready
  setTimeout(requestInitialUpdate, 100);
})();

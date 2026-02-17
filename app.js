// ---- 1) Default playlist (edit this!) ----
// Option A: Host MP3s in your repo under /audio and use:
//   url: "./audio/track1.mp3"
//
// Option B: Use direct MP3 URLs (must be playable by browsers; some hosts block it)
const DEFAULT_PLAYLIST = [
  { title: "Track 1 (example)", url: "./audio/track1.mp3" },
  { title: "Track 2 (example)", url: "./audio/track2.mp3" }
];

// ---- 2) State + helpers ----
const STORAGE_KEY = "seq_player_playlist_v1";

function loadPlaylist() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PLAYLIST;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_PLAYLIST;
    return parsed.filter(x => x && typeof x.url === "string" && x.url.trim().length > 0);
  } catch {
    return DEFAULT_PLAYLIST;
  }
}

function savePlaylist(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

let playlist = loadPlaylist();
let idx = 0;
let isLoopPlaylist = false;
let userPaused = true;

// ---- 3) Elements ----
const elAudio = document.getElementById("audio");
const elNow = document.getElementById("nowPlaying");
const elPlay = document.getElementById("playBtn");
const elPrev = document.getElementById("prevBtn");
const elNext = document.getElementById("nextBtn");
const elBack10 = document.getElementById("back10Btn");
const elFwd30 = document.getElementById("fwd30Btn");
const elSpeed = document.getElementById("speedSel");
const elLoop = document.getElementById("loopToggle");
const elProgress = document.getElementById("progress");
const elTLeft = document.getElementById("timeLeft");
const elTRight = document.getElementById("timeRight");

const elList = document.getElementById("playlist");
const elNewTitle = document.getElementById("newTitle");
const elNewUrl = document.getElementById("newUrl");
const elAdd = document.getElementById("addBtn");
const elReset = document.getElementById("resetBtn");

// ---- 4) Rendering ----
function renderList() {
  elList.innerHTML = "";
  playlist.forEach((t, i) => {
    const li = document.createElement("li");
    li.className = "item" + (i === idx ? " active" : "");

    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "itemTitle";
    title.textContent = t.title?.trim() ? t.title.trim() : `Track ${i + 1}`;
    const url = document.createElement("div");
    url.className = "itemUrl";
    url.textContent = t.url;

    left.appendChild(title);
    left.appendChild(url);

    const right = document.createElement("div");
    right.className = "itemBtns";

    const playBtn = document.createElement("button");
    playBtn.className = "iconBtn";
    playBtn.textContent = "Play";
    playBtn.addEventListener("click", () => {
      idx = i;
      loadCurrent(true);
    });

    const delBtn = document.createElement("button");
    delBtn.className = "iconBtn";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => {
      playlist.splice(i, 1);
      if (playlist.length === 0) playlist = [...DEFAULT_PLAYLIST];
      if (idx >= playlist.length) idx = playlist.length - 1;
      savePlaylist(playlist);
      renderList();
      loadCurrent(false);
    });

    right.appendChild(playBtn);
    right.appendChild(delBtn);

    li.appendChild(left);
    li.appendChild(right);

    li.addEventListener("click", (e) => {
      // avoid double-trigger when clicking buttons
      if (e.target.tagName.toLowerCase() === "button") return;
      idx = i;
      loadCurrent(false);
    });

    elList.appendChild(li);
  });
}

function updateNowPlaying() {
  const t = playlist[idx];
  const title = t?.title?.trim() ? t.title.trim() : `Track ${idx + 1}`;
  elNow.textContent = `${title}`;
}

function updatePlayButton() {
  if (elAudio.paused) {
    elPlay.textContent = "▶︎ Play";
    elPlay.classList.add("primary");
  } else {
    elPlay.textContent = "⏸︎ Pause";
    elPlay.classList.remove("primary");
  }
}

// ---- 5) Core playback ----
function loadCurrent(autoplay) {
  if (!playlist[idx]) return;

  const t = playlist[idx];
  elAudio.src = t.url;
  elAudio.playbackRate = Number(elSpeed.value) || 1;

  updateNowPlaying();
  renderList();

  // Reset progress UI
  elProgress.value = 0;
  elTLeft.textContent = "0:00";
  elTRight.textContent = "0:00";

  if (autoplay) {
    userPaused = false;
    elAudio.play().catch(() => {
      // Browser blocked autoplay; user needs to tap Play
      userPaused = true;
      updatePlayButton();
    });
  } else {
    // keep paused unless already playing
    if (!elAudio.paused && !userPaused) {
      elAudio.play().catch(() => {});
    }
  }

  updatePlayButton();
}

function nextTrack(autoplay = true) {
  if (idx < playlist.length - 1) {
    idx += 1;
    loadCurrent(autoplay);
  } else if (isLoopPlaylist) {
    idx = 0;
    loadCurrent(autoplay);
  } else {
    // reached end
    userPaused = true;
    elAudio.pause();
    updatePlayButton();
  }
}

function prevTrack() {
  if (elAudio.currentTime > 2) {
    elAudio.currentTime = 0;
    return;
  }
  if (idx > 0) {
    idx -= 1;
    loadCurrent(true);
  } else if (isLoopPlaylist) {
    idx = playlist.length - 1;
    loadCurrent(true);
  } else {
    elAudio.currentTime = 0;
  }
}

// ---- 6) Wire up controls ----
elPlay.addEventListener("click", async () => {
  if (!playlist[idx]) return;

  if (elAudio.src === "" || elAudio.src === window.location.href) {
    loadCurrent(false);
  }

  if (elAudio.paused) {
    userPaused = false;
    try { await elAudio.play(); } catch { userPaused = true; }
  } else {
    userPaused = true;
    elAudio.pause();
  }
  updatePlayButton();
});

elNext.addEventListener("click", () => nextTrack(true));
elPrev.addEventListener("click", () => prevTrack());

elBack10.addEventListener("click", () => {
  elAudio.currentTime = Math.max(0, elAudio.currentTime - 10);
});
elFwd30.addEventListener("click", () => {
  elAudio.currentTime = Math.min(elAudio.duration || Infinity, elAudio.currentTime + 30);
});

elSpeed.addEventListener("change", () => {
  elAudio.playbackRate = Number(elSpeed.value) || 1;
});

elLoop.addEventListener("change", () => {
  isLoopPlaylist = !!elLoop.checked;
});

elProgress.addEventListener("input", () => {
  const dur = elAudio.duration;
  if (!Number.isFinite(dur) || dur <= 0) return;
  const p = Number(elProgress.value) / 1000;
  elAudio.currentTime = dur * p;
});

// Update progress as audio plays
elAudio.addEventListener("timeupdate", () => {
  const cur = elAudio.currentTime || 0;
  const dur = elAudio.duration || 0;

  elTLeft.textContent = fmtTime(cur);
  elTRight.textContent = fmtTime(dur);

  if (Number.isFinite(dur) && dur > 0) {
    elProgress.value = String(Math.floor((cur / dur) * 1000));
  }
});

elAudio.addEventListener("play", updatePlayButton);
elAudio.addEventListener("pause", updatePlayButton);

// Auto-advance on end
elAudio.addEventListener("ended", () => {
  if (userPaused) return;
  nextTrack(true);
});

// ---- 7) Add / Reset playlist ----
elAdd.addEventListener("click", () => {
  const url = elNewUrl.value.trim();
  if (!url) return;

  const title = elNewTitle.value.trim() || `Track ${playlist.length + 1}`;
  playlist.push({ title, url });
  savePlaylist(playlist);

  elNewTitle.value = "";
  elNewUrl.value = "";

  renderList();
});

elReset.addEventListener("click", () => {
  playlist = [...DEFAULT_PLAYLIST];
  idx = 0;
  savePlaylist(playlist);
  renderList();
  loadCurrent(false);
});

// ---- 8) PWA service worker (optional) ----
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

// ---- init ----
renderList();
loadCurrent(false);

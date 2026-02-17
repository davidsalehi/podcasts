// Sequential Audio Player (RSS-aware)
// Plays the LATEST episode from each RSS feed sequentially.
// If you paste a direct MP3 URL, it plays that directly.

// -----------------------------
// 0) OPTIONAL: CORS proxy
// -----------------------------
// If some feeds fail to load due to CORS, set this to your proxy prefix.
// Example (Cloudflare Worker): "https://your-worker.yourname.workers.dev/?url="
// Then the app will fetch: CORS_PROXY + encodeURIComponent(feedUrl)
const CORS_PROXY = "https://podcasts.davidsalehi.workers.dev/?url="; // keep "" unless needed

// -----------------------------
// 1) Default playlist (RSS feeds from your screenshot list)
// -----------------------------
const DEFAULT_PLAYLIST = [
  // Grid (12)
  { title: "ABC News Update", url: "https://feeds.megaphone.fm/ESP9792844572", kind: "feed" },
  { title: "NPR News Now", url: "https://feeds.npr.org/500005/podcast.xml", kind: "feed" },
  { title: "CNN 5 Things", url: "https://feeds.megaphone.fm/WMHY2007701094", kind: "feed" },
  { title: "NHK WORLD RADIO JAPAN - English News at 18:00", url: "https://www3.nhk.or.jp/rj/podcast/rss/english.xml", kind: "feed" },
  { title: "The World This Hour (CBC)", url: "https://www.cbc.ca/podcasting/includes/hourlynews.xml", kind: "feed" },
  { title: "NBC Nightly News with Tom Llamas", url: "https://podcastfeeds.nbcnews.com/l7jK75d0", kind: "feed" },
  { title: "PBS NewsHour - Full Show", url: "https://www.pbs.org/newshour/feeds/rss/podcasts/show", kind: "feed" },
  { title: "Marketplace", url: "https://feeds.publicradio.org/public_feeds/marketplace/itunes/rss.rss", kind: "feed" },
  { title: "CBS News Roundup", url: "https://feeds.megaphone.fm/CBS4371130675", kind: "feed" },
  { title: "Science Friday", url: "https://feeds.simplecast.com/h18ZIZD_", kind: "feed" },
  { title: "Ologies", url: "https://feeds.simplecast.com/FO6kxYGj", kind: "feed" },

  // Reuters TV is discontinued; using Reuters World News replacement
  { title: "Reuters World News (replacement)", url: "https://feeds.megaphone.fm/reutersworldnews", kind: "feed" },

  // Suggestions row (3) from screenshot
  { title: "The Situation Room (CNN)", url: "https://feeds.megaphone.fm/WMHY7959758346", kind: "feed" },
  { title: "The World Tonight (BBC)", url: "https://podcasts.files.bbci.co.uk/b006qtl3.rss", kind: "feed" },
  { title: "60 Minutes (CBS)", url: "https://feeds.megaphone.fm/CBS5826355202", kind: "feed" }
];

// -----------------------------
// 2) State + storage
// -----------------------------
const STORAGE_KEY = "seq_player_playlist_v2";

function loadPlaylist() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PLAYLIST;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_PLAYLIST;

    return parsed
      .filter(x => x && typeof x.url === "string" && x.url.trim().length > 0)
      .map(x => ({
        title: (x.title ?? "").toString(),
        url: x.url.toString().trim(),
        kind: (x.kind ?? "auto").toString()
      }));
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

function isProbablyFeed(url) {
  const u = url.toLowerCase();
  return u.includes("rss") || u.endsWith(".xml") || u.includes("feed") || u.includes("podcast");
}

function isAudioFile(url) {
  return /\.(mp3|m4a|wav|ogg)(\?.*)?$/i.test(url);
}

let playlist = loadPlaylist();
let idx = 0;
let isLoopPlaylist = false;
let userPaused = true;

// Cache resolved "latest episode" URL per feed for this session
const FEED_CACHE = new Map(); // feedUrl -> { audioUrl, title, ts }

// -----------------------------
// 3) Elements
// -----------------------------
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

// -----------------------------
// 4) Rendering
// -----------------------------
function renderList() {
  elList.innerHTML = "";
  playlist.forEach((t, i) => {
    const li = document.createElement("li");
    li.className = "item" + (i === idx ? " active" : "");

    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "itemTitle";

    const displayTitle = t.title?.trim() ? t.title.trim() : `Track ${i + 1}`;
    title.textContent = displayTitle;

    const url = document.createElement("div");
    url.className = "itemUrl";
    const label =
      t.kind === "feed" ? "RSS" :
      t.kind === "audio" ? "Audio" :
      (isAudioFile(t.url) ? "Audio" : (isProbablyFeed(t.url) ? "RSS?" : "Link"));
    url.textContent = `[${label}] ${t.url}`;

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
      if (e.target.tagName.toLowerCase() === "button") return;
      idx = i;
      loadCurrent(false);
    });

    elList.appendChild(li);
  });
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

// -----------------------------
// 5) RSS resolving (latest episode)
// -----------------------------
function proxiedUrl(u) {
  if (!CORS_PROXY) return u;
  return CORS_PROXY + encodeURIComponent(u);
}

function pickFirstEnclosureUrl(itemEl) {
  // RSS enclosure
  const enclosure = itemEl.querySelector("enclosure[url]");
  if (enclosure?.getAttribute("url")) return enclosure.getAttribute("url");

  // media:content
  const media = itemEl.querySelector("media\\:content[url]");
  if (media?.getAttribute("url")) return media.getAttribute("url");

  // Atom-ish link rel=enclosure inside item
  const atomLink = itemEl.querySelector("link[rel='enclosure'][href]");
  if (atomLink?.getAttribute("href")) return atomLink.getAttribute("href");

  // Some feeds put audio url as <link> (rare)
  const link = itemEl.querySelector("link");
  if (link?.textContent && isAudioFile(link.textContent.trim())) return link.textContent.trim();

  return null;
}

function pickItemTitle(itemEl) {
  const t = itemEl.querySelector("title")?.textContent?.trim();
  return t || "";
}

async function resolvePlayableFromFeed(feedUrl) {
  // Cache for 10 minutes to avoid refetching a lot
  const cached = FEED_CACHE.get(feedUrl);
  if (cached && (Date.now() - cached.ts) < 10 * 60 * 1000) return cached;

  const res = await fetch(proxiedUrl(feedUrl), { cache: "no-store" });
  if (!res.ok) throw new Error(`Feed fetch failed (${res.status})`);

  const text = await res.text();
  const xml = new DOMParser().parseFromString(text, "text/xml");

  // Find first <item> (latest in most feeds)
const items = Array.from(xml.querySelectorAll("item"));
if (items.length === 0) throw new Error("No <item> found in feed.");

let audioUrl = null;
let epTitle = "";
for (const item of items.slice(0, 5)) { // try first 5 items
  audioUrl = pickFirstEnclosureUrl(item);
  epTitle = pickItemTitle(item);
  if (audioUrl) break;
}
if (!audioUrl) throw new Error("No enclosure/media audio URL found in first items.");

  const epTitle = pickItemTitle(item);

  const out = { audioUrl, epTitle, ts: Date.now() };
  FEED_CACHE.set(feedUrl, out);
  return out;
}

async function resolveTrack(track) {
  const kind =
    track.kind === "feed" ? "feed" :
    track.kind === "audio" ? "audio" :
    (isAudioFile(track.url) ? "audio" : (isProbablyFeed(track.url) ? "feed" : "audio"));

  if (kind === "audio") {
    return { audioUrl: track.url, nowText: track.title?.trim() || track.url };
  }

  // feed
  const { audioUrl, epTitle } = await resolvePlayableFromFeed(track.url);
  const showTitle = track.title?.trim() ? track.title.trim() : "Podcast";
  const nowText = epTitle ? `${showTitle} — ${epTitle}` : showTitle;
  return { audioUrl, nowText };
}

// -----------------------------
// 6) Core playback
// -----------------------------
async function loadCurrent(autoplay) {
  if (!playlist[idx]) return;

  const track = playlist[idx];

  // UI reset
  elProgress.value = 0;
  elTLeft.textContent = "0:00";
  elTRight.textContent = "0:00";
  renderList();

  try {
    elNow.textContent = "Loading…";

    const { audioUrl, nowText } = await resolveTrack(track);

    elNow.textContent = nowText || "Now playing";
    elAudio.src = audioUrl;
    elAudio.playbackRate = Number(elSpeed.value) || 1;

    if (autoplay) {
      userPaused = false;
      await elAudio.play();
    }

  } catch (err) {
    userPaused = true;
    elAudio.pause();
    elNow.textContent =
      `Could not load: ${track.title || track.url}\n` +
      `Reason: ${err?.message || err}\n` +
      (CORS_PROXY ? "" : "Tip: If this is a CORS issue, set CORS_PROXY at the top of app.js.");

  } finally {
    updatePlayButton();
    renderList();
  }
}

function nextTrack(autoplay = true) {
  if (idx < playlist.length - 1) {
    idx += 1;
    loadCurrent(autoplay);
  } else if (isLoopPlaylist) {
    idx = 0;
    loadCurrent(autoplay);
  } else {
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

// -----------------------------
// 7) Controls
// -----------------------------
elPlay.addEventListener("click", async () => {
  if (!playlist[idx]) return;

  // If nothing loaded yet, load but don't autoplay (then play)
  if (!elAudio.src || elAudio.src === window.location.href) {
    await loadCurrent(false);
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

elAudio.addEventListener("ended", () => {
  if (userPaused) return;
  nextTrack(true);
});

// -----------------------------
// 8) Add / Reset playlist
// -----------------------------
elAdd.addEventListener("click", () => {
  const rawUrl = elNewUrl.value.trim();
  if (!rawUrl) return;

  const title = (elNewTitle.value.trim() || `Track ${playlist.length + 1}`);
  const kind = isAudioFile(rawUrl) ? "audio" : (isProbablyFeed(rawUrl) ? "feed" : "auto");

  playlist.push({ title, url: rawUrl, kind });
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

// -----------------------------
// 9) PWA service worker (optional)
// -----------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

// Init
renderList();
loadCurrent(false);

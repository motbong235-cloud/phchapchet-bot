(function () {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready(); tg.expand();
    try { tg.setHeaderColor("#f4f7fb"); tg.setBackgroundColor("#f4f7fb"); } catch (e) {}
  }
  const state = {
    initData: (tg && tg.initData) || "",
    me: null, current: null, people: [], posts: [],
    scope: "public", mediaFiles: [], viewerPost: null, muted: false,
  };
  const $ = (id) => document.getElementById(id);
  function toast(msg, cls) {
    const el = $("toast"); el.textContent = msg; el.className = "toast " + (cls || "");
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.add("hidden"), 2200);
  }
  async function api(path, opts) {
    const o = opts || {};
    const headers = Object.assign({}, o.headers || {});
    if (!(o.body instanceof FormData)) headers["Content-Type"] = "application/json";
    if (state.initData) headers["X-Telegram-Init-Data"] = state.initData;
    const res = await fetch("/api/mini" + path, {
      method: o.method || "GET", headers,
      body: o.body instanceof FormData ? o.body : o.body ? JSON.stringify(o.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || "API " + res.status);
    return data;
  }
  function photoUrl(id) { return id ? "/api/mini/photo/" + encodeURIComponent(id) : ""; }
  function setAv(el, id) { if (el) el.style.backgroundImage = id ? "url('" + (String(id).startsWith("/") ? id : photoUrl(id)) + "')" : ""; }
  function mediaSrc(m) {
    if (!m) return "";
    const u = typeof m === "string" ? m : m.url;
    return u || "";
  }
  function openSheet(id) { $(id).classList.remove("hidden"); }
  function closeSheet(id) { $(id).classList.add("hidden"); }

  function go(tab) {
    ["home","friends","match","chat","me"].forEach((id) => {
      const v = $("view-" + id); if (v) v.classList.toggle("hidden", id !== tab);
    });
    document.querySelectorAll(".nav").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    if (tab === "home") loadHome();
    if (tab === "friends") loadPeople();
    if (tab === "match") loadNext();
    if (tab === "chat") loadChat();
    if (tab === "me") loadMe();
  }

  function renderPost(p) {
    const div = document.createElement("div");
    div.className = "post";
    const av = p.author && p.author.photo ? (String(p.author.photo).startsWith("/") ? p.author.photo : photoUrl(p.author.photo)) : "";
    const uname = p.author && p.author.username ? "@" + p.author.username : "";
    const media = p.media && p.media.length ? p.media : (p.media_url ? [{url:p.media_url,type:p.media_type||"image"}] : []);
    let mediaHtml = "";
    if (media.length) {
      const g = media.length >= 3 ? " grid3" : media.length === 2 ? " grid2" : "";
      mediaHtml = '<div class="post-media' + g + '">';
      media.forEach((m, i) => {
        const src = mediaSrc(m);
        if ((m.type || p.media_type) === "video") {
          mediaHtml += '<video src="' + src + '" muted playsinline preload="metadata" data-open="' + i + '"></video>';
        } else {
          mediaHtml += '<img src="' + src + '" alt="" data-open="' + i + '" />';
        }
      });
      mediaHtml += "</div>";
    }
    div.innerHTML =
      '<div class="post-head"><div class="av sm" style="background-image:url(\'' + av + '\')"></div>' +
      '<div class="who"><strong>' + (p.author && p.author.name || "—") + '</strong><span>' + uname + '</span></div></div>' +
      '<div class="post-text"></div>' + mediaHtml +
      '<div class="post-actions">' +
      '<button type="button" class="like-btn' + (p.liked ? " on" : "") + '">♥ <span>' + (p.likes||0) + '</span></button>' +
      '<button type="button" class="cmt-btn">💬 <span>' + (p.comments||0) + '</span></button>' +
      (media.some(m => (m.type||"") === "video") ? '<button type="button" class="play-btn">▶ មើល</button>' : '') +
      '</div>';
    div.querySelector(".post-text").textContent = p.text || "";
    div.querySelector(".like-btn").onclick = async () => {
      try {
        const d = await api("/post_like", { method: "POST", body: { post_id: p.id } });
        const btn = div.querySelector(".like-btn");
        btn.classList.toggle("on", d.liked);
        btn.querySelector("span").textContent = d.likes;
      } catch (e) { toast(e.message); }
    };
    div.querySelector(".cmt-btn").onclick = async () => {
      const text = prompt("មតិ:"); if (!text || !text.trim()) return;
      try {
        const d = await api("/comment", { method: "POST", body: { post_id: p.id, text: text.trim() } });
        div.querySelector(".cmt-btn span").textContent = d.comments;
        toast("បានផ្ញើមតិ");
      } catch (e) { toast(e.message); }
    };
    const openViewer = () => { if (media.some(m => m.type === "video" || (p.media_type === "video"))) openViewerFor(p); };
    const play = div.querySelector(".play-btn");
    if (play) play.onclick = openViewer;
    div.querySelectorAll(".post-media video, .post-media img").forEach((el) => {
      el.onclick = () => {
        if (el.tagName === "VIDEO" || (p.media_type === "video")) openViewerFor(p);
      };
    });
    return div;
  }

  async function openViewerFor(p) {
    state.viewerPost = p;
    const media = p.media && p.media.length ? p.media : [{url:p.media_url,type:p.media_type}];
    const vid = media.find(m => m.type === "video") || media[0];
    if (!vid) return;
    const v = $("viewer-video");
    v.src = mediaSrc(vid);
    v.muted = state.muted;
    $("viewer").classList.remove("hidden");
    try { await v.play(); } catch (e) {}
    $("v-like-n").textContent = p.likes || 0;
    $("v-cmt-n").textContent = p.comments || 0;
    $("v-name").textContent = (p.author && p.author.name) || "—";
    $("v-text").textContent = p.text || "";
    $("v-views").textContent = p.views || 0;
    const ph = p.author && p.author.photo;
    setAv($("v-av"), ph);
    const fb = $("v-follow");
    fb.textContent = p.following ? "តាមហើយ" : "តាមដាន";
    fb.classList.toggle("on", !!p.following);
    try {
      const d = await api("/view", { method: "POST", body: { post_id: p.id } });
      $("v-views").textContent = d.views || (p.views || 0);
      p.views = d.views;
    } catch (e) {}
  }

  async function loadHome() {
    const list = $("feed-list"); const empty = $("feed-empty"); const stories = $("story-row");
    list.innerHTML = ""; stories.innerHTML = "";
    try {
      const d = await api("/feed?scope=" + encodeURIComponent(state.scope));
      state.posts = d.posts || [];
      empty.style.display = state.posts.length ? "none" : "block";
      state.posts.forEach((p) => list.appendChild(renderPost(p)));
    } catch (e) { empty.style.display = "block"; empty.textContent = e.message; }
    try {
      const d = await api("/people");
      (d.people || []).slice(0, 12).forEach((p) => {
        const s = document.createElement("button"); s.type = "button"; s.className = "story";
        const ph = p.photos && p.photos[0];
        if (ph) s.style.backgroundImage = "url('" + (String(ph).startsWith("/") ? ph : photoUrl(ph)) + "')";
        s.innerHTML = '<span class="cap"></span>'; s.querySelector(".cap").textContent = p.name || "—";
        s.onclick = () => go("match"); stories.appendChild(s);
      });
    } catch (e) {}
  }

  function renderPeople(list) {
    const box = $("people-list"); const empty = $("people-empty"); box.innerHTML = "";
    const q = (($("people-q").value || "") + "").trim().toLowerCase();
    let items = list.slice();
    if (q) items = items.filter((p) => String(p.name||"").toLowerCase().includes(q) || String(p.username||"").toLowerCase().includes(q));
    empty.classList.toggle("hidden", items.length > 0);
    items.forEach((p) => {
      const row = document.createElement("div"); row.className = "person";
      const av = p.photos && p.photos[0] ? (String(p.photos[0]).startsWith("/") ? p.photos[0] : photoUrl(p.photos[0])) : "";
      row.innerHTML = '<div class="av sm" style="background-image:url(\'' + av + '\')"></div><div class="t"><strong>' + (p.name||"—") + '</strong><span>' + (p.username?"@"+p.username:"") + '</span></div><div class="acts"><button type="button" class="btn-follow' + (p.following?" on":"") + '">' + (p.following?"តាមហើយ":"តាម") + '</button><button type="button" class="btn-icon solid chat">💬</button></div>';
      row.querySelector(".btn-follow").onclick = async () => {
        try { const r = await api("/follow", { method:"POST", body:{ target_id: p.id } }); p.following = r.following; renderPeople(state.people); } catch(e){ toast(e.message); }
      };
      row.querySelector(".chat").onclick = () => openTg(p.username);
      box.appendChild(row);
    });
  }
  function openTg(u) {
    if (!u) return toast("គ្មាន username");
    if (tg && tg.openTelegramLink) tg.openTelegramLink("https://t.me/"+u); else window.open("https://t.me/"+u,"_blank");
  }
  async function loadPeople() {
    try { const d = await api("/people"); state.people = d.people||[]; renderPeople(state.people); }
    catch(e){ $("people-empty").classList.remove("hidden"); $("people-empty").textContent = e.message; }
  }
  function showMatch(p) {
    state.current = p; const actions = $("m-actions");
    if (!p) { $("m-photo").style.backgroundImage=""; $("m-name").textContent="អស់ Profile"; $("m-info").textContent=""; $("m-bio").textContent=""; actions.hidden=true; return; }
    const ph = p.photos && p.photos[0];
    $("m-photo").style.backgroundImage = ph ? "url('"+(String(ph).startsWith("/")?ph:photoUrl(ph))+"')" : "";
    $("m-name").textContent = (p.name||"—") + (p.age ? ", "+p.age : "");
    $("m-info").textContent = [p.gender_label,p.looking_label,p.city].filter(Boolean).join(" · ");
    $("m-bio").textContent = p.bio || ""; actions.hidden = false;
  }
  async function loadNext() {
    $("match-msg").textContent = "កំពុងផ្ទុក…";
    try { const d = await api("/next"); showMatch(d.profile||null); $("match-msg").textContent = d.profile ? "" : (d.message||""); }
    catch(e){ showMatch(null); $("match-msg").textContent = e.message; }
  }
  async function loadChat() {
    const box = $("match-chat-list"); box.innerHTML = "";
    try {
      const d = await api("/matches");
      (d.matches||[]).forEach((m) => {
        const row = document.createElement("div"); row.className = "person";
        const av = m.photos && m.photos[0] ? (String(m.photos[0]).startsWith("/")?m.photos[0]:photoUrl(m.photos[0])) : "";
        row.innerHTML = '<div class="av sm" style="background-image:url(\''+av+'\')"></div><div class="t"><strong>'+(m.name||"—")+'</strong><span>'+(m.username?"@"+m.username:"Match")+'</span></div><button type="button" class="btn-icon solid">💬</button>';
        row.querySelector("button").onclick = () => openTg(m.username); box.appendChild(row);
      });
    } catch(e){}
  }
  async function loadMe() {
    try {
      const d = await api("/me"); const p = d.profile || {}; state.me = p;
      const ph = p.photos && p.photos[0];
      setAv($("me-av"), ph); setAv($("home-av"), ph); setAv($("post-av"), ph); setAv($("edit-av"), ph);
      $("me-name").textContent = p.name || "—";
      $("me-user").textContent = p.username ? "@"+p.username : "@user";
      $("me-bio").textContent = p.bio || [p.gender_label, p.city].filter(Boolean).join(" · ");
      const st = p.stats || {};
      $("st-posts").textContent = st.posts||0; $("st-likes").textContent = st.likes||0;
      $("st-followers").textContent = st.followers||0; $("st-following").textContent = st.following||0;
      if (p.banner) { $("me-hero").classList.add("has-banner"); $("me-hero").style.backgroundImage = "linear-gradient(rgba(255,255,255,.85),#fff), url('"+p.banner+"')"; }
      $("edit-name").value = p.name || ""; $("edit-bio").value = p.bio || "";
      $("edit-gender").value = p.gender || ""; $("edit-age").value = p.age || "";
      $("edit-looking").value = p.looking || "";
      $("edit-handle").textContent = (p.username?"@"+p.username:"") + (p.id ? " · ID "+p.id : "");
      if (p.banner) { $("banner-preview").style.backgroundImage = "url('"+p.banner+"')"; $("banner-preview").textContent = ""; }
      const list = $("me-posts"); const empty = $("me-posts-empty"); list.innerHTML = "";
      const feed = await api("/feed?scope=public");
      const mine = (feed.posts||[]).filter(x => x.author && String(x.author.id)===String(p.id));
      empty.style.display = mine.length ? "none" : "block";
      mine.forEach(x => list.appendChild(renderPost(x)));
    } catch(e){ $("me-name").textContent = e.message; }
  }

  // nav
  document.querySelectorAll(".nav").forEach(b => b.addEventListener("click", () => go(b.dataset.tab)));
  document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => go(b.getAttribute("data-go"))));
  document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => closeSheet(b.getAttribute("data-close"))));
  document.querySelectorAll(".ftab").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll(".ftab").forEach(x => x.classList.remove("on")); b.classList.add("on");
    state.scope = b.dataset.scope || "public"; loadHome();
  }));

  $("open-composer").onclick = () => openSheet("sheet-post");
  $("btn-edit-open").onclick = $("btn-edit-open2").onclick = () => { loadMe(); openSheet("sheet-edit"); };

  // media pick
  function refreshMediaPreview() {
    const box = $("media-preview"); box.innerHTML = "";
    if (!state.mediaFiles.length) { box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    state.mediaFiles.forEach((f, i) => {
      const thumb = document.createElement("div"); thumb.className = "thumb";
      const url = URL.createObjectURL(f);
      if (f.type.startsWith("video/")) { const v=document.createElement("video"); v.src=url; v.muted=true; thumb.appendChild(v); }
      else { const img=document.createElement("img"); img.src=url; thumb.appendChild(img); }
      const rm = document.createElement("button"); rm.type="button"; rm.className="rm"; rm.textContent="×";
      rm.onclick = () => { state.mediaFiles.splice(i,1); refreshMediaPreview(); };
      thumb.appendChild(rm); box.appendChild(thumb);
    });
  }
  $("media-input").addEventListener("change", () => {
    const files = Array.from($("media-input").files || []);
    const vids = files.filter(f => f.type.startsWith("video/"));
    const imgs = files.filter(f => f.type.startsWith("image/"));
    if (vids.length) {
      if (vids[0].size > 50*1024*1024) return toast("វីដេអូ ≤ 50MB");
      state.mediaFiles = [vids[0]];
    } else {
      const next = imgs.filter(f => f.size <= 10*1024*1024).slice(0, 3);
      state.mediaFiles = next;
      if (imgs.length && !next.length) toast("រូប ≤ 10MB");
    }
    refreshMediaPreview();
    $("media-input").value = "";
  });

  $("btn-post").onclick = async () => {
    const text = ($("post-text").value || "").trim();
    if (!text && !state.mediaFiles.length) return toast("សរសេរ ឬ ជ្រើសរូប/វីដេអូ");
    $("btn-post").disabled = true;
    try {
      const fd = new FormData();
      fd.append("text", text);
      fd.append("privacy", $("post-privacy").value || "public");
      state.mediaFiles.forEach((f, i) => fd.append("media", f));
      await api("/post", { method: "POST", body: fd });
      $("post-text").value = ""; state.mediaFiles = []; refreshMediaPreview();
      closeSheet("sheet-post"); toast("បានបង្ហោះ!"); go("home");
    } catch(e){ toast(e.message); } finally { $("btn-post").disabled = false; }
  };

  $("btn-save-profile").onclick = async () => {
    try {
      const fd = new FormData();
      fd.append("name", $("edit-name").value || "");
      fd.append("bio", $("edit-bio").value || "");
      fd.append("gender", $("edit-gender").value || "");
      fd.append("age", $("edit-age").value || "");
      fd.append("looking", $("edit-looking").value || "");
      const av = $("avatar-input").files && $("avatar-input").files[0];
      const bn = $("banner-input").files && $("banner-input").files[0];
      if (av) fd.append("avatar", av);
      if (bn) fd.append("banner", bn);
      await api("/profile", { method: "POST", body: fd });
      toast("រក្សាទុកហើយ"); closeSheet("sheet-edit"); loadMe();
    } catch(e){ toast(e.message); }
  };
  $("banner-input").onchange = () => {
    const f = $("banner-input").files && $("banner-input").files[0];
    if (!f) return;
    $("banner-preview").style.backgroundImage = "url('"+URL.createObjectURL(f)+"')";
    $("banner-preview").textContent = "";
  };
  $("avatar-input").onchange = () => {
    const f = $("avatar-input").files && $("avatar-input").files[0];
    if (f) $("edit-av").style.backgroundImage = "url('"+URL.createObjectURL(f)+"')";
  };

  $("btn-like").onclick = async () => {
    if (!state.current) return;
    try {
      const d = await api("/like", { method:"POST", body:{ target_id: state.current.id } });
      toast(d.match ? "Match! "+(d.username?"@"+d.username:d.name||"") : "បាន Like", d.match?"match":"");
      await loadNext();
    } catch(e){ toast(e.message); }
  };
  $("btn-skip").onclick = async () => {
    if (!state.current) return;
    try { await api("/skip", { method:"POST", body:{ target_id: state.current.id } }); await loadNext(); }
    catch(e){ toast(e.message); }
  };
  $("people-q").addEventListener("input", () => renderPeople(state.people));

  // viewer
  $("viewer-close").onclick = () => { $("viewer").classList.add("hidden"); $("viewer-video").pause(); $("viewer-video").removeAttribute("src"); };
  $("v-mute").onclick = () => { state.muted = !state.muted; $("viewer-video").muted = state.muted; };
  $("v-like").onclick = async () => {
    if (!state.viewerPost) return;
    try {
      const d = await api("/post_like", { method:"POST", body:{ post_id: state.viewerPost.id } });
      $("v-like-n").textContent = d.likes; state.viewerPost.likes = d.likes; state.viewerPost.liked = d.liked;
    } catch(e){ toast(e.message); }
  };
  $("v-cmt").onclick = async () => {
    if (!state.viewerPost) return;
    const text = prompt("មតិ:"); if (!text||!text.trim()) return;
    try {
      const d = await api("/comment", { method:"POST", body:{ post_id: state.viewerPost.id, text: text.trim() } });
      $("v-cmt-n").textContent = d.comments;
    } catch(e){ toast(e.message); }
  };
  $("v-follow").onclick = async () => {
    if (!state.viewerPost || !state.viewerPost.author) return;
    try {
      const r = await api("/follow", { method:"POST", body:{ target_id: state.viewerPost.author.id } });
      state.viewerPost.following = r.following;
      $("v-follow").textContent = r.following ? "តាមហើយ" : "តាមដាន";
    } catch(e){ toast(e.message); }
  };

  (async function boot() {
    try {
      const d = await api("/me"); state.me = d.profile;
      const ph = d.profile && d.profile.photos && d.profile.photos[0];
      setAv($("home-av"), ph); setAv($("post-av"), ph);
      await loadHome();
    } catch (e) {
      $("feed-empty").textContent = e.message + " — បើកពី Telegram";
    }
  })();
})();

(function () {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor("#f4f7fb");
      tg.setBackgroundColor("#f4f7fb");
    } catch (e) {}
  }

  const state = {
    initData: (tg && tg.initData) || "",
    me: null,
    current: null,
    people: [],
    filter: "all",
    mediaFile: null,
  };

  const $ = (id) => document.getElementById(id);

  function toast(msg, cls) {
    const el = $("toast");
    el.textContent = msg;
    el.className = "toast " + (cls || "");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add("hidden"), 2200);
  }

  async function api(path, opts) {
    const o = opts || {};
    const headers = Object.assign({}, o.headers || {});
    if (!(o.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }
    if (state.initData) headers["X-Telegram-Init-Data"] = state.initData;
    const res = await fetch("/api/mini" + path, {
      method: o.method || "GET",
      headers,
      body: o.body instanceof FormData ? o.body : o.body ? JSON.stringify(o.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || "API " + res.status);
    return data;
  }

  function photoUrl(fileId) {
    return fileId ? "/api/mini/photo/" + encodeURIComponent(fileId) : "";
  }

  function setAv(el, fileId) {
    if (!el) return;
    el.style.backgroundImage = fileId ? "url('" + photoUrl(fileId) + "')" : "";
  }

  function svgHeart(on) {
    return '<svg class="ico sm" viewBox="0 0 24 24" style="color:' + (on ? "#ec4899" : "currentColor") + '"><path fill="currentColor" d="M12 21s-7-4.4-9.5-8.2C.7 10 1.6 6.5 4.5 5.2 6.6 4.2 9 4.9 12 7.2c3-2.3 5.4-3 7.5-2 2.9 1.3 3.8 4.8 2 7.6C19 16.6 12 21 12 21Z"/></svg>';
  }
  function svgChat() {
    return '<svg class="ico sm" viewBox="0 0 24 24"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 3v-3H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg>';
  }

  function go(tab) {
    ["home", "friends", "match", "chat", "me"].forEach((id) => {
      const v = $("view-" + id);
      if (v) v.classList.toggle("hidden", id !== tab);
    });
    document.querySelectorAll(".nav").forEach((b) => {
      const on = b.dataset.tab === tab || (tab === "match" && b.dataset.tab === "friends");
      b.classList.toggle("on", on);
    });
    if (tab === "home") loadHome();
    if (tab === "friends") loadPeople();
    if (tab === "match") loadNext();
    if (tab === "chat") loadChat();
    if (tab === "me") loadMe();
  }

  function renderPost(p) {
    const div = document.createElement("div");
    div.className = "post";
    const av = p.author && p.author.photo ? photoUrl(p.author.photo) : "";
    const uname = p.author && p.author.username ? "@" + p.author.username : "";
    let media = "";
    if (p.media_url) {
      if (p.media_type === "video") {
        media = '<div class="post-media"><video src="' + p.media_url + '" controls playsinline preload="metadata"></video></div>';
      } else {
        media = '<div class="post-media"><img src="' + p.media_url + '" alt="" /></div>';
      }
    }
    div.innerHTML =
      '<div class="post-head">' +
      '<div class="av sm" style="background-image:url(\'' + av + "')\"></div>" +
      '<div class="who"><strong>' + (p.author && p.author.name ? p.author.name : "—") +
      "</strong><span>" + uname + "</span></div></div>" +
      '<div class="post-text"></div>' + media +
      '<div class="post-actions">' +
      '<button type="button" class="like-btn' + (p.liked ? " on" : "") + '">' + svgHeart(!!p.liked) + " <span>" + (p.likes || 0) + "</span></button>" +
      '<button type="button" class="cmt-btn">' + svgChat() + " <span>" + (p.comments || 0) + "</span></button>" +
      "</div>";
    div.querySelector(".post-text").textContent = p.text || "";
    div.querySelector(".like-btn").onclick = async () => {
      try {
        const d = await api("/post_like", { method: "POST", body: { post_id: p.id } });
        const btn = div.querySelector(".like-btn");
        btn.classList.toggle("on", d.liked);
        btn.innerHTML = svgHeart(d.liked) + " <span>" + d.likes + "</span>";
      } catch (e) { toast(e.message); }
    };
    div.querySelector(".cmt-btn").onclick = async () => {
      const text = prompt("មតិ:");
      if (!text || !text.trim()) return;
      try {
        const d = await api("/comment", { method: "POST", body: { post_id: p.id, text: text.trim() } });
        div.querySelector(".cmt-btn").innerHTML = svgChat() + " <span>" + d.comments + "</span>";
        toast("បានផ្ញើមតិ");
      } catch (e) { toast(e.message); }
    };
    return div;
  }

  async function loadHome() {
    const list = $("feed-list");
    const empty = $("feed-empty");
    const stories = $("story-row");
    list.innerHTML = "";
    stories.innerHTML = "";
    try {
      const d = await api("/feed");
      const posts = d.posts || [];
      empty.style.display = posts.length ? "none" : "block";
      posts.forEach((p) => list.appendChild(renderPost(p)));
    } catch (e) {
      empty.style.display = "block";
      empty.textContent = e.message;
    }
    try {
      const d = await api("/people");
      (d.people || []).slice(0, 12).forEach((p) => {
        const s = document.createElement("button");
        s.type = "button";
        s.className = "story";
        const ph = (p.photos && p.photos[0]) ? photoUrl(p.photos[0]) : "";
        if (ph) s.style.backgroundImage = "url('" + ph + "')";
        s.innerHTML = '<span class="cap"></span>';
        s.querySelector(".cap").textContent = p.name || "—";
        s.onclick = () => go("match");
        stories.appendChild(s);
      });
    } catch (e) {}
  }

  function renderPeople(list) {
    const box = $("people-list");
    const empty = $("people-empty");
    box.innerHTML = "";
    const q = (($("people-q").value || "") + "").trim().toLowerCase();
    let items = list.slice();
    if (state.filter === "following") items = items.filter((p) => p.following);
    if (q) {
      items = items.filter((p) =>
        String(p.name || "").toLowerCase().includes(q) ||
        String(p.username || "").toLowerCase().includes(q) ||
        String(p.city || "").toLowerCase().includes(q)
      );
    }
    empty.classList.toggle("hidden", items.length > 0);
    items.forEach((p) => {
      const row = document.createElement("div");
      row.className = "person";
      const av = (p.photos && p.photos[0]) ? photoUrl(p.photos[0]) : "";
      const handle = p.username ? "@" + p.username : (p.city || "");
      row.innerHTML =
        '<div class="av sm" style="background-image:url(\'' + av + "')\"></div>" +
        '<div class="t"><strong>' + (p.name || "—") + (p.age ? ", " + p.age : "") +
        "</strong><span>" + handle + (p.following ? " · កំពុងតាម" : "") +
        '</span></div><div class="acts">' +
        '<button type="button" class="btn-follow' + (p.following ? " on" : "") + '">' +
        (p.following ? "តាមហើយ" : "តាម") + "</button>" +
        '<button type="button" class="btn-icon solid chat" aria-label="chat">' +
        '<svg class="ico white" viewBox="0 0 24 24"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 3v-3H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg>' +
        "</button></div>";
      row.querySelector(".btn-follow").onclick = async () => {
        try {
          const r = await api("/follow", { method: "POST", body: { target_id: p.id } });
          p.following = r.following;
          renderPeople(state.people);
        } catch (e) { toast(e.message); }
      };
      row.querySelector(".chat").onclick = () => openTg(p.username);
      box.appendChild(row);
    });
  }

  function openTg(username) {
    if (!username) return toast("គេមិនមាន username");
    if (tg && tg.openTelegramLink) tg.openTelegramLink("https://t.me/" + username);
    else window.open("https://t.me/" + username, "_blank");
  }

  async function loadPeople() {
    try {
      const d = await api("/people");
      state.people = d.people || [];
      renderPeople(state.people);
    } catch (e) {
      $("people-empty").classList.remove("hidden");
      $("people-empty").textContent = e.message;
    }
  }

  function showMatch(p) {
    state.current = p;
    const actions = $("m-actions");
    if (!p) {
      $("m-photo").style.backgroundImage = "";
      $("m-name").textContent = "អស់ Profile";
      $("m-info").textContent = "";
      $("m-bio").textContent = "សាកម្តងទៀតក្រោយ។";
      actions.hidden = true;
      return;
    }
    const ph = (p.photos && p.photos[0]) || "";
    $("m-photo").style.backgroundImage = ph ? "url('" + photoUrl(ph) + "')" : "";
    $("m-name").textContent = (p.name || "—") + (p.age ? ", " + p.age : "");
    $("m-info").textContent = [p.gender_label, p.looking_label, p.city].filter(Boolean).join(" · ");
    $("m-bio").textContent = p.bio || "";
    actions.hidden = false;
  }

  async function loadNext() {
    $("match-msg").textContent = "កំពុងផ្ទុក…";
    try {
      const d = await api("/next");
      showMatch(d.profile || null);
      $("match-msg").textContent = d.profile ? "" : (d.message || "");
    } catch (e) {
      showMatch(null);
      $("match-msg").textContent = e.message;
    }
  }

  async function loadChat() {
    const box = $("match-chat-list");
    box.innerHTML = "";
    try {
      const d = await api("/matches");
      (d.matches || []).forEach((m) => {
        const row = document.createElement("div");
        row.className = "person";
        const av = (m.photos && m.photos[0]) ? photoUrl(m.photos[0]) : "";
        row.innerHTML =
          '<div class="av sm" style="background-image:url(\'' + av + "')\"></div>" +
          '<div class="t"><strong>' + (m.name || "—") + '</strong><span>' +
          (m.username ? "@" + m.username : "Match") +
          '</span></div><button type="button" class="btn-icon solid" aria-label="chat">' +
          '<svg class="ico white" viewBox="0 0 24 24"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 3v-3H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg></button>';
        row.querySelector("button").onclick = () => openTg(m.username);
        box.appendChild(row);
      });
    } catch (e) {}
  }

  async function loadMe() {
    try {
      const d = await api("/me");
      const p = d.profile || {};
      state.me = p;
      setAv($("me-av"), (p.photos && p.photos[0]) || "");
      $("me-name").textContent = p.name || "—";
      $("me-user").textContent = p.username ? "@" + p.username : "@user";
      $("me-bio").textContent = p.bio || [p.gender_label, p.city].filter(Boolean).join(" · ");
      const st = p.stats || {};
      $("st-posts").textContent = st.posts || 0;
      $("st-likes").textContent = st.likes || 0;
      $("st-followers").textContent = st.followers || 0;
      $("st-following").textContent = st.following || 0;
      const list = $("me-posts");
      const empty = $("me-posts-empty");
      list.innerHTML = "";
      const feed = await api("/feed");
      const mine = (feed.posts || []).filter((x) => x.author && String(x.author.id) === String(p.id));
      empty.style.display = mine.length ? "none" : "block";
      mine.forEach((x) => list.appendChild(renderPost(x)));
    } catch (e) {
      $("me-name").textContent = e.message;
    }
  }

  document.querySelectorAll(".nav").forEach((b) => {
    b.addEventListener("click", () => go(b.dataset.tab));
  });
  document.querySelectorAll("[data-go]").forEach((b) => {
    b.addEventListener("click", () => go(b.getAttribute("data-go")));
  });
  $("btn-to-me").onclick = () => go("me");

  document.querySelectorAll(".chip").forEach((c) => {
    c.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((x) => x.classList.remove("on"));
      c.classList.add("on");
      state.filter = c.dataset.filter || "all";
      renderPeople(state.people);
    });
  });
  $("btn-search").onclick = () => renderPeople(state.people);
  $("people-q").addEventListener("input", () => renderPeople(state.people));

  $("btn-like").onclick = async () => {
    if (!state.current) return;
    try {
      const d = await api("/like", { method: "POST", body: { target_id: state.current.id } });
      if (d.match) toast("Match! " + (d.username ? "@" + d.username : d.name || ""), "match");
      else toast("បាន Like");
      await loadNext();
    } catch (e) { toast(e.message); }
  };
  $("btn-skip").onclick = async () => {
    if (!state.current) return;
    try {
      await api("/skip", { method: "POST", body: { target_id: state.current.id } });
      await loadNext();
    } catch (e) { toast(e.message); }
  };

  function openSheet() {
    $("sheet").classList.remove("hidden");
    $("post-text").focus();
  }
  function closeSheet() {
    $("sheet").classList.add("hidden");
    state.mediaFile = null;
    $("media-input").value = "";
    $("media-name").textContent = "";
    $("media-preview").classList.add("hidden");
    $("media-preview").innerHTML = "";
  }
  $("open-composer").onclick = openSheet;
  $("btn-pick-media").onclick = () => {
    openSheet();
    setTimeout(() => $("media-input").click(), 150);
  };
  $("sheet-bg").onclick = closeSheet;
  $("sheet-close").onclick = closeSheet;

  $("media-input").addEventListener("change", () => {
    const f = $("media-input").files && $("media-input").files[0];
    state.mediaFile = f || null;
    $("media-name").textContent = f ? f.name : "";
    const prev = $("media-preview");
    prev.innerHTML = "";
    if (!f) {
      prev.classList.add("hidden");
      return;
    }
    prev.classList.remove("hidden");
    const url = URL.createObjectURL(f);
    if (f.type.startsWith("video/")) {
      const v = document.createElement("video");
      v.src = url; v.controls = true; v.playsInline = true;
      prev.appendChild(v);
    } else {
      const img = document.createElement("img");
      img.src = url; prev.appendChild(img);
    }
  });

  $("btn-post").onclick = async () => {
    const text = ($("post-text").value || "").trim();
    if (!text && !state.mediaFile) return toast("សរសេរ ឬ ជ្រើសវីដេអូ/រូប");
    $("btn-post").disabled = true;
    try {
      if (state.mediaFile) {
        const fd = new FormData();
        fd.append("text", text);
        fd.append("media", state.mediaFile);
        await api("/post", { method: "POST", body: fd });
      } else {
        await api("/post", { method: "POST", body: { text } });
      }
      $("post-text").value = "";
      closeSheet();
      toast("បានបង្ហោះ!");
      go("home");
    } catch (e) {
      toast(e.message);
    } finally {
      $("btn-post").disabled = false;
    }
  };

  $("btn-edit").onclick = () => toast("កែ Profile ក្នុង bot / Telegram");
  $("btn-settings").onclick = () => toast("Settings ក្នុង bot");

  (async function boot() {
    try {
      const d = await api("/me");
      state.me = d.profile;
      setAv($("home-av"), (d.profile && d.profile.photos && d.profile.photos[0]) || "");
      await loadHome();
    } catch (e) {
      $("feed-empty").textContent = e.message + " — បើកពី Telegram";
    }
  })();
})();

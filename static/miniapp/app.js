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
    const headers = Object.assign({ "Content-Type": "application/json" }, o.headers || {});
    if (state.initData) headers["X-Telegram-Init-Data"] = state.initData;
    const res = await fetch("/api/mini" + path, {
      method: o.method || "GET",
      headers,
      body: o.body ? JSON.stringify(o.body) : undefined,
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

  function go(tab) {
    ["home", "friends", "match", "chat", "me"].forEach((id) => {
      const v = $("view-" + id);
      if (v) v.classList.toggle("hidden", id !== tab);
    });
    document.querySelectorAll(".nav").forEach((b) => {
      b.classList.toggle("on", b.dataset.tab === tab || (tab === "match" && b.dataset.tab === "friends"));
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
    div.innerHTML =
      '<div class="post-head">' +
      '<div class="av sm" style="background-image:url(\'' + av + "')\"></div>" +
      '<div class="who"><strong>' + (p.author && p.author.name ? p.author.name : "—") +
      "</strong><span>" + uname + "</span></div></div>" +
      '<div class="post-text"></div>' +
      '<div class="post-actions">' +
      '<button type="button" class="like-btn' + (p.liked ? " on" : "") + '">❤️ ' + (p.likes || 0) + "</button>" +
      '<button type="button" class="cmt-btn">💬 ' + (p.comments || 0) + "</button>" +
      "</div>";
    div.querySelector(".post-text").textContent = p.text || "";
    div.querySelector(".like-btn").onclick = async () => {
      try {
        const d = await api("/post_like", { method: "POST", body: { post_id: p.id } });
        const btn = div.querySelector(".like-btn");
        btn.classList.toggle("on", d.liked);
        btn.textContent = "❤️ " + d.likes;
      } catch (e) { toast(e.message); }
    };
    div.querySelector(".cmt-btn").onclick = async () => {
      const text = prompt("មតិ:");
      if (!text || !text.trim()) return;
      try {
        const d = await api("/comment", { method: "POST", body: { post_id: p.id, text: text.trim() } });
        div.querySelector(".cmt-btn").textContent = "💬 " + d.comments;
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
        const s = document.createElement("div");
        s.className = "story";
        const ph = (p.photos && p.photos[0]) ? photoUrl(p.photos[0]) : "";
        if (ph) s.style.backgroundImage = "url('" + ph + "')";
        s.innerHTML = '<div class="cap"></div>';
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
        "</strong><span>" + handle + (p.following ? " · កំពុងតាម" : " · អនឡាញ") +
        '</span></div><div class="acts">' +
        '<button type="button" class="btn-follow' + (p.following ? " on" : "") + '">' +
        (p.following ? "តាមហើយ" : "តាម") + "</button>" +
        '<button type="button" class="btn-icon solid chat">💬</button></div>';
      row.querySelector(".btn-follow").onclick = async () => {
        try {
          const r = await api("/follow", { method: "POST", body: { target_id: p.id } });
          p.following = r.following;
          renderPeople(state.people);
        } catch (e) { toast(e.message); }
      };
      row.querySelector(".chat").onclick = () => {
        if (p.username) {
          if (tg && tg.openTelegramLink) tg.openTelegramLink("https://t.me/" + p.username);
          else window.open("https://t.me/" + p.username, "_blank");
        } else toast("គេមិនមាន username");
      };
      box.appendChild(row);
    });
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
    const card = $("match-card");
    const actions = $("m-actions");
    if (!p) {
      card.classList.add("empty");
      $("m-photo").style.backgroundImage = "";
      $("m-name").textContent = "អស់ Profile";
      $("m-info").textContent = "";
      $("m-bio").textContent = "សាកម្តងទៀតក្រោយ។";
      actions.hidden = true;
      return;
    }
    card.classList.remove("empty");
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
          '</span></div><button type="button" class="btn-icon solid">💬</button>';
        row.querySelector("button").onclick = () => {
          if (m.username) {
            if (tg && tg.openTelegramLink) tg.openTelegramLink("https://t.me/" + m.username);
            else window.open("https://t.me/" + m.username, "_blank");
          } else toast("គ្មាន username");
        };
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
      $("me-name").textContent = p.name || p.tg_name || "—";
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

  // nav
  document.querySelectorAll(".nav").forEach((b) => {
    b.addEventListener("click", () => go(b.dataset.tab));
  });
  document.querySelectorAll("[data-go]").forEach((b) => {
    b.addEventListener("click", () => go(b.getAttribute("data-go")));
  });
  $("btn-to-me").onclick = () => go("me");

  // chips
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

  // match actions
  $("btn-like").onclick = async () => {
    if (!state.current) return;
    try {
      const d = await api("/like", { method: "POST", body: { target_id: state.current.id } });
      if (d.match) toast("🎉 Match! " + (d.username ? "@" + d.username : d.name || ""), "match");
      else toast("❤️ បាន Like");
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

  // composer
  function openSheet() {
    $("sheet").classList.remove("hidden");
    $("post-text").focus();
  }
  function closeSheet() { $("sheet").classList.add("hidden"); }
  $("open-composer").onclick = openSheet;
  $("btn-photo-hint").onclick = openSheet;
  $("sheet-bg").onclick = closeSheet;
  $("sheet-close").onclick = closeSheet;
  $("btn-post").onclick = async () => {
    const text = ($("post-text").value || "").trim();
    if (!text) return toast("សរសេរអ្វីមួយ");
    try {
      await api("/post", { method: "POST", body: { text } });
      $("post-text").value = "";
      closeSheet();
      toast("បានបង្ហោះ!");
      go("home");
    } catch (e) { toast(e.message); }
  };

  $("btn-edit").onclick = () => {
    toast("កែ Profile ក្នុង bot chat");
    if (tg && tg.close) { /* keep open */ }
  };
  $("btn-settings").onclick = () => toast("Settings ក្នុង bot");

  (async function boot() {
    try {
      const d = await api("/me");
      state.me = d.profile;
      setAv($("home-av"), (d.profile && d.profile.photos && d.profile.photos[0]) || "");
      await loadHome();
      if (!d.profile || !d.profile.complete) toast("បង្កើត Profile ក្នុង bot ជាមុន");
    } catch (e) {
      $("feed-empty").textContent = e.message + " — បើកពី Telegram";
    }
  })();
})();

(function () {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { tg.ready(); tg.expand(); try { tg.setHeaderColor("#0b1020"); tg.setBackgroundColor("#0b1020"); } catch (e) {} }
  const state = { initData: (tg && tg.initData) || "", me: null, current: null };
  const $ = (id) => document.getElementById(id);
  function toast(msg, cls) {
    const el = $("toast"); el.textContent = msg; el.className = "toast " + (cls || "");
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.add("hidden"), 2200);
  }
  async function api(path, opts) {
    const o = opts || {};
    const headers = Object.assign({ "Content-Type": "application/json" }, o.headers || {});
    if (state.initData) headers["X-Telegram-Init-Data"] = state.initData;
    const res = await fetch("/api/mini" + path, { method: o.method || "GET", headers, body: o.body ? JSON.stringify(o.body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || "API " + res.status);
    return data;
  }
  function photoUrl(fileId) { return fileId ? "/api/mini/photo/" + encodeURIComponent(fileId) : ""; }

  function renderPost(p) {
    const div = document.createElement("div");
    div.className = "post";
    const av = p.author && p.author.photo ? photoUrl(p.author.photo) : "";
    const uname = p.author && p.author.username ? "@" + p.author.username : "";
    div.innerHTML = "<div class="post-head"><div class="post-av" style="background-image:url('" + av + "')"></div><div class="who"><strong>" + (p.author && p.author.name ? p.author.name : "—") + "</strong><span>" + uname + "</span></div></div><div class="post-text"></div><div class="post-actions"><button type="button" class="like-btn" + (p.liked ? " on" : "") + ">💚 " + (p.likes || 0) + "</button><button type="button" class="cmt-btn">💬 " + (p.comments || 0) + "</button></div>";
    div.querySelector(".post-text").textContent = p.text || "";
    div.querySelector(".like-btn").addEventListener("click", async () => {
      try {
        const d = await api("/post_like", { method: "POST", body: { post_id: p.id } });
        const btn = div.querySelector(".like-btn"); btn.classList.toggle("on", d.liked); btn.textContent = "💚 " + d.likes;
      } catch (e) { toast(e.message); }
    });
    div.querySelector(".cmt-btn").addEventListener("click", async () => {
      const text = prompt("មតិ:"); if (!text || !text.trim()) return;
      try {
        const d = await api("/comment", { method: "POST", body: { post_id: p.id, text: text.trim() } });
        div.querySelector(".cmt-btn").textContent = "💬 " + d.comments; toast("បានផ្ញើមតិ");
      } catch (e) { toast(e.message); }
    });
    return div;
  }

  async function loadFeed() {
    const list = $("feed-list"); const empty = $("feed-empty"); list.innerHTML = "";
    try {
      const d = await api("/feed"); const posts = d.posts || [];
      empty.style.display = posts.length ? "none" : "block";
      posts.forEach((p) => list.appendChild(renderPost(p)));
    } catch (e) { empty.style.display = "block"; empty.textContent = e.message; }
  }

  $("btn-post").addEventListener("click", async () => {
    const ta = $("post-text"); const text = (ta.value || "").trim();
    if (!text) return toast("សរសេរអ្វីមួយ");
    $("btn-post").disabled = true;
    try { await api("/post", { method: "POST", body: { text } }); ta.value = ""; toast("បានបង្ហោះ!"); await loadFeed(); }
    catch (e) { toast(e.message); } finally { $("btn-post").disabled = false; }
  });

  function showProfile(p) {
    state.current = p; const card = $("card"); const actions = $("actions");
    if (!p) {
      card.classList.add("empty"); $("photo").style.backgroundImage = "";
      $("name").textContent = "អស់ Profile"; $("info").textContent = ""; $("bio").textContent = "សាកម្តងទៀតក្រោយ។"; actions.hidden = true; return;
    }
    card.classList.remove("empty");
    const ph = (p.photos && p.photos[0]) || "";
    $("photo").style.backgroundImage = ph ? "url('" + photoUrl(ph) + "')" : "";
    $("name").textContent = (p.name || "—") + (p.age ? ", " + p.age : "");
    $("info").textContent = [p.gender_label, p.looking_label, p.city].filter(Boolean).join(" · ");
    $("bio").textContent = p.bio || ""; actions.hidden = false;
  }

  async function loadNext() {
    $("discover-msg").textContent = "កំពុងផ្ទុក…";
    try {
      const d = await api("/next"); showProfile(d.profile || null);
      $("discover-msg").textContent = d.profile ? "" : (d.message || "");
    } catch (e) { showProfile(null); $("discover-msg").textContent = e.message; }
  }

  $("btn-like").addEventListener("click", async () => {
    if (!state.current) return;
    try {
      const d = await api("/like", { method: "POST", body: { target_id: state.current.id } });
      if (d.match) { toast("🎉 Match! " + (d.username ? "@" + d.username : d.name || ""), "match"); }
      else toast("💚 បាន Like");
      await loadNext();
    } catch (e) { toast(e.message); }
  });
  $("btn-skip").addEventListener("click", async () => {
    if (!state.current) return;
    try { await api("/skip", { method: "POST", body: { target_id: state.current.id } }); await loadNext(); }
    catch (e) { toast(e.message); }
  });

  async function loadPeople() {
    const list = $("people-list"); const empty = $("people-empty"); list.innerHTML = "";
    try {
      const d = await api("/people"); const people = d.people || [];
      empty.style.display = people.length ? "none" : "block";
      people.forEach((p) => {
        const row = document.createElement("div"); row.className = "person";
        const av = (p.photos && p.photos[0]) ? photoUrl(p.photos[0]) : "";
        row.innerHTML = "<div class="av" style="background-image:url('" + av + "')"></div><div class="t"><strong>" + (p.name || "—") + (p.age ? ", " + p.age : "") + "</strong><span>" + (p.city || "") + (p.username ? " · @" + p.username : "") + "</span></div><button type="button" class="btn-follow" + (p.following ? " on" : "") + ">" + (p.following ? "Following" : "Follow") + "</button>";
        row.querySelector(".btn-follow").addEventListener("click", async () => {
          try {
            const r = await api("/follow", { method: "POST", body: { target_id: p.id } });
            const btn = row.querySelector(".btn-follow"); btn.classList.toggle("on", r.following); btn.textContent = r.following ? "Following" : "Follow";
          } catch (e) { toast(e.message); }
        });
        list.appendChild(row);
      });
    } catch (e) { empty.style.display = "block"; empty.textContent = e.message; }
  }

  async function loadMe() {
    const box = $("me-card");
    try {
      const d = await api("/me"); const p = d.profile;
      if (!p || !p.complete) box.innerHTML = "<div class="meta"><h2>Profile មិនទាន់គ្រប់</h2><p class="sub">បើក bot chat → កែ Profile</p></div>";
      else {
        const ph = (p.photos && p.photos[0]) || "";
        box.innerHTML = "<div class="photo" style="background-image:url('" + (ph ? photoUrl(ph) : "") + "')"></div><div class="meta"><h2>" + (p.name || "") + (p.age ? ", " + p.age : "") + "</h2><p class="sub">" + [p.gender_label, p.looking_label, p.city].filter(Boolean).join(" · ") + "</p><p class="bio">" + (p.bio || "") + "</p></div>";
      }
    } catch (e) { box.innerHTML = "<div class="meta"><p class="sub">" + e.message + "</p></div>"; }
    const list = $("match-list"); const empty = $("match-empty"); list.innerHTML = "";
    try {
      const d = await api("/matches"); const items = d.matches || [];
      empty.style.display = items.length ? "none" : "block";
      items.forEach((m) => {
        const a = document.createElement("a"); a.className = "match-item";
        a.href = m.username ? "https://t.me/" + m.username : "#"; if (m.username) a.target = "_blank";
        const av = (m.photos && m.photos[0]) ? photoUrl(m.photos[0]) : "";
        a.innerHTML = "<div class="av" style="background-image:url('" + av + "')"></div><div class="t"><strong>" + (m.name || "—") + "</strong><span>" + (m.username ? "@" + m.username : "") + "</span></div>";
        list.appendChild(a);
      });
    } catch (e) { empty.style.display = "block"; empty.textContent = e.message; }
  }

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      const tab = btn.dataset.tab;
      ["feed", "discover", "people", "me"].forEach((id) => { $("view-" + id).classList.toggle("hidden", tab !== id); });
      if (tab === "feed") loadFeed();
      if (tab === "discover") loadNext();
      if (tab === "people") loadPeople();
      if (tab === "me") loadMe();
    });
  });

  (async function boot() {
    try {
      const d = await api("/me"); state.me = d.profile; await loadFeed();
      if (!d.profile || !d.profile.complete) toast("បង្កើត Profile ក្នុង bot ដើម្បីបង្ហោះ និង Match");
    } catch (e) {
      $("feed-empty").textContent = e.message + " — បើកពី Telegram bot";
      $("feed-empty").style.display = "block";
    }
  })();
})();

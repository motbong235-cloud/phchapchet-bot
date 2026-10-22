(function () {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor("#0b1020");
      tg.setBackgroundColor("#0b1020");
    } catch (e) {}
  }

  const state = {
    initData: (tg && tg.initData) || "",
    me: null,
    current: null,
  };

  const $ = (id) => document.getElementById(id);
  const toastEl = $("toast");

  function toast(msg, cls) {
    toastEl.textContent = msg;
    toastEl.className = "toast " + (cls || "");
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.add("hidden"), 2200);
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
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || "API error " + res.status);
    }
    return data;
  }

  function photoUrl(fileId) {
    if (!fileId) return "";
    return "/api/mini/photo/" + encodeURIComponent(fileId);
  }

  function showProfile(p) {
    state.current = p;
    const card = $("card");
    const actions = $("actions");
    const msg = $("discover-msg");
    if (!p) {
      card.classList.add("empty");
      $("photo").style.backgroundImage = "";
      $("name").textContent = "អស់ Profile";
      $("info").textContent = "";
      $("bio").textContent = "សាកម្តងទៀតក្រោយ ឬពង្រីកចំណូលចិត្ត។";
      actions.hidden = true;
      msg.textContent = "";
      return;
    }
    card.classList.remove("empty");
    const ph = (p.photos && p.photos[0]) || "";
    $("photo").style.backgroundImage = ph ? "url('" + photoUrl(ph) + "')" : "";
    $("name").textContent = (p.name || "—") + (p.age ? ", " + p.age : "");
    $("info").textContent = [p.gender_label, p.looking_label, p.city].filter(Boolean).join(" · ");
    $("bio").textContent = p.bio || "";
    actions.hidden = false;
    msg.textContent = "";
  }

  async function loadNext() {
    $("discover-msg").textContent = "កំពុងផ្ទុក…";
    try {
      const d = await api("/next");
      showProfile(d.profile || null);
      if (!d.profile) $("discover-msg").textContent = d.message || "";
    } catch (e) {
      showProfile(null);
      $("discover-msg").textContent = e.message;
    }
  }

  async function doLike() {
    if (!state.current) return;
    try {
      const d = await api("/like", { method: "POST", body: { target_id: state.current.id } });
      if (d.match) {
        toast("🎉 Match! " + (d.username ? "@" + d.username : d.name || ""), "match");
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
      } else {
        toast("💚 បាន Like", "ok");
        if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
      }
      await loadNext();
    } catch (e) {
      toast(e.message);
    }
  }

  async function doSkip() {
    if (!state.current) return;
    try {
      await api("/skip", { method: "POST", body: { target_id: state.current.id } });
      await loadNext();
    } catch (e) {
      toast(e.message);
    }
  }

  async function loadMatches() {
    const list = $("match-list");
    const empty = $("match-empty");
    list.innerHTML = "";
    try {
      const d = await api("/matches");
      const items = d.matches || [];
      empty.style.display = items.length ? "none" : "block";
      items.forEach((m) => {
        const a = document.createElement("a");
        a.className = "match-item";
        a.href = m.username ? "https://t.me/" + m.username : "#";
        if (m.username) a.target = "_blank";
        const av = document.createElement("div");
        av.className = "av";
        if (m.photos && m.photos[0]) av.style.backgroundImage = "url('" + photoUrl(m.photos[0]) + "')";
        const t = document.createElement("div");
        t.className = "t";
        t.innerHTML =
          "<strong>" +
          (m.name || "—") +
          (m.age ? ", " + m.age : "") +
          "</strong><span>" +
          (m.username ? "@" + m.username : "គ្មាន username") +
          "</span>";
        a.appendChild(av);
        a.appendChild(t);
        list.appendChild(a);
      });
    } catch (e) {
      empty.style.display = "block";
      empty.textContent = e.message;
    }
  }

  async function loadMe() {
    const box = $("me-card");
    try {
      const d = await api("/me");
      const p = d.profile;
      if (!p || !p.complete) {
        box.innerHTML =
          '<div class="meta"><h2>Profile មិនទាន់គ្រប់</h2><p class="sub">បើក bot chat → កែ Profile</p></div>';
        return;
      }
      const ph = (p.photos && p.photos[0]) || "";
      box.innerHTML =
        '<div class="photo" style="background-image:url(\'' +
        (ph ? photoUrl(ph) : "") +
        '\')"></div><div class="meta"><h2>' +
        (p.name || "") +
        (p.age ? ", " + p.age : "") +
        '</h2><p class="sub">' +
        [p.gender_label, p.looking_label, p.city].filter(Boolean).join(" · ") +
        '</p><p class="bio">' +
        (p.bio || "") +
        "</p></div>";
    } catch (e) {
      box.innerHTML = '<div class="meta"><p class="sub">' + e.message + "</p></div>";
    }
  }

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      const tab = btn.dataset.tab;
      $("view-discover").classList.toggle("hidden", tab !== "discover");
      $("view-matches").classList.toggle("hidden", tab !== "matches");
      $("view-me").classList.toggle("hidden", tab !== "me");
      if (tab === "matches") loadMatches();
      if (tab === "me") loadMe();
      if (tab === "discover") loadNext();
    });
  });

  $("btn-like").addEventListener("click", doLike);
  $("btn-skip").addEventListener("click", doSkip);

  // boot
  (async function () {
    try {
      const d = await api("/me");
      state.me = d.profile;
      if (!d.profile || !d.profile.complete) {
        showProfile(null);
        $("discover-msg").textContent = "សូមបង្កើត Profile ក្នុង bot chat ជាមុនសិន។";
        $("actions").hidden = true;
        return;
      }
      await loadNext();
    } catch (e) {
      $("discover-msg").textContent = e.message + " — បើក Mini App ពីក្នុង Telegram bot";
    }
  })();
})();

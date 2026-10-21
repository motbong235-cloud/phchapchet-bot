#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ភ្ជាប់ចិត្ត (PhchapChet) — Telegram bot ស្វែងរកមិត្តភក្តិ & សង្សារ
Deploy: Render · BOT_TOKEN + ADMIN_ID + DATA_DIR=/var/data
"""
from __future__ import annotations

import os
import re
import json
import time
import logging
import threading
from datetime import datetime

import telebot
from telebot import types
from flask import Flask

# ═══════════════════════════════════════════════════════════
#  CONFIG
# ═══════════════════════════════════════════════════════════
BOT_TOKEN = os.environ.get("BOT_TOKEN", "").strip()
ADMIN_ID = int(os.environ.get("ADMIN_ID", "0") or 0)
DATA_DIR = os.environ.get("DATA_DIR", "/var/data")
BOT_NAME = "ភ្ជាប់ចិត្ត"
BOT_NAME_EN = "PhchapChet"

try:
    os.makedirs(DATA_DIR, exist_ok=True)
except OSError:
    DATA_DIR = "."
    os.makedirs(DATA_DIR, exist_ok=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("phchapchet")

USERS_FILE = os.path.join(DATA_DIR, "users.json")
LIKES_FILE = os.path.join(DATA_DIR, "likes.json")
MATCHES_FILE = os.path.join(DATA_DIR, "matches.json")
REPORTS_FILE = os.path.join(DATA_DIR, "reports.json")
SETTINGS_FILE = os.path.join(DATA_DIR, "settings.json")

# ═══════════════════════════════════════════════════════════
#  STORAGE
# ═══════════════════════════════════════════════════════════
_save_locks: dict = {}
_locks_guard = threading.Lock()


def _lock(path: str) -> threading.Lock:
    with _locks_guard:
        if path not in _save_locks:
            _save_locks[path] = threading.Lock()
        return _save_locks[path]


def _load(path: str, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default
    except Exception as e:
        log.error("load %s: %s", path, e)
        bak = path + ".bak"
        if os.path.isfile(bak):
            try:
                with open(bak, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return default


def _save(path: str, data) -> None:
    with _lock(path):
        try:
            os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
            tmp = f"{path}.tmp.{os.getpid()}.{time.time_ns()}"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
                f.flush()
            if os.path.isfile(path):
                try:
                    import shutil
                    shutil.copy2(path, path + ".bak")
                except Exception:
                    pass
            os.replace(tmp, path)
        except Exception as e:
            log.error("save %s: %s", path, e)
            try:
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
            except Exception as e2:
                log.error("save direct fail %s: %s", path, e2)


users: dict = _load(USERS_FILE, {})
likes: dict = _load(LIKES_FILE, {})      # uid -> [liked_uid, ...]
matches: dict = _load(MATCHES_FILE, {})  # uid -> [matched_uid, ...]
reports: list = _load(REPORTS_FILE, [])
settings: dict = _load(SETTINGS_FILE, {
    "min_age": 16,
    "max_age": 60,
    "welcome": (
        f"💕 សូមស្វាគមន៍មកកាន់ <b>{BOT_NAME}</b>!\n"
        f"<i>{BOT_NAME_EN} — Connect Hearts</i>\n\n"
        "ស្វែងរកមិត្តភក្តិ និងសង្សារក្នុង Telegram\n"
        "សុវត្ថិភាព · ងាយប្រើ · ភាសាខ្មែរ\n\n"
        "ចុច <b>ចាប់ផ្តើម Profile</b> ដើម្បីចុះឈ្មោះ។"
    ),
})

waiting: dict = {}  # uid -> step str or dict

if not BOT_TOKEN:
    log.error("BOT_TOKEN missing")
bot = telebot.TeleBot(BOT_TOKEN, parse_mode="HTML") if BOT_TOKEN else None

# ═══════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════
GENDER_LABEL = {"male": "👨 ប្រុស", "female": "👩 ស្រី", "other": "🌈 ផ្សេង"}
LOOKING_LABEL = {
    "friends": "🤝 មិត្តភក្តិ",
    "dating": "💕 សង្សារ",
    "both": "✨ មិត្ត + សង្សារ",
}


def uid_s(uid) -> str:
    return str(uid)


def get_user(uid) -> dict | None:
    return users.get(uid_s(uid))


def save_users():
    _save(USERS_FILE, users)


def save_likes():
    _save(LIKES_FILE, likes)


def save_matches():
    _save(MATCHES_FILE, matches)


def is_admin(uid) -> bool:
    return ADMIN_ID and int(uid) == ADMIN_ID


def profile_complete(u: dict) -> bool:
    if not u:
        return False
    need = ("name", "age", "gender", "looking", "city", "bio")
    return all(u.get(k) for k in need) and bool(u.get("photos"))


def main_kb(uid=None):
    kb = types.ReplyKeyboardMarkup(resize_keyboard=True, row_width=2)
    u = get_user(uid) if uid else None
    if u and profile_complete(u):
        kb.row("🔍 ស្វែងរក", "💬 Matches")
        kb.row("👤 Profile ខ្ញុំ", "⚙️ កែ Profile")
        kb.row("⏸ ផ្អាក / បន្ត", "📢 ជួយ")
    else:
        kb.row("✏️ ចាប់ផ្តើម Profile")
        kb.row("📢 ជួយ")
    if uid and is_admin(uid):
        kb.row("🛠 Admin")
    return kb


def cancel_kb():
    kb = types.ReplyKeyboardMarkup(resize_keyboard=True)
    kb.row("❌ បោះបង់")
    return kb


def gender_kb():
    kb = types.ReplyKeyboardMarkup(resize_keyboard=True, row_width=3)
    kb.row("👨 ប្រុស", "👩 ស្រី", "🌈 ផ្សេង")
    kb.row("❌ បោះបង់")
    return kb


def looking_kb():
    kb = types.ReplyKeyboardMarkup(resize_keyboard=True, row_width=1)
    kb.row("🤝 មិត្តភក្តិ")
    kb.row("💕 សង្សារ")
    kb.row("✨ មិត្ត + សង្សារ")
    kb.row("❌ បោះបង់")
    return kb


def browse_kb():
    kb = types.ReplyKeyboardMarkup(resize_keyboard=True, row_width=3)
    kb.row("💚 Like", "⏭ បន្ទាប់", "🚫 Report")
    kb.row("🏠 ម៉ឺនុយ")
    return kb


def match_compat(a: dict, b: dict) -> bool:
    """Basic preference filter."""
    if not a or not b:
        return False
    if a.get("paused") or b.get("paused"):
        return False
    # looking for gender
    want = a.get("want_gender") or "any"
    if want != "any" and b.get("gender") != want:
        return False
    # age range
    try:
        age_b = int(b.get("age") or 0)
        amin = int(a.get("age_min") or settings.get("min_age", 16))
        amax = int(a.get("age_max") or settings.get("max_age", 60))
        if age_b and (age_b < amin or age_b > amax):
            return False
    except (TypeError, ValueError):
        pass
    return True


def format_profile(u: dict, hide_id=True) -> str:
    g = GENDER_LABEL.get(u.get("gender", ""), u.get("gender", "—"))
    look = LOOKING_LABEL.get(u.get("looking", ""), u.get("looking", "—"))
    lines = [
        f"👤 <b>{u.get('name', '—')}</b>, {u.get('age', '—')}",
        f"{g} · {look}",
        f"📍 {u.get('city', '—')}",
        "",
        f"{u.get('bio', '')}",
    ]
    if not hide_id and u.get("username"):
        lines.append(f"\n@{u['username']}")
    return "\n".join(lines)


def send_profile_card(to_uid, profile: dict, with_browse=False):
    text = format_profile(profile)
    photos = profile.get("photos") or []
    kb = browse_kb() if with_browse else main_kb(to_uid)
    try:
        if photos:
            # send first photo with caption
            bot.send_photo(to_uid, photos[0], caption=text[:1024], reply_markup=kb)
            for p in photos[1:3]:
                try:
                    bot.send_photo(to_uid, p)
                except Exception:
                    pass
        else:
            bot.send_message(to_uid, text, reply_markup=kb)
    except Exception as e:
        log.warning("send_profile_card: %s", e)


def ensure_user(msg) -> dict:
    uid = uid_s(msg.from_user.id)
    if uid not in users:
        users[uid] = {
            "id": msg.from_user.id,
            "username": msg.from_user.username or "",
            "tg_name": (msg.from_user.first_name or "")[:64],
            "created": datetime.utcnow().isoformat() + "Z",
            "paused": False,
            "photos": [],
        }
        save_users()
    else:
        users[uid]["username"] = msg.from_user.username or users[uid].get("username", "")
    return users[uid]


def next_candidate(viewer_uid: str):
    """Return next user id to show, or None."""
    me = users.get(viewer_uid)
    if not me or not profile_complete(me):
        return None
    my_likes = set(likes.get(viewer_uid, []))
    my_matches = set(matches.get(viewer_uid, []))
    seen = my_likes | my_matches | {viewer_uid}
    # also skip people who already matched
    candidates = []
    for oid, ou in users.items():
        if oid in seen:
            continue
        if not profile_complete(ou):
            continue
        if ou.get("paused"):
            continue
        if not match_compat(me, ou):
            continue
        candidates.append(oid)
    if not candidates:
        return None
    # simple rotation by last_browse index
    idx = int(me.get("_browse_i", 0)) % len(candidates)
    me["_browse_i"] = idx + 1
    save_users()
    return candidates[idx]


def add_like(from_uid: str, to_uid: str) -> bool:
    """Return True if mutual match."""
    likes.setdefault(from_uid, [])
    if to_uid not in likes[from_uid]:
        likes[from_uid].append(to_uid)
        save_likes()
    # mutual?
    if from_uid in likes.get(to_uid, []):
        matches.setdefault(from_uid, [])
        matches.setdefault(to_uid, [])
        if to_uid not in matches[from_uid]:
            matches[from_uid].append(to_uid)
        if from_uid not in matches[to_uid]:
            matches[to_uid].append(from_uid)
        save_matches()
        return True
    return False


# ═══════════════════════════════════════════════════════════
#  HANDLERS
# ═══════════════════════════════════════════════════════════
@bot.message_handler(commands=["start", "help"])
def cmd_start(message):
    u = ensure_user(message)
    uid = message.from_user.id
    waiting.pop(uid, None)
    bot.send_message(uid, settings.get("welcome", f"សូមស្វាគមន៍ {BOT_NAME}"), reply_markup=main_kb(uid))
    if profile_complete(u):
        bot.send_message(uid, "✅ Profile របស់អ្នករួចរាល់ — ចុច <b>🔍 ស្វែងរក</b>", reply_markup=main_kb(uid))


@bot.message_handler(commands=["admin"])
def cmd_admin(message):
    if not is_admin(message.from_user.id):
        return
    n = len(users)
    m = sum(len(v) for v in matches.values()) // 2
    bot.send_message(
        message.chat.id,
        f"🛠 <b>Admin — {BOT_NAME}</b>\n"
        f"👥 Users: <b>{n}</b>\n"
        f"💚 Matches: <b>{m}</b>\n"
        f"🚩 Reports: <b>{len(reports)}</b>",
        reply_markup=main_kb(message.from_user.id),
    )


@bot.message_handler(func=lambda m: m.text == "❌ បោះបង់")
def cmd_cancel(message):
    waiting.pop(message.from_user.id, None)
    bot.send_message(message.chat.id, "បោះបង់ហើយ។", reply_markup=main_kb(message.from_user.id))


@bot.message_handler(func=lambda m: m.text in ("✏️ ចាប់ផ្តើម Profile", "⚙️ កែ Profile"))
def start_profile(message):
    ensure_user(message)
    uid = message.from_user.id
    waiting[uid] = "name"
    bot.send_message(uid, "✏️ <b>ឈ្មោះបង្ហាញ</b>\nសរសេរឈ្មោះដែលអ្នកចង់ឲ្យគេឃើញ:", reply_markup=cancel_kb())


@bot.message_handler(func=lambda m: m.text == "👤 Profile ខ្ញុំ")
def my_profile(message):
    u = ensure_user(message)
    if not profile_complete(u):
        bot.send_message(message.chat.id, "មិនទាន់មាន Profile ទេ — ចុច <b>✏️ ចាប់ផ្តើម Profile</b>", reply_markup=main_kb(message.from_user.id))
        return
    send_profile_card(message.from_user.id, u, with_browse=False)


@bot.message_handler(func=lambda m: m.text == "⏸ ផ្អាក / បន្ត")
def toggle_pause(message):
    u = ensure_user(message)
    u["paused"] = not u.get("paused")
    save_users()
    st = "⏸ ផ្អាកហើយ — គេនឹងមិនឃើញអ្នក" if u["paused"] else "▶️ បន្តហើយ — Profile បង្ហាញវិញ"
    bot.send_message(message.chat.id, st, reply_markup=main_kb(message.from_user.id))


@bot.message_handler(func=lambda m: m.text == "📢 ជួយ")
def help_msg(message):
    bot.send_message(
        message.chat.id,
        f"💕 <b>{BOT_NAME}</b> ({BOT_NAME_EN})\n\n"
        "1️⃣ បង្កើត Profile (ឈ្មោះ, អាយុ, ភេទ, រូប, bio)\n"
        "2️⃣ ចុច 🔍 ស្វែងរក — Like ឬ បន្ទាប់\n"
        "3️⃣ បើ Like ទៅវិញទៅមក → <b>Match</b> · អាចជជែក\n"
        "4️⃣ ⏸ ផ្អាក បើមិនចង់ឲ្យគេឃើញ\n\n"
        "⚠️ កុំផ្ញើព័ត៌មានធនាគារ / អាសយដ្ឋានពិត។ រាយការណ៍អ្នកប្រើមិនល្អតាម 🚫 Report។",
        reply_markup=main_kb(message.from_user.id),
    )


@bot.message_handler(func=lambda m: m.text == "🏠 ម៉ឺនុយ")
def go_home(message):
    waiting.pop(message.from_user.id, None)
    bot.send_message(message.chat.id, "ម៉ឺនុយ", reply_markup=main_kb(message.from_user.id))


@bot.message_handler(func=lambda m: m.text == "🔍 ស្វែងរក")
def browse(message):
    uid = message.from_user.id
    u = ensure_user(message)
    if not profile_complete(u):
        bot.send_message(uid, "សូមបង្កើត Profile ជាមុនសិន។", reply_markup=main_kb(uid))
        return
    if u.get("paused"):
        bot.send_message(uid, "Profile កំពុងផ្អាក — ចុច ⏸ ផ្អាក / បន្ត ដើម្បីបើក។", reply_markup=main_kb(uid))
        return
    cand = next_candidate(uid_s(uid))
    if not cand:
        bot.send_message(uid, "ពេលនេះមិនមាន Profile ថ្មីទេ។ សាកម្តងទៀតក្រោយ។", reply_markup=main_kb(uid))
        return
    waiting[uid] = {"step": "browse", "target": cand}
    send_profile_card(uid, users[cand], with_browse=True)


@bot.message_handler(func=lambda m: m.text == "💚 Like")
def do_like(message):
    uid = message.from_user.id
    step = waiting.get(uid)
    if not isinstance(step, dict) or step.get("step") != "browse":
        bot.send_message(uid, "ចុច 🔍 ស្វែងរក ជាមុន។", reply_markup=main_kb(uid))
        return
    target = step.get("target")
    if not target or target not in users:
        bot.send_message(uid, "Profile នេះមិនមានទៀតទេ។", reply_markup=main_kb(uid))
        waiting.pop(uid, None)
        return
    matched = add_like(uid_s(uid), target)
    if matched:
        other = users[target]
        me = users[uid_s(uid)]
        bot.send_message(
            uid,
            f"🎉 <b>Match!</b> អ្នក និង <b>{other.get('name')}</b> Like គ្នា!\n"
            + (f"Telegram: @{other['username']}" if other.get("username") else "គេមិនមាន username — រង់ចាំគេទាក់ទង"),
            reply_markup=main_kb(uid),
        )
        try:
            bot.send_message(
                int(target),
                f"🎉 <b>Match!</b> អ្នក និង <b>{me.get('name')}</b> Like គ្នា!\n"
                + (f"Telegram: @{me['username']}" if me.get("username") else ""),
                reply_markup=main_kb(int(target)),
            )
        except Exception:
            pass
        waiting.pop(uid, None)
    else:
        bot.send_message(uid, "💚 បាន Like — បើគេ Like វិញនឹង Match!", reply_markup=browse_kb())
        # auto next
        cand = next_candidate(uid_s(uid))
        if cand:
            waiting[uid] = {"step": "browse", "target": cand}
            send_profile_card(uid, users[cand], with_browse=True)
        else:
            waiting.pop(uid, None)
            bot.send_message(uid, "អស់ Profile ហើយ។", reply_markup=main_kb(uid))


@bot.message_handler(func=lambda m: m.text == "⏭ បន្ទាប់")
def do_skip(message):
    uid = message.from_user.id
    step = waiting.get(uid)
    if not isinstance(step, dict) or step.get("step") != "browse":
        browse(message)
        return
    cand = next_candidate(uid_s(uid))
    if not cand:
        waiting.pop(uid, None)
        bot.send_message(uid, "អស់ Profile ហើយ។", reply_markup=main_kb(uid))
        return
    waiting[uid] = {"step": "browse", "target": cand}
    send_profile_card(uid, users[cand], with_browse=True)


@bot.message_handler(func=lambda m: m.text == "🚫 Report")
def do_report(message):
    uid = message.from_user.id
    step = waiting.get(uid)
    if not isinstance(step, dict) or step.get("step") != "browse":
        bot.send_message(uid, "អាច Report បានពេលកំពុងមើល Profile។", reply_markup=main_kb(uid))
        return
    target = step.get("target")
    reports.append({
        "from": uid_s(uid),
        "target": target,
        "ts": datetime.utcnow().isoformat() + "Z",
    })
    _save(REPORTS_FILE, reports)
    bot.send_message(uid, "បានរាយការណ៍។ អរគុណ។", reply_markup=browse_kb())
    if ADMIN_ID:
        try:
            bot.send_message(ADMIN_ID, f"🚩 Report: {uid} → {target}")
        except Exception:
            pass


@bot.message_handler(func=lambda m: m.text == "💬 Matches")
def list_matches(message):
    uid = uid_s(message.from_user.id)
    ml = matches.get(uid, [])
    if not ml:
        bot.send_message(message.chat.id, "មិនទាន់មាន Match ទេ។ ស្វែងរក 🔍 បន្ត!", reply_markup=main_kb(message.from_user.id))
        return
    lines = ["💬 <b>Matches របស់អ្នក</b>\n"]
    for mid in ml[-30:]:
        ou = users.get(mid, {})
        un = f"@{ou['username']}" if ou.get("username") else f"id:{mid}"
        lines.append(f"• <b>{ou.get('name', '?')}</b> — {un}")
    bot.send_message(message.chat.id, "\n".join(lines), reply_markup=main_kb(message.from_user.id))


@bot.message_handler(func=lambda m: m.text == "🛠 Admin")
def admin_panel(message):
    if not is_admin(message.from_user.id):
        return
    cmd_admin(message)


# ── wizard text ──
@bot.message_handler(func=lambda m: m.from_user.id in waiting and waiting.get(m.from_user.id) in (
    "name", "age", "city", "bio", "want_gender", "age_min", "age_max"
) and m.content_type == "text")
def wizard_text(message):
    uid = message.from_user.id
    step = waiting.get(uid)
    text = (message.text or "").strip()
    if text == "❌ បោះបង់":
        return cmd_cancel(message)
    u = ensure_user(message)

    if step == "name":
        if len(text) < 2 or len(text) > 32:
            bot.send_message(uid, "ឈ្មោះ 2–32 តួ។ សរសេរម្តងទៀត:")
            return
        u["name"] = text
        save_users()
        waiting[uid] = "age"
        bot.send_message(uid, "🎂 <b>អាយុ</b> (លេខ ឧ. 22):", reply_markup=cancel_kb())
        return

    if step == "age":
        try:
            age = int(text)
        except ValueError:
            bot.send_message(uid, "សូមបញ្ចូលលេខអាយុ:")
            return
        if age < settings.get("min_age", 16) or age > 99:
            bot.send_message(uid, f"អាយុត្រូវពី {settings.get('min_age', 16)}+ :")
            return
        u["age"] = age
        save_users()
        waiting[uid] = "gender"
        bot.send_message(uid, "ភេទរបស់អ្នក:", reply_markup=gender_kb())
        return

    if step == "city":
        u["city"] = text[:48]
        save_users()
        waiting[uid] = "looking"
        bot.send_message(uid, "អ្នកចង់ស្វែងរក:", reply_markup=looking_kb())
        return

    if step == "bio":
        u["bio"] = text[:300]
        save_users()
        waiting[uid] = "photos"
        bot.send_message(
            uid,
            "📸 ផ្ញើ <b>រូបថត 1–3 សន្លឹក</b> (ផ្ញើជា Photo)\n"
            "ពេលគ្រប់ហើយ វាយ <b>រួចហើយ</b>",
            reply_markup=cancel_kb(),
        )
        return


@bot.message_handler(func=lambda m: waiting.get(m.from_user.id) == "gender")
def wizard_gender(message):
    uid = message.from_user.id
    text = message.text or ""
    u = ensure_user(message)
    mapping = {"👨 ប្រុស": "male", "👩 ស្រី": "female", "🌈 ផ្សេង": "other"}
    if text not in mapping:
        bot.send_message(uid, "ជ្រើសពីប៊ូតុង:", reply_markup=gender_kb())
        return
    u["gender"] = mapping[text]
    save_users()
    waiting[uid] = "city"
    bot.send_message(uid, "📍 <b>ទីក្រុង / ខេត្ត</b>:", reply_markup=cancel_kb())


@bot.message_handler(func=lambda m: waiting.get(m.from_user.id) == "looking")
def wizard_looking(message):
    uid = message.from_user.id
    text = message.text or ""
    u = ensure_user(message)
    mapping = {
        "🤝 មិត្តភក្តិ": "friends",
        "💕 សង្សារ": "dating",
        "✨ មិត្ត + សង្សារ": "both",
    }
    if text not in mapping:
        bot.send_message(uid, "ជ្រើសពីប៊ូតុង:", reply_markup=looking_kb())
        return
    u["looking"] = mapping[text]
    save_users()
    waiting[uid] = "bio"
    bot.send_message(uid, "📝 <b>Bio</b> — សរសេរពីរបីម៉ាត់អំពីខ្លួនអ្នក (≤300 តួ):", reply_markup=cancel_kb())


@bot.message_handler(content_types=["photo"])
def on_photo(message):
    uid = message.from_user.id
    if waiting.get(uid) != "photos":
        return
    u = ensure_user(message)
    file_id = message.photo[-1].file_id
    photos = u.setdefault("photos", [])
    if len(photos) >= 3:
        bot.send_message(uid, "បាន 3 រូបហើយ — វាយ <b>រួចហើយ</b>")
        return
    photos.append(file_id)
    save_users()
    bot.send_message(uid, f"✅ រូប {len(photos)}/3 — ផ្ញើបន្ថែម ឬវាយ <b>រួចហើយ</b>", reply_markup=cancel_kb())


@bot.message_handler(func=lambda m: waiting.get(m.from_user.id) == "photos" and (m.text or "").strip() in ("រួចហើយ", "done", "Done"))
def photos_done(message):
    uid = message.from_user.id
    u = ensure_user(message)
    if not u.get("photos"):
        bot.send_message(uid, "ត្រូវការយ៉ាងហោច 1 រូប។ ផ្ញើ Photo:")
        return
    waiting.pop(uid, None)
    save_users()
    bot.send_message(uid, "🎉 <b>Profile រួចរាល់!</b>\nចុច 🔍 ស្វែងរក ដើម្បីចាប់ផ្តើម។", reply_markup=main_kb(uid))
    send_profile_card(uid, u, with_browse=False)


@bot.message_handler(func=lambda m: True, content_types=["text"])
def fallback(message):
    if message.from_user.id in waiting:
        return
    bot.send_message(message.chat.id, "ជ្រើសពីម៉ឺនុយខាងក្រោម។", reply_markup=main_kb(message.from_user.id))


# ═══════════════════════════════════════════════════════════
#  FLASK HEALTH (Render)
# ═══════════════════════════════════════════════════════════
app = Flask(__name__)


@app.get("/health")
def health():
    return {"ok": True, "bot": BOT_NAME_EN, "users": len(users)}, 200


def run_flask():
    port = int(os.environ.get("PORT", "10000"))
    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)


# ═══════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════
if __name__ == "__main__":
    if not BOT_TOKEN:
        raise SystemExit("Set BOT_TOKEN")
    log.info("Starting %s (%s) users=%s", BOT_NAME, BOT_NAME_EN, len(users))
    threading.Thread(target=run_flask, daemon=True).start()
    while True:
        try:
            bot.infinity_polling(timeout=60, long_polling_timeout=40)
        except Exception as e:
            log.error("polling: %s", e)
            time.sleep(3)

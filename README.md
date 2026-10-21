# ភ្ជាប់ចិត្ត (PhchapChet)

Telegram bot ស្វែងរក **មិត្តភក្តិ** និង **សង្សារ** — ភាសាខ្មែរ។

## Features
- បង្កើត Profile (ឈ្មោះ, អាយុ, ភេទ, ទីក្រុង, bio, រូប 1–3)
- 🔍 ស្វែងរក · Like · បន្ទាប់ · Report
- Match ទៅវិញទៅមក + ជូនដំណឹង
- ⏸ ផ្អាក Profile
- Admin panel មូលដ្ឋាន
- Data រក្សានៅ disk (`DATA_DIR`)

## Render deploy
1. New Web Service → repo ឬ upload
2. Build: `pip install -r requirements.txt`
3. Start: `python bot.py`
4. Env:
   - `BOT_TOKEN` = token ពី @BotFather
   - `ADMIN_ID` = Telegram user id របស់អ្នក
   - `DATA_DIR` = `/var/data`
5. Disk: mount `/var/data` (1 GB)

## BotFather
1. `/newbot` → ឈ្មោះ: `ភ្ជាប់ចិត្ត` · username: `PhchapChetBot` (ឬស្រដៀង)
2. Set description / about
3. Upload logo ជា bot picture

## Local
```bash
export BOT_TOKEN=...
export ADMIN_ID=...
export DATA_DIR=./data
pip install -r requirements.txt
python bot.py
```

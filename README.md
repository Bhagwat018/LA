# 💼 LinkedIn Autonomous Growth & Freelance Agent (`LA`)

An autonomous AI agent designed to discover freelance projects, part-time contracts, and high-match developer jobs on LinkedIn using Playwright persistent browser automation, multi-channel outreach (Email + LinkedIn DM/Connection Notes), inbox response tracking, and scheduled peak-hour execution.

---

## 🎯 Primary Workflow & Architecture

```
[1. Peak Time Scheduler (09:30 AM & 02:30 PM)]
                   │
                   ▼
  [Stage 1: find-freelance.mjs]
  • Scans live posts from past 24h
  • Filters hiring posts vs job-seekers
  • Extracts founder emails & tech requirements
  • Appends to data/freelance-leads.json
                   │
                   ▼
  [Stage 2: send-outreach.mjs]
  • Lead has Email? ───► Sends tailored email proposal via SMTP / Gmail
  • Lead on LinkedIn? ─► Sends personalized connection note (<=300 chars) or DM
  • Logs progress to data/outreach-history.json
                   │
                   ▼
  [Stage 3: check-inbox.mjs]
  • Checks LinkedIn Messaging for client replies
  • Logs active conversations & unread badges
  • Alerts when a prospect responds to discuss terms!
                   │
                   ▼
  [Stage 4: Daily Report]
  • Generates data/daily-report-YYYY-MM-DD.md
```

---

## 🚀 Quick Usage Commands

| Command | Action |
|---|---|
| `npm run daily` | Run complete pipeline immediately (Hunt leads ➔ Send emails & pitches ➔ Check responses) |
| `npm run inbox` | Check for unread client messages & responses in your LinkedIn inbox |
| `npm run find:freelance` | Scan recent LinkedIn posts for freelance/contract developer requirements |
| `npm run outreach` | Send emails & LinkedIn connection notes to pending leads in database |
| `npm run daemon` | Keep scheduler running in terminal (executes every weekday at 09:30 AM & 02:30 PM) |
| `npm run schedule:install` | Install silent macOS background service via `launchd` (runs automatically even if terminal is closed) |
| `npm run schedule:uninstall` | Stop and remove the macOS background service |

---

## 📧 Cold Email Setup (Optional but Recommended)

When founders post *"We are hiring freelance developers, send portfolio to abc@company.com"*, the agent can automatically email your proposal:

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. For Gmail, generate a 16-character App Password at [Google Account App Passwords](https://myaccount.google.com/apppasswords).
3. Set your credentials in `.env`:
   ```env
   SMTP_SERVICE=gmail
   SMTP_USER=your_email@gmail.com
   SMTP_PASS=your_16_character_app_password
   FROM_EMAIL="Bhagwat <your_email@gmail.com>"
   ```

*If SMTP is not configured, the agent skips email and performs LinkedIn connection notes and DMs directly.*

---

## ⏰ Peak LinkedIn Hours & Scheduling

LinkedIn response and engagement rates peak between:
* **Morning Peak**: `09:30 AM` (Founders & recruiters review feeds and post urgent requirements)
* **Afternoon Peak**: `02:30 PM` (Post-lunch review of applicants and message threads)

The installed LaunchAgent runs completely silently in the background (`HEADLESS=true`) at these exact times without opening intrusive popups.

---

## 🛡️ Anti-Ban Safety Rules & Limits

* **Daily Outbound Limits**: Capped at 5–8 personalized connection requests per day to keep your account 100% safe.
* **Human Emulation**: 6–12 second randomized pauses between profile visits.
* **Session Persistence**: Kept in `.linkedin-session/` (never committed to git).

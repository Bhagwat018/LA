#!/usr/bin/env node
import "dotenv/config";
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const userDataDir = path.join(rootDir, ".linkedin-session");
const repliesPath = path.join(rootDir, "data", "inbox-replies.json");
const historyPath = path.join(rootDir, "data", "outreach-history.json");

if (!fs.existsSync(userDataDir)) {
  console.error("❌ No saved LinkedIn session found. Run npm run login first.");
  process.exit(1);
}

const IS_HEADLESS = process.env.HEADLESS !== "false";

console.log("\n=======================================================");
console.log("📬 LinkedIn Messaging & Lead Response Checker");
console.log(`🖥️ Mode: ${IS_HEADLESS ? "Headless (Background)" : "Headed (Visible)"}`);
console.log("=======================================================\n");

async function checkInbox() {
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chrome",
    headless: IS_HEADLESS,
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  try {
    console.log("⏳ Opening LinkedIn Messaging...");
    await page.goto("https://www.linkedin.com/messaging/", {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForTimeout(5000);

    if (page.url().includes("/login")) {
      throw new Error("Session expired. Please run 'npm run login' again.");
    }

    // Evaluate conversations in inbox
    const conversations = await page.evaluate(() => {
      const items = Array.from(
        document.querySelectorAll(
          "li.msg-conversation-listitem, div.msg-conversation-card, li[data-view-name*='conversation']"
        )
      );

      return items.slice(0, 15).map((item) => {
        const nameEl = item.querySelector(
          "h3, .msg-conversation-listitem__participant-names, .msg-conversation-card__participant-names"
        );
        const snippetEl = item.querySelector(
          ".msg-conversation-card__message-snippet, .msg-conversation-listitem__message-snippet-body, p"
        );
        const timeEl = item.querySelector("time, .msg-conversation-listitem__time-stamp");
        const unreadBadge = item.querySelector(
          ".msg-conversation-card__unread-count, .notification-badge--unread"
        );

        return {
          senderName: nameEl ? nameEl.innerText.trim() : "Unknown",
          snippet: snippetEl ? snippetEl.innerText.trim() : "",
          timestamp: timeEl ? timeEl.innerText.trim() : "",
          isUnread: !!unreadBadge || item.classList.contains("msg-conversation-card--unread"),
        };
      });
    });

    console.log(`📨 Scanned ${conversations.length} raw conversation cards in Messaging.`);

    // Deduplicate by senderName + snippet
    const uniqueMap = new Map();
    for (const c of conversations) {
      const key = `${c.senderName}:::${c.snippet}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, c);
      }
    }
    const uniqueConversations = Array.from(uniqueMap.values());

    const unreadReplies = uniqueConversations.filter((c) => c.isUnread);

    const updatedReplies = uniqueConversations.map((c) => ({
      ...c,
      checkedAt: new Date().toISOString(),
    }));

    fs.writeFileSync(repliesPath, JSON.stringify(updatedReplies, null, 2), "utf-8");

    if (unreadReplies.length > 0) {
      console.log("\n🚨 =======================================================");
      console.log(`🔥 ALERT: YOU HAVE ${unreadReplies.length} UNREAD CLIENT RESPONSES!`);
      console.log("=======================================================");
      unreadReplies.forEach((r, i) => {
        console.log(`\n💬 [#${i + 1}] From: ${r.senderName} (${r.timestamp})`);
        console.log(`   Message Preview: "${r.snippet}"`);
      });
      console.log("\n👉 Go to https://www.linkedin.com/messaging/ to reply and finalize project terms!\n");
    } else {
      console.log("✨ No new unread messages at the moment.");
      if (conversations.length > 0) {
        console.log("\nRecent inbox activity:");
        conversations.slice(0, 3).forEach((c) => {
          console.log(`- ${c.senderName}: "${c.snippet.slice(0, 70)}..." (${c.timestamp})`);
        });
      }
    }

    await context.close();
  } catch (err) {
    console.error("❌ Error checking inbox:", err.message);
    await context.close();
  }
}

checkInbox();

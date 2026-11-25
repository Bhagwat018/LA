// scripts/send-pending-accepted-dms.mjs
// Sends direct pitch DMs to Urvashi Relwani and Simarpreet Singh who accepted connection requests

import "dotenv/config";
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const userDataDir = path.join(rootDir, ".linkedin-session");
const historyPath = path.join(rootDir, "data", "outreach-history.json");

const TARGETS = [
  {
    name: "Urvashi Relwani",
    profile: "https://www.linkedin.com/in/urvashi-relwani-abb684209/",
    req: "IT Developer requirement @ GirnarSoft",
    shotName: "urvashi-dm-sent.png"
  },
  {
    name: "Simarpreet Singh",
    profile: "https://www.linkedin.com/in/simarpreet-sinngh/",
    req: "React & Mobile Developer requirement",
    shotName: "simarpreet-dm-sent.png"
  }
];

async function run() {
  console.log("=======================================================");
  console.log("💌 Sending Direct Messages to Accepted Connections");
  console.log("=======================================================\n");

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chrome",
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"]
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  let history = fs.existsSync(historyPath) ? JSON.parse(fs.readFileSync(historyPath, "utf-8")) : [];

  for (const t of TARGETS) {
    try {
      console.log(`\n-------------------------------------------------------`);
      console.log(`👤 Processing: ${t.name}`);
      console.log(`🔗 Profile: ${t.profile}`);

      await page.goto(t.profile, { waitUntil: "domcontentloaded", timeout: 35000 });
      await page.waitForTimeout(4000);

      // Find direct compose link
      const composeHref = await page.evaluate(() => {
        const link = Array.from(document.querySelectorAll("a[href*='/messaging/compose']")).find(
          (a) => (a.innerText || "").trim().toLowerCase() === "message"
        );
        return link ? link.href : null;
      });

      if (!composeHref) {
        console.log(`⚠️ Could not find direct compose link for ${t.name}`);
        continue;
      }

      console.log(`   Navigating to compose: ${composeHref}`);
      await page.goto(composeHref, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(4000);

      const firstName = t.name.split(" ")[0];
      const dmText = `Hi ${firstName}, thanks for connecting!\n\nI came across your post regarding the ${t.req}.\n\nI am a Senior Mobile & Full-Stack Developer with 3+ years of production experience (React Native, React.js, Next.js, Node.js). Notably, I engineered KickScore (scaling to 100k+ active users with Hermes & WebSockets) and built enterprise native bridges for the TruVideo Automotive SDK.\n\nI am available immediately for contract/freelance engagements. Would love to know more about the project scope or schedule a brief 5-minute call whenever convenient!\n\nBest regards,\nGopal Bhagwat\nPortfolio: https://github.com/Bhagwat018`;

      // Fill message box
      const typed = await page.evaluate((text) => {
        const box = document.querySelector("div[role='textbox'], div.msg-form__contenteditable");
        if (box) {
          box.focus();
          box.innerText = text;
          box.dispatchEvent(new Event("input", { bubbles: true }));
          return true;
        }
        return false;
      }, dmText);

      if (!typed) {
        console.log(`   ⚠️ Failed to focus message textbox.`);
        continue;
      }

      await page.waitForTimeout(1500);

      // Click Send
      const sent = await page.evaluate(() => {
        const sendBtn = Array.from(document.querySelectorAll("button")).find(
          (b) =>
            b.classList.contains("msg-form__send-button") ||
            (b.innerText || "").trim().toLowerCase() === "send"
        );
        if (sendBtn) {
          sendBtn.disabled = false;
          sendBtn.click();
          return true;
        }
        return false;
      });

      if (sent) {
        await page.waitForTimeout(3000);
        console.log(`   🚀 SUCCESS: DM sent to ${t.name}!`);

        const shotPath = path.join(rootDir, "logs", t.shotName);
        await page.screenshot({ path: shotPath });

        history.push({
          id: `dm-${Date.now()}`,
          authorName: t.name,
          authorProfile: t.profile,
          email: null,
          status: "SENT_DIRECT_MESSAGE",
          method: "LINKEDIN_DM",
          pitchSent: dmText.slice(0, 160) + "...",
          contactedAt: new Date().toISOString()
        });

        fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), "utf-8");
      } else {
        console.log(`   ⚠️ Send button was not clickable.`);
      }
    } catch (err) {
      console.log(`   ❌ Error sending DM to ${t.name}: ${err.message}`);
    }
  }

  await context.close();
}

run();

// scripts/check-accepted-and-dm.mjs
// Checks all sent invitations for accepted connections and sends high-converting DMs

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
const leadsPath = path.join(rootDir, "data", "freelance-leads.json");

if (!fs.existsSync(userDataDir)) {
  console.error("❌ No saved LinkedIn session found.");
  process.exit(1);
}

const IS_HEADLESS = process.env.HEADLESS !== "false";

const PROFILES_TO_CHECK = [
  { name: "Deva Ram Patel", url: "https://www.linkedin.com/in/deva-ram-patel/", req: "Freelance Mobile App Developer (Multivendor / React Native / Flutter)" },
  { name: "Vishnu Vardhan", url: "https://www.linkedin.com/in/vishnu-vardhan-7b752837/", req: "ReactJS & Backend API Developer" },
  { name: "Indrani Mallick", url: "https://www.linkedin.com/in/indrani-mallick-788075396/", req: "IT Software Developer Roles @ Technology Next" },
  { name: "Sharma Sharma", url: "https://www.linkedin.com/in/sharma-sharma-bb7853343/", req: "Technical Developer Hiring @ Talent Arabia" },
  { name: "Gani Lakshmi", url: "https://www.linkedin.com/in/gani-lakshmi-9b69912b3/", req: "Technical Recruitment @ Lovas IT" },
  { name: "Roshni Dangara", url: "https://www.linkedin.com/in/roshni-dangara-207379264/", req: "React Native & React Developer @ Pulse Job" },
  { name: "Faizullah Faiz", url: "https://www.linkedin.com/in/faizullahfaiz/", req: "Part-time React Native Developer @ LOOY" },
  { name: "Riya Singh", url: "https://www.linkedin.com/in/riya-singh-795b19399/", req: "React Developer @ KaryaNest" },
  { name: "Urvashi Relwani", url: "https://www.linkedin.com/in/urvashi-relwani-abb684209/", req: "IT Developer @ GirnarSoft" },
  { name: "Anand Yadav", url: "https://www.linkedin.com/in/anand-yadav-469109244/", req: "Contract Remote Developer @ Jconnect" },
  { name: "Simarpreet Singh", url: "https://www.linkedin.com/in/simarpreet-sinngh/", req: "React Developer requirement" }
];

async function run() {
  console.log("=======================================================");
  console.log("🔍 Checking LinkedIn Connection Acceptance & Sending DMs");
  console.log(`🖥️ Mode: ${IS_HEADLESS ? "Headless (Background)" : "Headed (Visible)"}`);
  console.log("=======================================================\n");

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chrome",
    headless: IS_HEADLESS,
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  let history = fs.existsSync(historyPath) ? JSON.parse(fs.readFileSync(historyPath, "utf-8")) : [];
  const alreadyDMed = new Set(
    history
      .filter((h) => h.status === "SENT_DIRECT_MESSAGE")
      .map((h) => h.authorProfile.replace(/\/$/, ""))
  );

  const acceptedList = [];
  const pendingList = [];

  try {
    for (const target of PROFILES_TO_CHECK) {
      const cleanUrl = target.url.replace(/\/$/, "");
      console.log(`\n-------------------------------------------------------`);
      console.log(`👤 Checking connection status for: ${target.name}`);
      console.log(`🔗 Profile: ${target.url}`);

      await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 35000 });
      await page.waitForTimeout(3500);

      if (page.url().includes("/login")) {
        throw new Error("Session expired. Please run 'npm run login' again.");
      }

      // Check degree connection or buttons on profile
      const statusInfo = await page.evaluate(() => {
        const bodyText = document.body.innerText || "";
        const distEl = document.querySelector(".dist-value");
        const distText = distEl ? distEl.innerText : "";
        const isFirstDegree =
          bodyText.includes("· 1st") ||
          bodyText.includes("1st degree connection") ||
          distText.includes("1st");

        // Check for primary Message button
        const messageBtn = Array.from(document.querySelectorAll("button, a")).find((el) => {
          const aria = (el.getAttribute("aria-label") || "").toLowerCase();
          const text = (el.innerText || "").toLowerCase().trim();
          return (
            (text === "message" || aria.includes("message")) &&
            !aria.includes("lock") &&
            !aria.includes("inmail")
          );
        });

        // Check for Pending status
        const isPending =
          bodyText.includes("Pending") ||
          Array.from(document.querySelectorAll("button")).some(
            (b) => (b.innerText || "").trim().toLowerCase() === "pending"
          );

        return {
          isFirstDegree,
          hasDirectMessageBtn: !!messageBtn,
          isPending,
        };
      });

      console.log(`   Status: 1st Degree: ${statusInfo.isFirstDegree} | Message Button: ${statusInfo.hasDirectMessageBtn} | Pending: ${statusInfo.isPending}`);

      // If accepted (1st degree connection or has direct free Message button without lock)
      if ((statusInfo.isFirstDegree || statusInfo.hasDirectMessageBtn) && !statusInfo.isPending) {
        console.log(`   🎉 CONNECTED! ${target.name} has accepted the connection request!`);
        acceptedList.push(target);

        if (alreadyDMed.has(cleanUrl)) {
          console.log(`   ℹ️ Direct Message already sent previously to ${target.name}. Skipping duplicate DM.`);
          continue;
        }

        console.log(`   💌 Preparing direct pitch DM for ${target.name}...`);
        const firstName = target.name.split(" ")[0] || target.name;
        const dmText = `Hi ${firstName}, thanks for connecting!\n\nI came across your post regarding the ${target.req}.\n\nI am a Senior Mobile & Full-Stack Developer with 3+ years of production experience (React Native, React.js, Next.js, Node.js). Notably, I engineered KickScore (scaling to 100k+ active users with Hermes & WebSockets) and built enterprise native bridges for the TruVideo Automotive SDK.\n\nI am available immediately for contract/freelance engagements. Would love to know more about the project scope or schedule a brief 5-minute call whenever convenient!\n\nBest regards,\nGopal Bhagwat\nPortfolio: https://github.com/Bhagwat018`;

        // Click Message Button
        const clickedMessage = await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll("button, a")).find((el) => {
            const aria = (el.getAttribute("aria-label") || "").toLowerCase();
            const text = (el.innerText || "").toLowerCase().trim();
            return (
              (text === "message" || aria.includes("message")) &&
              !aria.includes("lock") &&
              !aria.includes("inmail")
            );
          });
          if (btn) {
            btn.click();
            return true;
          }
          return false;
        });

        if (clickedMessage) {
          await page.waitForTimeout(3000);

          // Type into messaging modal using DOM events to prevent viewport scroll blocks
          const typed = await page.evaluate((text) => {
            const box = document.querySelector("div.msg-form__contenteditable, div[role='textbox']");
            if (box) {
              box.focus();
              box.innerText = text;
              box.dispatchEvent(new Event("input", { bubbles: true }));
              return true;
            }
            return false;
          }, dmText);

          if (typed) {
            await page.waitForTimeout(1500);

            // Click Send using evaluate
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
              console.log(`   🚀 SUCCESS: DM sent to ${target.name}!`);

              const shotPath = path.join(rootDir, "logs", `${firstName.toLowerCase()}-dm-sent.png`);
              await page.screenshot({ path: shotPath });

              history.push({
                id: `dm-${Date.now()}`,
                authorName: target.name,
                authorProfile: target.url,
                email: null,
                status: "SENT_DIRECT_MESSAGE",
                method: "LINKEDIN_DM",
                pitchSent: dmText.slice(0, 160) + "...",
                contactedAt: new Date().toISOString(),
              });
              alreadyDMed.add(cleanUrl);
              fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), "utf-8");
            } else {
              console.log(`   ⚠️ Send button was not found or clickable.`);
            }
          } else {
            console.log(`   ⚠️ Message text area did not appear.`);
          }
        }
      } else {
        console.log(`   ⏳ Invitation still pending (or not yet accepted).`);
        pendingList.push(target);
      }
    }

    console.log(`\n=======================================================`);
    console.log(`📊 Acceptance Check Summary:`);
    console.log(`   - Connected (Accepted): ${acceptedList.length}`);
    console.log(`   - Still Pending Acceptance: ${pendingList.length}`);
    console.log(`=======================================================\n`);

  } catch (err) {
    console.error("❌ Error during check:", err);
  } finally {
    await context.close();
  }
}

run();

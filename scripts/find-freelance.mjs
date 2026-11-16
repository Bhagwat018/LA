#!/usr/bin/env node
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const userDataDir = path.join(rootDir, ".linkedin-session");
const profileConfigPath = path.join(rootDir, "config", "profile.json");
const dataDir = path.join(rootDir, "data");

if (!fs.existsSync(userDataDir)) {
  console.error("\n❌ Error: No saved LinkedIn session found!");
  console.error("Please run: npm run login first to connect your LinkedIn account.\n");
  process.exit(1);
}

const profile = fs.existsSync(profileConfigPath)
  ? JSON.parse(fs.readFileSync(profileConfigPath, "utf-8"))
  : { name: "Bhagwat" };

console.log("\n=======================================================");
console.log("💼 LinkedIn Autonomous Freelance & Contract Project Hunter");
console.log("🎯 Searching high-intent client & founder hiring posts");
console.log("=======================================================\n");

// High-intent search queries that founders and recruiters use when they have budget
const SEARCH_QUERIES = [
  "\"looking for react native developer\"",
  "\"hiring mobile developer\" freelance",
  "\"we are hiring\" \"freelance developer\"",
  "\"looking for freelance developer\"",
  "\"need a developer\" MVP",
  "\"looking for full stack developer\" freelance",
  "\"hiring contract developer\" remote",
  "\"need mobile app developer\" freelance"
];

async function runHunter() {
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chrome",
    headless: true, // Background mode
    viewport: { width: 1280, height: 950 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  try {
    console.log("⏳ Connecting to LinkedIn feed...");
    await page.goto("https://www.linkedin.com/feed/", {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForTimeout(3000);

    if (page.url().includes("/login")) {
      throw new Error("Session expired. Please run 'npm run login' again.");
    }
    console.log("✅ Authenticated to LinkedIn session successfully!");

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const verifiedLeads = [];
    const seenAuthors = new Set();

    for (const query of SEARCH_QUERIES) {
      console.log(`\n🔎 [Query] Scanning recent posts for: ${query}...`);
      // Search sorted by latest date posted (Past 24 hours / latest)
      const url = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(query)}&sortBy=%22date_posted%22`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(4000);

      // Scroll to trigger lazy loading of fresh posts
      for (let s = 0; s < 3; s++) {
        await page.mouse.wheel(0, 900);
        await page.waitForTimeout(1500);
      }

      // Expand all "...more" buttons so full email / contact details are visible
      try {
        const seeMoreBtns = await page.locator("main button:has-text('more'), main button:has-text('...more')").all();
        for (const btn of seeMoreBtns.slice(0, 8)) {
          if (await btn.isVisible()) {
            await btn.click().catch(() => {});
            await page.waitForTimeout(200);
          }
        }
      } catch {}

      // Extract cards using robust evaluation inside browser context
      const extractedPosts = await page.evaluate(() => {
        const authorLinks = Array.from(document.querySelectorAll("main a[href*='/in/']"));
        const results = [];
        const seenCards = new Set();

        for (const a of authorLinks) {
          // Find container of the post
          let card = a.closest("div.k4dayq") || a.closest("div.fie-impression-container") || a.closest("div[data-view-name]") || a.parentElement?.parentElement?.parentElement?.parentElement;
          if (!card || seenCards.has(card) || card.innerText.length < 60) continue;
          seenCards.add(card);

          const fullText = card.innerText || "";
          
          // Get author name & profile link
          const authorName = a.innerText.trim().split("\n")[0] || "Hiring Lead";
          const authorUrl = a.href || "";

          // Get headline
          const lines = fullText.split("\n").map(l => l.trim()).filter(Boolean);
          let headline = "";
          const authorIdx = lines.findIndex(l => l.includes(authorName));
          if (authorIdx !== -1 && lines[authorIdx + 1]) {
            headline = lines[authorIdx + 1];
          }

          results.push({
            authorName,
            authorUrl,
            authorHeadline: headline,
            fullText,
          });
        }
        return results;
      });

      console.log(`   Found ${extractedPosts.length} raw cards.`);

      for (const raw of extractedPosts) {
        if (!raw.authorName || seenAuthors.has(raw.authorName)) continue;

        const text = raw.fullText;

        // 1. Check if it is a HIRING post (not a job seeker)
        const isJobSeeker = /(open to work|#opentowork|looking for.*opportunit|seeking.*role|seeking.*opportunit|looking for a job|looking for internships|hire me|aspiring developer|my resume|my portfolio|excited to share that i)/i.test(text);
        const isHiring = /(we are hiring|i am hiring|hiring for|looking to hire|looking for (a |an )?(developer|engineer|coder|programmer|freelancer)|need (a |an )?(developer|engineer)|urgent requirement|developer needed|freelance requirement|contract position|reach out at|send cv to|send portfolio|send resume to|drop your cv|comment interested)/i.test(text);

        if (isHiring && !isJobSeeker) {
          seenAuthors.add(raw.authorName);

          // 2. Extract email if present
          const emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i);
          const email = emailMatch ? emailMatch[0] : null;

          // 3. Extract tech keywords
          const techStackFound = [];
          ["react", "node", "next.js", "typescript", "javascript", "python", "flutter", "react native", "android", "ios", "full stack", "frontend", "backend", "web", "mobile", "api", "mvp"].forEach(tech => {
            if (new RegExp(`\\b${tech}\\b`, "i").test(text)) {
              techStackFound.push(tech);
            }
          });

          // 4. Generate high-conversion tailored proposal
          const firstName = raw.authorName.split(" ")[0] || "there";
          const techMention = techStackFound.length > 0 ? techStackFound.slice(0, 3).join(", ") : "React Native & Full-Stack";
          
          const tailoredPitch = `Hi ${firstName}, I came across your post looking for a ${techMention} developer. I'm a Senior Mobile & Full-Stack Engineer with 3+ years experience delivering 4+ production apps across iOS, Android & Web. I'm available immediately on contract/milestone basis. Would love to share relevant live projects and discuss your scope!`;

          const lead = {
            id: `lead-${Date.now()}-${verifiedLeads.length + 1}`,
            query,
            authorName: raw.authorName,
            authorHeadline: raw.authorHeadline,
            authorProfile: raw.authorUrl,
            email,
            techStack: techStackFound,
            cleanExcerpt: text.replace(/\s+/g, " ").slice(0, 300),
            tailoredPitch,
            discoveredAt: new Date().toISOString(),
          };

          verifiedLeads.push(lead);
          console.log(`   🎯 [MATCH] ${lead.authorName} (${lead.authorHeadline || "Founder/Recruiter"})`);
          if (lead.email) console.log(`      📧 Email: ${lead.email}`);
          if (lead.techStack.length > 0) console.log(`      ⚡ Tech: ${lead.techStack.join(", ")}`);
        }
      }

      await page.waitForTimeout(3000);
    }

    // Save all verified leads to disk (merging with existing database without overwriting)
    const outJsonPath = path.join(dataDir, "freelance-leads.json");
    const existingLeads = fs.existsSync(outJsonPath)
      ? JSON.parse(fs.readFileSync(outJsonPath, "utf-8"))
      : [];

    const existingProfiles = new Set(existingLeads.map((l) => l.authorProfile));
    const newLeads = verifiedLeads.filter((l) => !existingProfiles.has(l.authorProfile));
    const allLeads = [...newLeads, ...existingLeads];

    fs.writeFileSync(outJsonPath, JSON.stringify(allLeads, null, 2), "utf-8");

    console.log("\n=======================================================");
    console.log(`🎉 SCAN COMPLETE: Found ${newLeads.length} NEW opportunities (Total Database: ${allLeads.length})!`);
    console.log(`📁 Saved to: ${outJsonPath}`);
    console.log("=======================================================\n");

    if (verifiedLeads.length > 0) {
      console.log("🔥 Top Immediate Outreach Targets:");
      verifiedLeads.slice(0, 5).forEach((lead, i) => {
        console.log(`\n-------------------------------------------------------`);
        console.log(`[#${i + 1}] ${lead.authorName} - ${lead.authorHeadline}`);
        console.log(`🔗 Profile: ${lead.authorProfile}`);
        if (lead.email) console.log(`📧 Direct Email: ${lead.email}`);
        console.log(`📝 Requirement: ${lead.cleanExcerpt.slice(0, 160)}...`);
        console.log(`💬 Tailored Pitch to Send:`);
        console.log(`"${lead.tailoredPitch}"`);
      });
      console.log(`-------------------------------------------------------\n`);
    }

    await context.close();
  } catch (err) {
    console.error("❌ Error running freelance hunter:", err.message);
    await context.close();
    process.exit(1);
  }
}

runHunter();

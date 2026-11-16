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
  console.error("Please run: npm run login first.\n");
  process.exit(1);
}

const profile = fs.existsSync(profileConfigPath)
  ? JSON.parse(fs.readFileSync(profileConfigPath, "utf-8"))
  : { name: "Bhagwat" };

console.log("\n=======================================================");
console.log("💼 LinkedIn Smart Job Hunter: Remote & Contract Jobs");
console.log("🎯 Targeting: Easy Apply | Remote | Past 24 Hours | Dev");
console.log("=======================================================\n");

const TARGET_JOB_TITLES = [
  "Full Stack Developer",
  "React Developer",
  "Node.js Developer",
  "Mobile App Developer",
  "Frontend Developer"
];

async function scanEasyApplyJobs() {
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chrome",
    headless: true, // background mode
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
    console.log("✅ Authenticated successfully!");

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const discoveredJobs = [];
    const seenJobIds = new Set();

    for (const title of TARGET_JOB_TITLES) {
      console.log(`\n🔎 [Job Search] Scanning for: "${title}" (Remote + Easy Apply)...`);
      
      // f_AL=true: Easy Apply, f_WT=2: Remote, f_TPR=r86400: Past 24 hours, sortBy=DD: Most recent
      const jobsUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(title)}&f_AL=true&f_WT=2&f_TPR=r86400&sortBy=DD`;
      
      await page.goto(jobsUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(4000);

      // Scroll job list container to trigger lazy loading
      const listContainer = page.locator(".jobs-search-results-list, div[data-view-name*='job']").first();
      if (await listContainer.count() > 0) {
        for (let i = 0; i < 4; i++) {
          await listContainer.evaluate((el) => el.scrollBy(0, 600));
          await page.waitForTimeout(1000);
        }
      }

      // Extract job cards
      const jobCards = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll("li.jobs-search-results__list-item, div.job-card-container, div.base-card"));
        const results = [];
        const seen = new Set();

        for (const item of items) {
          const titleLink = item.querySelector("a.job-card-list__title, a.base-card__full-link, a[href*='/jobs/view/']");
          if (!titleLink) continue;

          const jobTitle = titleLink.innerText.trim();
          const jobHref = titleLink.href || "";
          
          // Match Job ID
          const idMatch = jobHref.match(/view\/([0-9]+)/) || jobHref.match(/currentJobId=([0-9]+)/);
          const jobId = idMatch ? idMatch[1] : jobHref;

          if (seen.has(jobId)) continue;
          seen.add(jobId);

          const companyEl = item.querySelector(".job-card-container__primary-description, .base-card__subtitle, .artdeco-entity-lockup__subtitle");
          const company = companyEl ? companyEl.innerText.trim() : "Confidential Company";

          const locationEl = item.querySelector(".job-card-container__metadata-item, .job-search-card__location");
          const location = locationEl ? locationEl.innerText.trim() : "Remote";

          results.push({
            jobId,
            jobTitle,
            company,
            location,
            jobUrl: jobHref,
          });
        }
        return results;
      });

      console.log(`   Found ${jobCards.length} Easy Apply jobs.`);

      for (const card of jobCards) {
        if (seenJobIds.has(card.jobId)) continue;
        seenJobIds.add(card.jobId);

        // Generate tailored application pitch
        const tailoredNote = `Hello Hiring Team at ${card.company}, I am excited to apply for the ${card.jobTitle} position. With strong hands-on experience in full-stack web and mobile application engineering, I can build and ship reliable features from Day 1. Looking forward to discussing how I can add immediate value!`;

        const jobEntry = {
          ...card,
          searchQuery: title,
          tailoredNote,
          discoveredAt: new Date().toISOString(),
        };

        discoveredJobs.push(jobEntry);
        console.log(`   ⚡ [Job Available] ${card.jobTitle} @ ${card.company} (${card.location})`);
      }

      await page.waitForTimeout(3000);
    }

    // Save jobs to data/easy-apply-jobs.json
    const jobsOutPath = path.join(dataDir, "easy-apply-jobs.json");
    fs.writeFileSync(jobsOutPath, JSON.stringify(discoveredJobs, null, 2), "utf-8");

    console.log("\n=======================================================");
    console.log(`🎉 JOB SCAN COMPLETE: Found ${discoveredJobs.length} live Easy Apply remote positions!`);
    console.log(`📁 Saved to: ${jobsOutPath}`);
    console.log("=======================================================\n");

    if (discoveredJobs.length > 0) {
      console.log("🔥 Top Remote Opportunities for Immediate Application:");
      discoveredJobs.slice(0, 5).forEach((j, i) => {
        console.log(`\n[#${i + 1}] ${j.jobTitle}`);
        console.log(`   Company: ${j.company} | ${j.location}`);
        console.log(`   Apply Link: ${j.jobUrl}`);
      });
      console.log(`\n-------------------------------------------------------\n`);
    }

    await context.close();
  } catch (err) {
    console.error("❌ Job hunter error:", err.message);
    await context.close();
    process.exit(1);
  }
}

scanEasyApplyJobs();

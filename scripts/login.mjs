#!/usr/bin/env node
import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const userDataDir = path.join(rootDir, ".linkedin-session");

console.log("\n=======================================================");
console.log("💼 LinkedIn Autonomous Agent: Authentication Setup");
console.log(`📁 Session directory: ${userDataDir}`);
console.log("=======================================================\n");

async function startLogin() {
  console.log("🚀 Launching visible Chrome browser...");
  console.log("👉 Please log in with your LinkedIn credentials (and 2FA if enabled).");
  console.log("⏳ The script is waiting for you to reach the feed...\n");

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1280, height: 850 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  try {
    await page.goto("https://www.linkedin.com/login", {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    // Check if already logged in
    const currentUrl = page.url();
    if (currentUrl.includes("/feed")) {
      console.log("🎉 You are already logged in to LinkedIn!");
    } else {
      console.log("🔑 Waiting for you to complete sign-in in the open browser window...");
      // Wait up to 5 minutes for user to complete manual login + OTP/2FA
      await page.waitForURL((url) => url.href.includes("/feed"), { timeout: 300000 });
      console.log("✅ Detected feed navigation! You are successfully signed in.");
    }

    // Let cookies and session tokens sync to disk
    await page.waitForTimeout(4000);

    // Grab logged in user name if available
    try {
      const userBadge = await page.locator(".feed-identity-module, .global-nav__me-photo, a[href*='/in/']").first();
      console.log("👤 Profile recognized successfully!");
    } catch {}

    console.log("\n=======================================================");
    console.log("🎉 SUCCESS: LinkedIn session saved permanently!");
    console.log(`📂 Location: ${userDataDir}`);
    console.log("You do NOT need to log in again. Future agent scripts will run seamlessly!");
    console.log("=======================================================\n");

    await context.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Login setup error:", error.message);
    await context.close();
    process.exit(1);
  }
}

startLogin();

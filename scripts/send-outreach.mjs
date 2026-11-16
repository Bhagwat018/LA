#!/usr/bin/env node
import "dotenv/config";
import { chromium } from "playwright";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const userDataDir = path.join(rootDir, ".linkedin-session");
const leadsPath = path.join(rootDir, "data", "freelance-leads.json");
const historyPath = path.join(rootDir, "data", "outreach-history.json");
const profilePath = path.join(rootDir, "config", "profile.json");

if (!fs.existsSync(userDataDir)) {
  console.error("❌ No saved session found. Run npm run login first.");
  process.exit(1);
}

if (!fs.existsSync(leadsPath)) {
  console.error("❌ No leads found. Run npm run find:freelance first.");
  process.exit(1);
}

const leads = JSON.parse(fs.readFileSync(leadsPath, "utf-8"));
const history = fs.existsSync(historyPath)
  ? JSON.parse(fs.readFileSync(historyPath, "utf-8"))
  : [];
const profile = fs.existsSync(profilePath)
  ? JSON.parse(fs.readFileSync(profilePath, "utf-8"))
  : { name: "Bhagwat" };

const contactedProfiles = new Set(
  history.filter((h) => h.method && h.method.startsWith("LINKEDIN")).map((h) => h.authorProfile)
);
const contactedEmails = new Set(
  history.filter((h) => h.method === "EMAIL" && h.status === "EMAIL_SENT").map((h) => h.email)
);

const MAX_OUTREACH_PER_RUN = parseInt(process.env.MAX_OUTREACH_PER_RUN || "5", 10);
const MAX_EMAILS_PER_RUN = parseInt(process.env.MAX_EMAILS_PER_RUN || "5", 10);
const IS_HEADLESS = process.env.HEADLESS !== "false";

console.log("\n=======================================================");
console.log("💌 LinkedIn Automated Outreach & Client Messenger");
console.log(`📋 Total Discovered Leads: ${leads.length}`);
console.log(`🔒 Already Contacted Profiles: ${contactedProfiles.size} | Emails Contacted: ${contactedEmails.size}`);
console.log(`🎯 Max Outreach Target This Run: ${MAX_OUTREACH_PER_RUN}`);
console.log(`🖥️ Browser Mode: ${IS_HEADLESS ? "Headless (Silent Background)" : "Headed (Visible GUI)"}`);
console.log("=======================================================\n");

// Helper: Setup email transporter if SMTP credentials are provided
function getEmailTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SERVICE } = process.env;
  if (!SMTP_USER || !SMTP_PASS) {
    return null;
  }

  if (SMTP_SERVICE === "gmail") {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
  }

  return nodemailer.createTransport({
    host: SMTP_HOST || "smtp.gmail.com",
    port: parseInt(SMTP_PORT || "587", 10),
    secure: SMTP_PORT === "465",
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

async function sendEmailPitch(transporter, lead) {
  const firstName = lead.authorName.split(" ")[0] || "there";
  const techStackStr = lead.techStack && lead.techStack.length > 0
    ? lead.techStack.slice(0, 3).join(", ")
    : "Full-Stack Web & Mobile";

  const mailOptions = {
    from: process.env.FROM_EMAIL || process.env.SMTP_USER,
    to: lead.email,
    subject: `Freelance / Contract Developer for your ${techStackStr} requirement - ${profile.name}`,
    text: `Hi ${firstName},

I noticed your recent post on LinkedIn regarding your ${techStackStr} requirement.

I am a Full-Stack Web & Mobile Developer with 3+ years of experience delivering robust production apps, MVPs, and scalable cloud solutions (React, Next.js, Node.js, TypeScript, React Native).

What I bring to the table:
• Fast turnaround & high code quality for MVPs and feature sprints
• Clean UI/UX, responsive designs, and secure API/backend architectures
• Immediate availability on milestone or contract basis

GitHub & Portfolio: https://github.com/Bhagwat018

If you are open to a brief conversation, I'd love to learn more about the scope and discuss how I can help bring this to life.

Best regards,
${profile.name}
Full-Stack Developer | AI & Mobile Specialist`,
  };

  await transporter.sendMail(mailOptions);
}

async function runOutreach() {
  const emailTransporter = getEmailTransporter();
  let emailsSentCount = 0;

  // ----------------------------------------------------
  // Stage 1: Send Cold Emails to Leads with Direct Emails
  // ----------------------------------------------------
  if (emailTransporter) {
    console.log("📧 SMTP Configured: Checking for verified client emails to pitch...");
    for (const lead of leads) {
      if (emailsSentCount >= MAX_EMAILS_PER_RUN) break;
      if (lead.email && !contactedEmails.has(lead.email)) {
        try {
          console.log(`📤 Sending direct email pitch to: ${lead.email} (${lead.authorName})...`);
          await sendEmailPitch(emailTransporter, lead);
          console.log(`   ✅ Email sent successfully to ${lead.email}!`);
          emailsSentCount++;
          contactedEmails.add(lead.email);

          history.push({
            id: lead.id,
            authorName: lead.authorName,
            authorProfile: lead.authorProfile,
            email: lead.email,
            status: "EMAIL_SENT",
            method: "EMAIL",
            pitchSent: `Direct email sent for ${lead.techStack?.join(", ") || "Web/Mobile"} role`,
            contactedAt: new Date().toISOString(),
          });
          fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), "utf-8");

          // Brief pause between emails to maintain good reputation
          await new Promise((r) => setTimeout(r, 2500));
        } catch (emailErr) {
          console.error(`   ⚠️ Failed to email ${lead.email}:`, emailErr.message);
        }
      }
    }
    console.log(`📊 Stage 1 Complete: Sent ${emailsSentCount} email pitches.\n`);
  } else {
    console.log("ℹ️ Note: SMTP email credentials not configured in .env.");
    console.log("   (To enable auto-emailing to recruiter emails, copy .env.example to .env and add SMTP details)\n");
  }

  // ----------------------------------------------------
  // Stage 2: Send LinkedIn DMs / Connection Notes
  // ----------------------------------------------------
  const pendingLeads = leads.filter(
    (l) => l.authorProfile && !contactedProfiles.has(l.authorProfile)
  ).slice(0, MAX_OUTREACH_PER_RUN);

  if (pendingLeads.length === 0) {
    console.log("✨ All current lead profiles have already been contacted on LinkedIn!");
    console.log("Run 'npm run find:freelance' to fetch new fresh posts.");
    return;
  }

  console.log(`🚀 Stage 2: Initiating LinkedIn outreach to ${pendingLeads.length} profiles...`);

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
    for (let i = 0; i < pendingLeads.length; i++) {
      const lead = pendingLeads[i];
      console.log(`\n-------------------------------------------------------`);
      console.log(`👉 [${i + 1}/${pendingLeads.length}] Contacting: ${lead.authorName}`);
      console.log(`🔗 Profile: ${lead.authorProfile}`);

      await page.goto(lead.authorProfile, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      await page.waitForTimeout(4000);

      // Check session
      if (page.url().includes("/login")) {
        throw new Error("Session expired. Please run 'npm run login' again.");
      }

      let outreachStatus = "SKIPPED";
      let outreachMethod = "LINKEDIN";

      // Prepare crisp note text (LinkedIn strictly caps notes at 300 characters)
      const firstName = lead.authorName.split(" ")[0] || "there";
      const techKeyword = lead.techStack && lead.techStack.length > 0 ? lead.techStack[0] : "web/app";
      let noteText = `Hi ${firstName}, saw your post looking for a ${techKeyword} developer. I build fast, scalable MVPs & apps with React, Node & Mobile. Available immediately on contract/milestone. Would love to connect and discuss!`;
      if (noteText.length > 295) {
        noteText = noteText.slice(0, 292) + "...";
      }

      // Check for Direct Message button (1st degree connection)
      const directMessageBtn = page.locator("button.artdeco-button--primary:has-text('Message'), div.entry-point button:has-text('Message')").first();
      // Check for Connect button
      const directConnectBtn = page.locator("button:has-text('Connect'), button[aria-label*='Invite'][aria-label*='to connect']").first();
      const moreBtn = page.locator("button:has-text('More'), button[aria-label*='More actions']").first();

      let actionTaken = false;

      // Case A: Can connect directly
      if (await directConnectBtn.count() > 0 && await directConnectBtn.isVisible()) {
        console.log("👉 Found 'Connect' button. Clicking...");
        await directConnectBtn.click();
        await page.waitForTimeout(1500);

        const addNoteBtn = page.locator("button:has-text('Add a note'), button[aria-label*='Add a note']").first();
        if (await addNoteBtn.count() > 0 && await addNoteBtn.isVisible()) {
          console.log("📝 Adding personalized pitch note...");
          await addNoteBtn.click();
          await page.waitForTimeout(1000);

          const textarea = page.locator("textarea[name='message'], textarea#custom-message").first();
          await textarea.click();
          await page.keyboard.type(noteText, { delay: 20 });
          await page.waitForTimeout(1000);

          const sendBtn = page.locator("button:has-text('Send'), button[aria-label*='Send invitation']").first();
          await sendBtn.click();
          outreachStatus = "SENT_CONNECTION_NOTE";
          outreachMethod = "LINKEDIN_NOTE";
          actionTaken = true;
          console.log("✅ Personalized connection invitation sent successfully!");
        } else {
          const sendWithoutNoteBtn = page.locator("button:has-text('Send without a note')").first();
          if (await sendWithoutNoteBtn.count() > 0) {
            await sendWithoutNoteBtn.click();
            outreachStatus = "SENT_CONNECT_NO_NOTE";
            outreachMethod = "LINKEDIN_CONNECT";
            actionTaken = true;
            console.log("✅ Sent connection request without note.");
          }
        }
      }

      // Case B: Connect hidden in "More" menu
      if (!actionTaken && await moreBtn.count() > 0 && await moreBtn.isVisible()) {
        console.log("👉 Checking 'More' dropdown for Connect option...");
        await moreBtn.click();
        await page.waitForTimeout(1000);

        const moreConnectItem = page.locator("div.artdeco-dropdown__content span:has-text('Connect'), div[role='menu'] span:has-text('Connect')").first();
        if (await moreConnectItem.count() > 0) {
          await moreConnectItem.click();
          await page.waitForTimeout(1500);

          const addNoteBtn = page.locator("button:has-text('Add a note')").first();
          if (await addNoteBtn.count() > 0) {
            await addNoteBtn.click();
            await page.waitForTimeout(1000);

            const textarea = page.locator("textarea[name='message'], textarea#custom-message").first();
            await textarea.click();
            await page.keyboard.type(noteText, { delay: 20 });
            await page.waitForTimeout(1000);

            const sendBtn = page.locator("button:has-text('Send')").first();
            await sendBtn.click();
            outreachStatus = "SENT_CONNECTION_NOTE";
            outreachMethod = "LINKEDIN_NOTE";
            actionTaken = true;
            console.log("✅ Personalized connection invitation sent from More menu!");
          }
        }
      }

      // Case C: Direct message available
      if (!actionTaken && await directMessageBtn.count() > 0 && await directMessageBtn.isVisible()) {
        console.log("💬 1st Degree Connection / InMail available. Sending direct message...");
        await directMessageBtn.click();
        await page.waitForTimeout(2000);

        const msgBox = page.locator("div.msg-form__contenteditable[contenteditable='true'], div[role='textbox']").first();
        if (await msgBox.count() > 0) {
          await msgBox.click();
          await page.keyboard.type(lead.tailoredPitch || noteText, { delay: 20 });
          await page.waitForTimeout(1000);

          const sendMsgBtn = page.locator("button.msg-form__send-button").first();
          if (await sendMsgBtn.count() > 0 && await sendMsgBtn.isEnabled()) {
            await sendMsgBtn.click();
            outreachStatus = "SENT_DIRECT_MESSAGE";
            outreachMethod = "LINKEDIN_DM";
            actionTaken = true;
            console.log("✅ Direct message sent successfully!");
          }
        }
      }

      if (!actionTaken) {
        console.log("ℹ️ No eligible Connect or Message button available on this profile.");
        outreachStatus = "PROFILE_LOCKED_OR_FOLLOW_ONLY";
      }

      // Record to history
      history.push({
        id: lead.id,
        authorName: lead.authorName,
        authorProfile: lead.authorProfile,
        email: lead.email,
        status: outreachStatus,
        method: outreachMethod,
        pitchSent: noteText,
        contactedAt: new Date().toISOString(),
      });

      fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), "utf-8");

      // Humanized safety pause (6-12 seconds)
      const randomPause = Math.floor(Math.random() * 6000) + 6000;
      console.log(`⏳ Human safety pause: ${(randomPause / 1000).toFixed(1)}s before next candidate...`);
      await page.waitForTimeout(randomPause);
    }

    console.log("\n=======================================================");
    console.log(`🎉 Batch outreach finished! Logged to: ${historyPath}`);
    console.log("=======================================================\n");

    await context.close();
  } catch (err) {
    console.error("❌ Outreach execution error:", err.message);
    await context.close();
    process.exit(1);
  }
}

runOutreach();

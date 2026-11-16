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
  : { name: "Gopal Bhagwat" };

const contactedProfiles = new Set(
  history
    .filter((h) => h.method && h.method.startsWith("LINKEDIN") && h.status && !h.status.startsWith("FAILED"))
    .map((h) => h.authorProfile)
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
    : "React Native & Full-Stack";

  const mailOptions = {
    from: process.env.FROM_EMAIL || process.env.SMTP_USER,
    to: lead.email,
    subject: `Senior React Native & Full-Stack Engineer for your ${techStackStr} role - Gopal Bhagwat`,
    text: `Hi ${firstName},

I came across your post on LinkedIn looking for a ${techStackStr} developer.

I'm a Mobile & Full-Stack Engineer with 3+ years of experience delivering 4+ production apps across iOS, Android, and Web (React Native, React.js, Next.js, TypeScript, Kotlin, Java).

Key Highlights from my background:
• Delivered 4 production apps on App Store & Google Play (including KickScore for 100K+ users)
• TruVideo Automotive SDK: Turbo Modules, native bridging (Kotlin/Swift), and real-time streaming
• In-App Purchases (StoreKit/Google Play), offline-first SQLite architectures, and AWS IVS / Agora SDK
• Published open-source React Native NPM packages (react-native-responsive-layout-kit)
• Recipient of Code Commander Award 2025

GitHub & Portfolio: https://github.com/Bhagwat018
Contact: +91 6267957589 | gopalbhagwat21@gmail.com

I am available immediately on a milestone or contract basis. If you're open to a brief chat, I'd love to learn more about your scope and share relevant live app demos.

Best regards,
Gopal Bhagwat
Senior Mobile & Full-Stack Engineer`,
  };

  await transporter.sendMail(mailOptions);
}

const emailRulesPath = path.join(rootDir, "config", "email-rules.json");
const emailRules = fs.existsSync(emailRulesPath)
  ? JSON.parse(fs.readFileSync(emailRulesPath, "utf-8"))
  : null;

function validateFreelanceEmailIntent(lead) {
  if (!lead.email) return { ok: false, reason: "NO_EMAIL" };

  const emailLower = lead.email.toLowerCase();

  // Rule 1: Anti-Spam Blacklist (Never email generic support/info/noreply)
  if (emailRules?.validationRules?.blacklistedEmailPrefixes) {
    const isBlacklisted = emailRules.validationRules.blacklistedEmailPrefixes.some(
      (prefix) => emailLower.startsWith(`${prefix}@`) || emailLower.startsWith(`${prefix}.`)
    );
    if (isBlacklisted) {
      return { ok: false, reason: `BLOCKED_BLACKLISTED_PREFIX: ${lead.email}` };
    }
  }

  const text = (lead.cleanExcerpt || "").toLowerCase();

  // Rule 2: Exclude Job Seekers / Non-Hiring
  const isJobSeeker = /(open to work|#opentowork|seeking.*opportunit|looking for a job|my resume|graduated)/i.test(text);
  if (isJobSeeker) {
    return { ok: false, reason: "BLOCKED_JOB_SEEKER_POST" };
  }

  // Rule 3: Must Have Explicit Freelance / Contract Hiring Signals
  const hasFreelanceSignals = /(freelance|contract|contractor|remote|project|hiring|looking for|need a developer|developer needed|urgent requirement|send cv|send portfolio|send resume|reach out at)/i.test(text);
  if (!hasFreelanceSignals) {
    return { ok: false, reason: "BLOCKED_NO_EXPLICIT_FREELANCE_INTENT" };
  }

  return { ok: true, reason: "VERIFIED_FREELANCE_HIRING_POST" };
}

async function runOutreach() {
  const emailTransporter = getEmailTransporter();
  let emailsSentCount = 0;

  // ----------------------------------------------------
  // Stage 1: Send Cold Emails to Leads with Direct Emails
  // STRICT FREELANCE / CONTRACT HIRING ONLY
  // ----------------------------------------------------
  if (emailTransporter) {
    console.log("🛡️ Checking leads against Strict Freelancing Email Safety Rules...");
    for (const lead of leads) {
      if (emailsSentCount >= MAX_EMAILS_PER_RUN) break;
      if (lead.email && !contactedEmails.has(lead.email)) {
        const validation = validateFreelanceEmailIntent(lead);

        if (!validation.ok) {
          console.log(`🛡️ [Safety Guardrail] Skipped ${lead.email}: ${validation.reason}`);
          continue;
        }

        try {
          console.log(`🎯 [Verified Freelance Lead] Sending proposal to: ${lead.email} (${lead.authorName})...`);
          await sendEmailPitch(emailTransporter, lead);
          console.log(`   ✅ Proposal email sent successfully to ${lead.email}!`);
          emailsSentCount++;
          contactedEmails.add(lead.email);

          history.push({
            id: lead.id,
            authorName: lead.authorName,
            authorProfile: lead.authorProfile,
            email: lead.email,
            status: "EMAIL_SENT",
            method: "EMAIL",
            pitchSent: `Direct proposal email sent for ${lead.techStack?.join(", ") || "Mobile/Web"} freelance requirement`,
            contactedAt: new Date().toISOString(),
          });
          fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), "utf-8");

          // Random pause between emails (4-8 seconds) for high deliverability
          const emailPause = Math.floor(Math.random() * 4000) + 4000;
          console.log(`⏳ Safety pause: ${(emailPause / 1000).toFixed(1)}s before next email...`);
          await new Promise((r) => setTimeout(r, emailPause));
        } catch (emailErr) {
          console.error(`   ⚠️ Failed to email ${lead.email}:`, emailErr.message);
        }
      }
    }
    console.log(`📊 Stage 1 Complete: Sent ${emailsSentCount} verified freelance proposal emails.\n`);
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

      try {
        await page.goto(lead.authorProfile, {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        });
        await page.waitForTimeout(4000);

        if (page.url().includes("/login")) {
          throw new Error("Session expired. Please run 'npm run login' again.");
        }

        let outreachStatus = "SKIPPED";
        let outreachMethod = "LINKEDIN";

        const firstName = lead.authorName.split(" ")[0] || "there";
        const techKeyword = lead.techStack && lead.techStack.length > 0 ? lead.techStack[0] : "Mobile/React Native";
        let noteText = `Hi ${firstName}, saw your post for a ${techKeyword} developer. I'm a Senior Mobile & Full-Stack Engineer (3+ yrs, 4 production apps, React Native/Web/iOS/Android). Available immediately on contract/milestone. Would love to connect and share live apps!`;
        if (noteText.length > 295) {
          noteText = noteText.slice(0, 292) + "...";
        }

        const directConnectBtn = page.locator("button:has-text('Connect'), button[aria-label*='Invite'][aria-label*='to connect']").first();
        const moreBtn = page.locator("button:has-text('More'), button[aria-label*='More actions']").first();
        const directMessageBtn = page.locator("button.artdeco-button--primary:has-text('Message')").first();

        let actionTaken = false;
        let connectClicked = false;

        // Step 1: Look for Direct Connect button
        if (await directConnectBtn.count() > 0 && await directConnectBtn.isVisible({ timeout: 2500 })) {
          console.log("👉 Found 'Connect' button. Clicking...");
          await directConnectBtn.click({ timeout: 5000 });
          connectClicked = true;
          await page.waitForTimeout(2000);
        } else if (await moreBtn.count() > 0 && await moreBtn.isVisible({ timeout: 2500 })) {
          // Step 2: Check inside 'More' dropdown
          console.log("👉 Checking 'More' dropdown for Connect option...");
          await moreBtn.click();
          await page.waitForTimeout(1000);

          const moreConnectItem = page.locator(
            "div.artdeco-dropdown__content span:has-text('Connect'), div[role='menu'] span:has-text('Connect'), div[role='menuitem']:has-text('Connect'), div.artdeco-dropdown__item:has-text('Connect')"
          ).first();

          if (await moreConnectItem.count() > 0 && await moreConnectItem.isVisible({ timeout: 2000 })) {
            console.log("👉 Found Connect inside 'More' menu. Clicking...");
            await moreConnectItem.click();
            connectClicked = true;
            await page.waitForTimeout(2000);
          }
        }

        // Step 3: Handle the Connect modal (Add a note or send)
        if (connectClicked) {
          const addNoteBtn = page.locator("button:has-text('Add a note'), button[aria-label*='Add a note']").first();
          if (await addNoteBtn.count() > 0 && await addNoteBtn.isVisible({ timeout: 3000 })) {
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
            const sendWithoutNoteBtn = page.locator(
              "button:has-text('Send without a note'), button[aria-label*='Send without a note'], button.artdeco-modal button:has-text('Send')"
            ).first();
            if (await sendWithoutNoteBtn.count() > 0 && await sendWithoutNoteBtn.isVisible()) {
              await sendWithoutNoteBtn.click();
              outreachStatus = "SENT_CONNECT_NO_NOTE";
              outreachMethod = "LINKEDIN_CONNECT";
              actionTaken = true;
              console.log("✅ Sent connection request directly.");
            }
          }
        }

        // Step 4: If not connected or connect not available, check Direct Message
        if (!actionTaken && await directMessageBtn.count() > 0 && await directMessageBtn.isVisible({ timeout: 2500 })) {
          console.log("💬 1st Degree Connection detected. Checking message box...");
          try {
            await directMessageBtn.click({ timeout: 5000 });
            await page.waitForTimeout(2000);

            const msgBox = page.locator("div.msg-form__contenteditable[contenteditable='true']").first();
            if (await msgBox.count() > 0 && await msgBox.isVisible({ timeout: 3000 })) {
              await msgBox.click({ force: true });
              await page.keyboard.type(lead.tailoredPitch || noteText, { delay: 20 });
              await page.waitForTimeout(1000);

              const sendMsgBtn = page.locator("button.msg-form__send-button").first();
              if (await sendMsgBtn.count() > 0 && await sendMsgBtn.isEnabled()) {
                await sendMsgBtn.click({ force: true });
                outreachStatus = "SENT_DIRECT_MESSAGE";
                outreachMethod = "LINKEDIN_DM";
                actionTaken = true;
                console.log("✅ Direct message sent successfully!");
              }
            }
          } catch (e) {
            console.log("ℹ️ Direct message box not accessible:", e.message);
          }
        }

        if (!actionTaken) {
          console.log("ℹ️ Profile already connected, follow-only, or connection not accessible.");
          outreachStatus = "PROFILE_FOLLOW_ONLY_OR_CONNECTED";
        }

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

        const randomPause = Math.floor(Math.random() * 5000) + 5000;
        console.log(`⏳ Human safety pause: ${(randomPause / 1000).toFixed(1)}s before next candidate...`);
        await page.waitForTimeout(randomPause);
      } catch (leadError) {
        console.error(`⚠️ Error handling candidate ${lead.authorName}:`, leadError.message);
        history.push({
          id: lead.id,
          authorName: lead.authorName,
          authorProfile: lead.authorProfile,
          email: lead.email,
          status: "FAILED_RETRY_LATER",
          method: "LINKEDIN",
          pitchSent: "",
          error: leadError.message,
          contactedAt: new Date().toISOString(),
        });
        fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), "utf-8");
      }
    }

    console.log("\n=======================================================");
    console.log(`🎉 Batch outreach finished! Logged to: ${historyPath}`);
    console.log("=======================================================");

    await context.close();
  } catch (err) {
    console.error("❌ Outreach execution error:", err.message);
    await context.close();
  }
}

runOutreach();

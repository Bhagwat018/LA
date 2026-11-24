#!/usr/bin/env node
import "dotenv/config";
import { chromium } from "playwright";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateAIPitch } from "./ai-pitch-generator.mjs";

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
    .filter(
      (h) =>
        h.method &&
        h.method.startsWith("LINKEDIN") &&
        (h.status === "SENT_CONNECTION_NOTE" ||
          h.status === "SENT_DIRECT_MESSAGE" ||
          h.status === "SENT_CONNECT_NO_NOTE" ||
          h.status === "INVITATION_PENDING")
    )
    .map((h) => h.authorProfile)
);
const contactedEmails = new Set(
  history.filter((h) => h.method === "EMAIL" && h.status === "EMAIL_SENT").map((h) => h.email)
);

const MAX_OUTREACH_PER_RUN = parseInt(process.env.MAX_OUTREACH_PER_RUN || "10", 10);
const MAX_EMAILS_PER_RUN = parseInt(process.env.MAX_EMAILS_PER_RUN || "10", 10);
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
  // Understand the client's requirement deeply and craft matching proposal with Gemini
  const aiPitch = await generateAIPitch(lead);
  console.log(`   🧠 [Gemini Requirement Analysis]: ${aiPitch.clientNeedSummary}`);
  console.log(`   🎯 [Selected Resume Match]: ${aiPitch.selectedProjectProof}`);

  const mailOptions = {
    from: process.env.FROM_EMAIL || process.env.SMTP_USER,
    to: lead.email,
    subject: aiPitch.emailSubject,
    text: aiPitch.emailBody,
  };

  await transporter.sendMail(mailOptions);
  return aiPitch;
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
        let actionTaken = false;

        // Analyze requirement and generate AI tailored pitch
        const firstName = (lead.authorName || "there").split(" ")[0];
        const techKeyword = (lead.techStack && lead.techStack[0]) || "mobile";
        let noteText = lead.linkedInNote;
        if (!noteText) {
          try {
            const aiPitch = await generateAIPitch(lead);
            noteText = aiPitch.linkedInNote;
          } catch {}
        }
        if (!noteText) {
          noteText = `Hi ${firstName}, saw your post for a ${techKeyword} developer. I am a Sr Mobile Engineer (3+ yrs, 4 apps, 100k+ users). Available immediately on contract. Let's connect!`;
        }
        if (noteText.length > 190) {
          noteText = noteText.slice(0, 187) + "...";
        }

        // Check if connection invitation is already pending
        const pendingBtn = page.locator("main section button:has-text('Pending'), main button:has-text('Pending'), button[aria-label*='Pending']").first();
        if (await pendingBtn.count() > 0 && await pendingBtn.isVisible({ timeout: 1500 })) {
          console.log(`ℹ️ Connection request to ${lead.authorName} is already Pending.`);
          outreachStatus = "INVITATION_PENDING";
          outreachMethod = "LINKEDIN_NOTE";
          actionTaken = true;
        }

        // Step 1: Follow-First Strategy (if person has Follow enabled)
        if (!actionTaken) {
          const heroCard = page.locator("main section").first();
          const followBtn = heroCard.locator("button:has-text('Follow'), button[aria-label*='Follow']").first();
          if (await followBtn.count() > 0 && await followBtn.isVisible({ timeout: 2000 })) {
            const btnText = (await followBtn.innerText()).trim();
            if (btnText.includes("Follow") && !btnText.includes("Following")) {
              console.log(`👉 [Follow-First Rule] Profile has 'Follow' enabled. Following ${lead.authorName} first...`);
              try {
                await followBtn.click({ timeout: 4000 });
                await page.waitForTimeout(2000);
                console.log(`   ✅ Followed ${lead.authorName}!`);
              } catch (e) {
                console.log("   ℹ️ Follow click skipped:", e.message);
              }
            }
          }
        }

        // Step 2: Look for Connect button (inside heroCard direct OR inside hero More dropdown)
        let connectClicked = false;

        if (!actionTaken) {
          // 1. Try evaluate click on direct Connect button or anchor (bypasses inert/overlay)
          const directClicked = await page.evaluate(() => {
            const el = document.querySelector("a[aria-label*='to connect'], button[aria-label*='to connect'], a[href*='custom-invit']");
            if (el) {
              el.click();
              return true;
            }
            return false;
          });

          if (directClicked) {
            console.log("👉 Found direct 'Connect' option. Clicked successfully.");
            connectClicked = true;
            await page.waitForTimeout(2000);
          } else {
            // 2. Try hero More button dropdown
            const heroCard = page.locator("main section").first();
            const heroMoreBtn = heroCard.locator("button[aria-label='More'], button[aria-label*='More actions']").first();

            if (await heroMoreBtn.count() > 0 && await heroMoreBtn.isVisible({ timeout: 2000 })) {
              console.log("👉 Opening hero 'More' menu to access Connect option...");
              await heroMoreBtn.click();
              await page.waitForTimeout(1500);

              const moreConnectItem = page.locator(
                "div[role='menu'] span:has-text('Connect'), div.artdeco-dropdown__content span:has-text('Connect'), div[role='menu'] div:has-text('Connect')"
              ).first();

              if (await moreConnectItem.count() > 0 && await moreConnectItem.isVisible({ timeout: 2500 })) {
                console.log("👉 Found Connect in 'More' menu. Clicking...");
                await moreConnectItem.click();
                connectClicked = true;
                await page.waitForTimeout(2000);
              }
            }
          }
        }

        // Step 3: Handle the Invitation Note modal
        if (connectClicked) {
          // Check if "How do you know" modal appears
          const otherOption = page.locator("button:has-text('Other'), div:has-text('We know each other')").first();
          if (await otherOption.count() > 0 && await otherOption.isVisible({ timeout: 1500 })) {
            await otherOption.click().catch(() => {});
            const connectSubBtn = page.locator("button:has-text('Connect')").first();
            if (await connectSubBtn.isVisible()) await connectSubBtn.click().catch(() => {});
            await page.waitForTimeout(1500);
          }

          const addNoteBtn = page.locator("button:has-text('Add a note'), button[aria-label*='Add a note']").first();
          if (await addNoteBtn.count() > 0 && await addNoteBtn.isVisible({ timeout: 2500 })) {
            console.log("📝 Adding personalized pitch note (limit <= 190 chars)...");
            await addNoteBtn.click();
            await page.waitForTimeout(1000);

            const textarea = page.locator("textarea[name='message'], textarea#custom-message, textarea").first();
            await textarea.click();
            await textarea.fill(noteText);
            await page.waitForTimeout(1000);

            const sendBtn = page.locator("button:has-text('Send'), button[aria-label*='Send invitation'], button[aria-label*='Send now']").first();
            if (await sendBtn.isEnabled()) {
              await sendBtn.click();
              await page.waitForTimeout(2500);
              outreachStatus = "SENT_CONNECTION_NOTE";
              outreachMethod = "LINKEDIN_NOTE";
              actionTaken = true;
              console.log("✅ Personalized connection invitation note sent successfully!");
            } else {
              console.log("⚠️ Send button with note disabled (e.g. note limit reached). Attempting Send without note...");
              const cancelBtn = page.locator("button:has-text('Cancel')").first();
              if (await cancelBtn.isVisible()) await cancelBtn.click().catch(() => {});
              await page.waitForTimeout(1000);
            }
          }

          // If note wasn't sent, fallback to Send without note (unlimited connection channel)
          if (!actionTaken) {
            const sendWithoutNoteBtn = page.locator(
              "button:has-text('Send without a note'), button[aria-label*='Send without a note'], button.artdeco-modal button:has-text('Send')"
            ).first();
            if (await sendWithoutNoteBtn.count() > 0 && await sendWithoutNoteBtn.isVisible({ timeout: 2000 })) {
              await sendWithoutNoteBtn.click();
              await page.waitForTimeout(2500);
              outreachStatus = "SENT_CONNECT_NO_NOTE";
              outreachMethod = "LINKEDIN_CONNECT";
              actionTaken = true;
              console.log("✅ Sent connection request directly (unlimited connection channel).");
            }
          }

          // Capture proof screenshot
          if (actionTaken) {
            try {
              const logsDir = path.join(rootDir, "logs");
              if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
              await page.screenshot({ path: path.join(logsDir, `connect-sent-${lead.id}.png`) });
            } catch {}
          }
        }

        // Step 4: If not connected yet, try Direct Message link/button
        if (!actionTaken) {
          const msgElement = page.locator("main section a[href*='messaging/compose'], main section button:has-text('Message'), main button:has-text('Message')").first();
          if (await msgElement.count() > 0 && await msgElement.isVisible({ timeout: 2000 })) {
            console.log("💬 Checking Message option...");
            try {
              await msgElement.click({ timeout: 4000 });
              await page.waitForTimeout(2000);

              const msgBox = page.locator("div.msg-form__contenteditable[contenteditable='true']").first();
              if (await msgBox.count() > 0 && await msgBox.isVisible({ timeout: 3000 })) {
                await msgBox.click({ force: true });
                await page.keyboard.type(lead.tailoredPitch || noteText, { delay: 20 });
                await page.waitForTimeout(1000);

                const sendMsgBtn = page.locator("button.msg-form__send-button").first();
                if (await sendMsgBtn.count() > 0 && await sendMsgBtn.isEnabled()) {
                  await sendMsgBtn.click({ force: true });
                  await page.waitForTimeout(2500);
                  outreachStatus = "SENT_DIRECT_MESSAGE";
                  outreachMethod = "LINKEDIN_DM";
                  actionTaken = true;
                  console.log("✅ Direct message sent successfully!");
                }
              }
            } catch (e) {
              console.log("ℹ️ Message box not interactive:", e.message);
            }
          }
        }

        if (!actionTaken) {
          console.log("ℹ️ Profile already connected, follow-only, or connection not accessible.");
          outreachStatus = "PROFILE_FOLLOW_ONLY_OR_CONNECTED";
        }

        const existingIdx = history.findIndex((h) => h.id === lead.id && h.method && h.method.startsWith("LINKEDIN"));
        const outreachRecord = {
          id: lead.id,
          authorName: lead.authorName,
          authorProfile: lead.authorProfile,
          email: lead.email,
          status: outreachStatus,
          method: outreachMethod,
          pitchSent: noteText,
          contactedAt: new Date().toISOString(),
        };

        if (existingIdx !== -1) {
          history[existingIdx] = outreachRecord;
        } else {
          history.push(outreachRecord);
        }
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

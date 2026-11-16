#!/usr/bin/env node
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");

console.log("\n=======================================================");
console.log("⏰ LinkedIn Daily Autonomous Freelance & Outreach Pipeline");
console.log(`📅 Execution Time: ${new Date().toLocaleString()}`);
console.log("=======================================================\n");

// Stage 1: Scan recent live posts for freelance/contract projects
console.log("🚀 [Stage 1/3] Scanning live LinkedIn posts for client requirements...");
const huntResult = spawnSync("node", [path.join(rootDir, "scripts", "find-freelance.mjs")], {
  stdio: "inherit",
  cwd: rootDir,
});

if (huntResult.status !== 0) {
  console.error("⚠️ Warning: Post scanning completed with non-zero exit code.");
}

// Stage 2: Send targeted DMs, Connection Notes & Emails to clients
console.log("\n💌 [Stage 2/3] Initiating personalized client outreach (Email + LinkedIn)...");
const outreachResult = spawnSync("node", [path.join(rootDir, "scripts", "send-outreach.mjs")], {
  stdio: "inherit",
  cwd: rootDir,
});

if (outreachResult.status !== 0) {
  console.error("⚠️ Warning: Outreach stage completed with non-zero exit code.");
}

// Stage 3: Check LinkedIn Messaging for Client Responses
console.log("\n📬 [Stage 3/3] Checking LinkedIn messaging for replies & client messages...");
const inboxResult = spawnSync("node", [path.join(rootDir, "scripts", "check-inbox.mjs")], {
  stdio: "inherit",
  cwd: rootDir,
});

if (inboxResult.status !== 0) {
  console.error("⚠️ Warning: Inbox check completed with non-zero exit code.");
}

// Stage 4: Generate Daily Summary Report
const leadsFile = path.join(dataDir, "freelance-leads.json");
const historyFile = path.join(dataDir, "outreach-history.json");
const repliesFile = path.join(dataDir, "inbox-replies.json");

const leads = fs.existsSync(leadsFile) ? JSON.parse(fs.readFileSync(leadsFile, "utf-8")) : [];
const history = fs.existsSync(historyFile) ? JSON.parse(fs.readFileSync(historyFile, "utf-8")) : [];
const replies = fs.existsSync(repliesFile) ? JSON.parse(fs.readFileSync(repliesFile, "utf-8")) : [];

const today = new Date().toISOString().split("T")[0];
const todayHistory = history.filter((h) => h.contactedAt && h.contactedAt.startsWith(today));
const unreadReplies = replies.filter((r) => r.isUnread);

const summaryReport = `
# 📊 LinkedIn Daily Freelance Pipeline Report (${today})

- **Total Active Leads in Database**: ${leads.length}
- **Outreach Sent Today**: ${todayHistory.length}
- **Cumulative Prospects Contacted**: ${history.length}
- **Unread Client Responses Waiting**: ${unreadReplies.length}

## 🎯 Contacts Reached Today:
${
  todayHistory.length === 0
    ? "_No new outreach sent today._"
    : todayHistory
        .map(
          (h, i) => `
${i + 1}. **${h.authorName}** (\`${h.method}\`)
   - Profile: ${h.authorProfile}
   - Email: ${h.email || "N/A"}
   - Status: \`${h.status}\`
   - Pitch: "${h.pitchSent}"
`
        )
        .join("\n")
}

## 💬 Incoming Client Messages / Responses:
${
  unreadReplies.length === 0
    ? "_No unread incoming messages._"
    : unreadReplies
        .map(
          (r, i) => `
${i + 1}. **${r.senderName}** (${r.timestamp})
   - Message: "${r.snippet}"
   - Action: Check https://www.linkedin.com/messaging/ to finalize terms!
`
        )
        .join("\n")
}
`.trim();

const reportPath = path.join(dataDir, `daily-report-${today}.md`);
fs.writeFileSync(reportPath, summaryReport, "utf-8");

console.log("\n=======================================================");
console.log(`🎉 FULL PIPELINE COMPLETED SUCCESSFULLY!`);
console.log(`📄 Daily Report Saved: ${reportPath}`);
console.log("=======================================================\n");

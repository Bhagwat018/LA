// mnc-engine/scripts/mnc-daily-pipeline.mjs
// Daily MNC & High-Paying Product Career Pipeline Coordinator & Markdown Report Generator

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runMncHunter } from "./mnc-hunter.mjs";
import { runMatchScorer } from "./mnc-match-scorer.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCORED_JOBS_FILE = path.join(__dirname, "../data/mnc-scored-jobs.json");
const MASTER_DB_FILE = path.join(__dirname, "../data/mnc-jobs.json");

/**
 * Get current date string in IST
 */
function getIstDateStr() {
  const d = new Date();
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 3600000 * 5.5);
  const yyyy = ist.getFullYear();
  const mm = String(ist.getMonth() + 1).padStart(2, "0");
  const dd = String(ist.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Generate Markdown Dashboard
 */
function generateMarkdownReport(dateStr, jobs) {
  const superMatches = jobs.filter((j) => j.matchScore >= 90);
  const highMatches = jobs.filter((j) => j.matchScore >= 80 && j.matchScore < 90);
  const strongMatches = jobs.filter((j) => j.matchScore < 80);

  const bangaloreCount = jobs.filter((j) => /bangalore|bengaluru/i.test(j.location)).length;
  const puneCount = jobs.filter((j) => /pune/i.test(j.location)).length;
  const hyderabadCount = jobs.filter((j) => /hyderabad/i.test(j.location)).length;
  const remoteCount = jobs.filter((j) => /remote|virtual/i.test(j.location)).length;

  let md = `# 🏢 High-Paying MNC & Product Tech Career Radar (${dateStr})\n\n`;

  md += `## 📊 Executive Pipeline Summary\n`;
  md += `- 🎯 **Candidate**: **Gopal Bhagwat** (Senior Mobile & Full-Stack Developer: 3+ yrs exp)\n`;
  md += `- 💼 **Core Tech Focus**: \`React Native\`, \`React.js\`, \`Next.js\`, \`Node.js\`, \`TypeScript\`, \`Full-Stack\`, \`SDE-2\`\n`;
  md += `- 💰 **Compensation Floor**: **Min ₹7–8 LPA outside Indore** (Target Bracket: **₹9 LPA – ₹42 LPA**)\n`;
  md += `- 📍 **Location Breakdown**:\n`;
  md += `  - 🏙️ **Bangalore Hub**: ${bangaloreCount} verified matches\n`;
  md += `  - 🏙️ **Pune Hub**: ${puneCount} verified matches\n`;
  md += `  - 🏙️ **Hyderabad Hub**: ${hyderabadCount} verified matches\n`;
  md += `  - 🌐 **Remote (Pan-India)**: ${remoteCount} verified matches\n`;
  md += `- 🚀 **Total High-Match Opportunities Discovered**: **${jobs.length}**\n\n`;
  md += `---\n\n`;

  // Super Matches
  md += `## 🌟 1. Top Super Matches (90%+ Fit — Full-Stack & SDE-2)\n\n`;
  if (superMatches.length === 0) {
    md += `*No 90%+ super matches detected in today's harvest.*\n\n`;
  } else {
    superMatches.forEach((j, idx) => {
      md += `### ${idx + 1}. **${j.title}** — *${j.company}*\n`;
      md += `- 🏢 **Employer**: ${j.company} (${j.category})\n`;
      md += `- 📍 **Location**: ${j.location} — **${j.hubBadge}**\n`;
      md += `- 💰 **Estimated Package**: **${j.estSalary}**\n`;
      md += `- 🎯 **Match Score**: **${j.matchScore}% Super Fit**\n`;
      md += `- 💼 **Experience Target**: ${j.expMatch}\n`;
      md += `- 🚀 **Direct Official Apply Link**: [👉 Apply on Official ${j.company} Career Portal](${j.directApplyUrl})\n`;
      md += `- 📝 **Why You Fit**:\n`;
      j.whyFit.forEach((w) => {
        md += `  - ${w}\n`;
      });
      md += `- ⚡ **1-Click Copy Cover Pitch**:\n`;
      md += `  > *"${j.quickPitch}"*\n`;
      md += `- 🔘 **Action Tracker**: [ ] Mark as Applied (Target Date: ${dateStr})\n\n`;
    });
  }

  md += `---\n\n`;

  // High Matches
  md += `## 🚀 2. High Match Roles (80% – 89% Fit — Software Engineering)\n\n`;
  if (highMatches.length === 0) {
    md += `*No 80-89% matches in today's scan.*\n\n`;
  } else {
    highMatches.forEach((j, idx) => {
      md += `### ${idx + 1}. **${j.title}** — *${j.company}*\n`;
      md += `- 🏢 **Employer**: ${j.company} (${j.category})\n`;
      md += `- 📍 **Location**: ${j.location} (${j.hubBadge})\n`;
      md += `- 💰 **Estimated Package**: **${j.estSalary}**\n`;
      md += `- 🎯 **Match Score**: **${j.matchScore}% High Fit**\n`;
      md += `- 🚀 **Direct Official Apply Link**: [👉 Apply on Official ${j.company} Portal](${j.directApplyUrl})\n`;
      md += `- 📝 **Key Highlights**: ${j.whyFit[0] || "Fits Gopal's verified production profile."}\n`;
      md += `- 🔘 **Action Tracker**: [ ] Mark as Applied\n\n`;
    });
  }

  md += `---\n\n`;

  // Cloud & Systems Roles
  md += `## 💡 3. Platform & Distributed Systems Roles (70% – 79% Fit)\n\n`;
  strongMatches.slice(0, 15).forEach((j, idx) => {
    md += `| ${idx + 1} | **${j.title}** | ${j.company} | ${j.location} | **${j.estSalary}** | [Direct Apply Link](${j.directApplyUrl}) | [ ] Applied |\n`;
  });
  if (strongMatches.length > 0) {
    md = md.replace(
      /## 💡 3. Platform & Distributed Systems Roles \(70% – 79% Fit\)\n\n/,
      `## 💡 3. Platform & Distributed Systems Roles (70% – 79% Fit)\n\n| # | Role Title | Company | Location | Est. Package | Direct Apply Link | Status |\n|---|---|---|---|---|---|---|\n`
    );
  }

  md += `\n---\n\n`;
  md += `## 📌 Instructions for 1-Click Application:\n`;
  md += `1. Review the **Top Super Matches** above.\n`;
  md += `2. Click the direct official link to open the company's application page.\n`;
  md += `3. Copy the pre-generated **1-Click Cover Pitch** snippet into the "Cover Letter" or "Why are you interested" box.\n`;
  md += `4. Mark the checkbox \`[x]\` in this document to record your application progress.\n`;

  return md;
}

/**
 * Main Daily Pipeline Runner
 */
export async function runMncDailyPipeline(options = {}) {
  const dateStr = getIstDateStr();
  console.log(`===============================================================`);
  console.log(`🚀 Starting Daily MNC & Product Tech Career Pipeline [${dateStr}]`);
  console.log(`===============================================================`);

  // Step 1: Harvest raw jobs if fresh flag passed or no raw cache
  const rawFile = path.join(__dirname, "../data/mnc-raw-jobs.json");
  if (!fs.existsSync(rawFile) || options.fresh) {
    console.log(`\n📡 Harvesting fresh postings from 15+ MNC & Tech Hub Portals...`);
    await runMncHunter();
  } else {
    console.log(`\n⚡ Using existing cached harvest (use --fresh to re-harvest from live APIs).`);
  }

  // Step 2: Match, filter & score
  console.log(`\n🎯 Running Profile Matcher & Package Guardrails...`);
  const qualifiedJobs = runMatchScorer();

  // Step 3: Update master database
  let masterDb = [];
  if (fs.existsSync(MASTER_DB_FILE)) {
    try {
      masterDb = JSON.parse(fs.readFileSync(MASTER_DB_FILE, "utf-8"));
    } catch {}
  }

  const existingIds = new Set(masterDb.map((j) => j.id));
  let newAdded = 0;
  for (const job of qualifiedJobs) {
    if (!existingIds.has(job.id)) {
      masterDb.push({
        ...job,
        applied: false,
        appliedDate: null,
        firstDiscoveredDate: dateStr
      });
      existingIds.add(job.id);
      newAdded++;
    }
  }

  fs.writeFileSync(MASTER_DB_FILE, JSON.stringify(masterDb, null, 2));
  console.log(`💾 Master DB updated with ${newAdded} new unique opportunities (Total: ${masterDb.length}).`);

  // Step 4: Generate daily markdown report
  const reportMd = generateMarkdownReport(dateStr, qualifiedJobs);

  // Write to both root data/ and mnc-engine/data/
  const rootReportPath = path.join(__dirname, `../../data/daily-report-mnc-${dateStr}.md`);
  const isolatedReportPath = path.join(__dirname, `../data/daily-report-mnc-${dateStr}.md`);

  fs.writeFileSync(rootReportPath, reportMd, "utf-8");
  fs.writeFileSync(isolatedReportPath, reportMd, "utf-8");

  console.log(`\n📄 Daily Report Generated Successfully:`);
  console.log(`   - Root: ${rootReportPath}`);
  console.log(`   - Isolated: ${isolatedReportPath}`);

  // Step 5: Export live jobs data for the GitHub Pages web portal
  const docsDir = path.join(__dirname, "../../docs");
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }
  const webDataJsPath = path.join(docsDir, "jobs-data.js");
  const webDataJsonPath = path.join(docsDir, "jobs.json");
  const jsPayload = `// Auto-generated live jobs feed - ${dateStr}\nwindow.MNC_JOBS_DATA = ${JSON.stringify(qualifiedJobs, null, 2)};\n`;
  fs.writeFileSync(webDataJsPath, jsPayload, "utf-8");
  fs.writeFileSync(webDataJsonPath, JSON.stringify(qualifiedJobs, null, 2), "utf-8");
  console.log(`🌐 Web Portal Data Updated: ${webDataJsPath}`);

  return {
    dateStr,
    totalJobs: qualifiedJobs.length,
    rootReportPath,
    webDataJsPath
  };
}

// Allow direct CLI invocation
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const isFresh = process.argv.includes("--fresh");
  runMncDailyPipeline({ fresh: isFresh })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Pipeline Error:", err);
      process.exit(1);
    });
}

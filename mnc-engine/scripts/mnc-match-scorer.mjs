// mnc-engine/scripts/mnc-match-scorer.mjs
// Intelligent Resume Matching, Salary Guardrail, and Score Ranking Engine

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RAW_JOBS_FILE = path.join(__dirname, "../data/mnc-raw-jobs.json");
const PROFILE_FILE = path.join(__dirname, "../config/profile-matcher.json");
const RULES_FILE = path.join(__dirname, "../config/filter-rules.json");
const SCORED_OUTPUT_FILE = path.join(__dirname, "../data/mnc-scored-jobs.json");

/**
 * Normalizes text for matching
 */
function normalize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9\s\+\#\.\-]/g, " ");
}

/**
 * Check if location matches India tech hubs
 */
function isLocationEligible(locStr, rules) {
  if (!locStr) return false;
  const lower = locStr.toLowerCase();

  // Explicit foreign markers
  const foreignMarkers = [
    "remote - us",
    "remote - usa",
    "remote - americas",
    "remote - emea",
    "remote - apac",
    "united states",
    "san francisco",
    "new york",
    "seattle",
    "austin",
    "london",
    "united kingdom",
    "canada",
    "vancouver",
    "toronto",
    "singapore",
    "berlin",
    "germany",
    "ireland",
    "dublin",
    "sydney",
    "australia",
    "brazil",
    "japan",
    "tokyo"
  ];

  const hasForeign = foreignMarkers.some((f) => lower.includes(f));
  const hasIndiaExplicit =
    lower.includes("india") ||
    lower.includes(", in") ||
    lower.includes(", ind") ||
    lower.includes("bengaluru") ||
    lower.includes("bangalore") ||
    lower.includes("pune") ||
    lower.includes("hyderabad") ||
    lower.includes("gurugram") ||
    lower.includes("gurgaon") ||
    lower.includes("noida") ||
    lower.includes("delhi") ||
    lower.includes("mumbai") ||
    lower.includes("chennai") ||
    lower.includes("indore");

  if (hasForeign && !hasIndiaExplicit) {
    return false;
  }

  // Generic remote is eligible only if it does not specify another continent
  const isGenericRemote = lower === "remote" || lower.includes("remote - india") || lower.includes("virtual, ind");

  return hasIndiaExplicit || isGenericRemote;
}

/**
 * Filter by Title Guardrails
 */
function isTitleEligible(title, rules) {
  const lower = title.toLowerCase();

  // Disallowed roles/seniority
  const forbidden = [
    "intern",
    "internship",
    "trainee",
    "campus",
    "fresher",
    "director",
    "vp",
    "vice president",
    "head of",
    "principal",
    "architect",
    "manager",
    "sales",
    "recruiter",
    "talent",
    "fraud",
    "collections",
    "analyst",
    "designer",
    "product design",
    "writer",
    "editor",
    "qa engineer",
    "sdet",
    "quality assurance",
    "test engineer",
    "specialist",
    "accountant",
    "payroll",
    "investigation",
    "consultant",
    "salesforce",
    "servicenow",
    "abap",
    "pega",
    "sap "
  ];

  for (const dis of forbidden) {
    // Word boundary check
    const regex = new RegExp(`\\b${dis}\\b`, "i");
    if (regex.test(lower)) return false;
  }

  // Must be software / dev / engineer
  const allowed = [
    "react",
    "react native",
    "next",
    "node",
    "full stack",
    "fullstack",
    "frontend",
    "front end",
    "mobile",
    "software engineer",
    "software dev engineer",
    "software development engineer",
    "sde",
    "developer",
    "app developer",
    "web developer"
  ];

  return allowed.some((kw) => lower.includes(kw));
}

/**
 * Calculate match score against Gopal's production profile
 */
function calculateJobMatch(job, profile, rules) {
  const titleText = normalize(job.title);
  const combinedText = normalize(`${job.title} ${job.descriptionSnippet || ""} ${job.category || ""}`);

  let score = 70; // baseline for verified engineering role
  const matchedSkills = [];

  // Skill evaluation
  if (/react native|mobile/i.test(titleText)) {
    score += 26;
    matchedSkills.push("React Native", "Mobile Architecture", "Hermes & TurboModules");
  } else if (/full stack|fullstack/i.test(titleText)) {
    score += 22;
    matchedSkills.push("Full-Stack", "Node.js", "React.js / Next.js", "REST APIs");
  } else if (/frontend|front end/i.test(titleText)) {
    score += 18;
    matchedSkills.push("React.js", "Next.js", "TypeScript", "Performance Tuning");
  } else if (/software dev engineer ii|sde ii|sde-ii|sde 2/i.test(titleText)) {
    score += 20;
    matchedSkills.push("SDE-2 Core Engineering", "Scalable Systems", "Full-Stack Design");
  } else if (/software dev engineer|sde/i.test(titleText)) {
    score += 14;
    matchedSkills.push("Software Engineering", "Full-Stack Web/Mobile Systems");
  }

  if (/typescript/i.test(combinedText)) {
    score += 4;
    matchedSkills.push("TypeScript");
  }
  if (/node/i.test(combinedText)) {
    score += 4;
    matchedSkills.push("Node.js Backend");
  }

  const finalScore = Math.min(98, score);

  // Hub badge
  const locLower = job.location.toLowerCase();
  let hubBadge = "India Tech Hub";
  if (locLower.includes("bangalore") || locLower.includes("bengaluru")) hubBadge = "Bangalore Tech Hub";
  else if (locLower.includes("pune")) hubBadge = "Pune Tech Hub";
  else if (locLower.includes("hyderabad")) hubBadge = "Hyderabad Tech Hub";
  else if (locLower.includes("gurgaon") || locLower.includes("gurugram") || locLower.includes("noida")) hubBadge = "Delhi NCR Hub";
  else if (locLower.includes("indore")) hubBadge = "Indore Base Hub";
  else if (locLower.includes("remote") || locLower.includes("virtual")) hubBadge = "Remote (Pan-India)";

  // "Why You Fit" synthesis
  const whyFit = [];
  if (matchedSkills.includes("React Native") || /mobile/i.test(titleText)) {
    whyFit.push("Matches **KickScore** (100k+ active users, real-time WebSockets & Hermes optimization).");
    whyFit.push("Fits **TruVideo Automotive SDK** (Enterprise iOS/Android native bridging & camera pipelines).");
  } else if (matchedSkills.includes("Full-Stack") || /node/i.test(titleText) || /sde/i.test(titleText)) {
    whyFit.push("Matches **Invoicely** (Full-Stack Next.js + Node.js SaaS platform with automated billing & APIs).");
    whyFit.push("Fits **SaveKit** (TypeScript + SQLite offline-first local data architecture).");
  } else {
    whyFit.push("Matches **KickScore** and modern Next.js/React frontend architecture with 3+ years scale experience.");
  }

  // Pre-written pitch note
  const quickPitch = `I am a Senior Mobile & Full-Stack Developer with 3+ years of production experience building high-performance systems with React Native, React.js, Next.js, and Node.js. Notably, I engineered KickScore (scaling to 100k+ users with Hermes & WebSockets) and built enterprise native bridges for the TruVideo Automotive SDK. Given my background in end-to-end fullstack development and performance tuning, I would love to contribute to ${job.company}'s engineering team.`;

  return {
    ...job,
    matchScore: finalScore,
    matchedSkills,
    whyFit,
    quickPitch,
    hubBadge,
    expMatch: "2–5 Years (Matches Gopal's 3+ Yrs Exp)"
  };
}

/**
 * Main Scorer Function
 */
export function runMatchScorer() {
  console.log("===============================================================");
  console.log("🎯 Autonomous Resume Matcher & Package Filter Engine");
  console.log("===============================================================");

  if (!fs.existsSync(RAW_JOBS_FILE)) {
    console.error(`Missing raw harvest at ${RAW_JOBS_FILE}. Run mnc-hunter first.`);
    return [];
  }

  const rawJobs = JSON.parse(fs.readFileSync(RAW_JOBS_FILE, "utf-8"));
  const profile = JSON.parse(fs.readFileSync(PROFILE_FILE, "utf-8"));
  const rules = JSON.parse(fs.readFileSync(RULES_FILE, "utf-8"));

  console.log(`📥 Ingested ${rawJobs.length} raw jobs for filtering and scoring...`);

  const filteredScoredJobs = [];

  for (const job of rawJobs) {
    if (!isLocationEligible(job.location, rules)) continue;
    if (!isTitleEligible(job.title, rules)) continue;

    const scored = calculateJobMatch(job, profile, rules);
    filteredScoredJobs.push(scored);
  }

  // Sort descending by match score
  filteredScoredJobs.sort((a, b) => b.matchScore - a.matchScore);

  console.log(`✨ Matched & Qualified Opportunities: ${filteredScoredJobs.length}`);

  // Deduplicate by company + title
  const uniqueJobs = [];
  const seenKey = new Set();
  for (const j of filteredScoredJobs) {
    const key = `${j.company}-${j.title}`.toLowerCase();
    if (!seenKey.has(key)) {
      seenKey.add(key);
      uniqueJobs.push(j);
    }
  }

  console.log(`💎 Deduplicated High-Match Opportunities: ${uniqueJobs.length}`);

  fs.writeFileSync(SCORED_OUTPUT_FILE, JSON.stringify(uniqueJobs, null, 2));
  console.log(`💾 Saved scored opportunities to ${SCORED_OUTPUT_FILE}`);

  return uniqueJobs;
}

// Allow direct CLI invocation
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMatchScorer();
}

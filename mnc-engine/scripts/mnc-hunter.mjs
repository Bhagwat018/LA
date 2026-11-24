// mnc-engine/scripts/mnc-hunter.mjs
// Sourcing Engine for Top MNCs & High-Paying Tech Firms in Bangalore, Pune, & Pan-India

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveDirectApplyUrl } from "./mnc-url-resolver.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORTALS_FILE = path.join(__dirname, "../config/mnc-portals.json");
const RULES_FILE = path.join(__dirname, "../config/filter-rules.json");
const RAW_OUTPUT_FILE = path.join(__dirname, "../data/mnc-raw-jobs.json");

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Fetch with timeout helper
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  return fetch(url, {
    ...options,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/plain, */*",
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(timeoutMs)
  });
}

/**
 * Greenhouse connector
 */
async function huntGreenhouse(portal) {
  const jobs = [];
  try {
    const res = await fetchWithTimeout(portal.apiUrl);
    if (!res.ok) {
      console.log(`  ⚠️  [${portal.company}] HTTP ${res.status}`);
      return jobs;
    }
    const data = await res.json();
    const rawList = data.jobs || [];

    for (const j of rawList) {
      const loc = j.location?.name || "";
      jobs.push({
        id: `${portal.id}-${j.id}`,
        company: portal.company,
        category: portal.category,
        ats: portal.ats,
        sourcePortal: portal.id,
        title: j.title ? j.title.trim() : "",
        location: loc,
        directApplyUrl: j.absolute_url || "",
        descriptionSnippet: j.content ? j.content.slice(0, 300) : "",
        postedAt: j.updated_at || new Date().toISOString(),
        discoveredAt: new Date().toISOString(),
        estSalary: portal.defaultEstSalary || "₹12 - ₹24 LPA"
      });
    }
    console.log(`  ✅ [${portal.company}] Fetched ${jobs.length} total postings via Greenhouse.`);
  } catch (err) {
    console.log(`  ❌ [${portal.company}] Greenhouse error: ${err.message}`);
  }
  return jobs;
}

/**
 * Lever connector
 */
async function huntLever(portal) {
  const jobs = [];
  try {
    const res = await fetchWithTimeout(portal.apiUrl);
    if (!res.ok) {
      console.log(`  ⚠️  [${portal.company}] HTTP ${res.status}`);
      return jobs;
    }
    const data = await res.json();
    if (!Array.isArray(data)) return jobs;

    for (const j of data) {
      const loc = j.categories?.location || "";
      const directUrl = j.applyUrl || j.hostedUrl || "";
      jobs.push({
        id: `${portal.id}-${j.id}`,
        company: portal.company,
        category: portal.category,
        ats: portal.ats,
        sourcePortal: portal.id,
        title: j.text ? j.text.trim() : "",
        location: loc,
        directApplyUrl: directUrl,
        descriptionSnippet: j.descriptionPlain ? j.descriptionPlain.slice(0, 300) : "",
        postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : new Date().toISOString(),
        discoveredAt: new Date().toISOString(),
        estSalary: portal.defaultEstSalary || "₹14 - ₹28 LPA"
      });
    }
    console.log(`  ✅ [${portal.company}] Fetched ${jobs.length} postings via Lever.`);
  } catch (err) {
    console.log(`  ❌ [${portal.company}] Lever error: ${err.message}`);
  }
  return jobs;
}

/**
 * SmartRecruiters connector
 */
async function huntSmartRecruiters(portal) {
  const jobs = [];
  try {
    const res = await fetchWithTimeout(portal.apiUrl);
    if (!res.ok) {
      console.log(`  ⚠️  [${portal.company}] HTTP ${res.status}`);
      return jobs;
    }
    const data = await res.json();
    const rawList = data.content || [];

    for (const j of rawList) {
      const city = j.location?.city || "";
      const region = j.location?.region || "";
      const country = j.location?.country || "";
      const loc = [city, region, country].filter(Boolean).join(", ");
      const directUrl = `https://jobs.smartrecruiters.com/${portal.token}/${j.id}`;

      jobs.push({
        id: `${portal.id}-${j.id}`,
        company: portal.company,
        category: portal.category,
        ats: portal.ats,
        sourcePortal: portal.id,
        title: j.name ? j.name.trim() : "",
        location: loc,
        directApplyUrl: directUrl,
        descriptionSnippet: "",
        postedAt: j.releasedDate || new Date().toISOString(),
        discoveredAt: new Date().toISOString(),
        estSalary: portal.defaultEstSalary || "₹10 - ₹20 LPA"
      });
    }
    console.log(`  ✅ [${portal.company}] Fetched ${jobs.length} postings via SmartRecruiters.`);
  } catch (err) {
    console.log(`  ❌ [${portal.company}] SmartRecruiters error: ${err.message}`);
  }
  return jobs;
}

/**
 * Amazon Jobs connector
 */
async function huntAmazon(portal) {
  const jobs = [];
  const searchQueries = ["React", "React Native", "Full Stack", "Frontend", "Node.js"];
  const seenIds = new Set();

  for (const q of searchQueries) {
    try {
      const url = `https://www.amazon.jobs/en/search.json?base_query=${encodeURIComponent(q)}&country=IND&result_type=jobs&count=25`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;
      const data = await res.json();
      const hits = data.jobs || [];

      for (const j of hits) {
        if (seenIds.has(j.id_icims)) continue;
        seenIds.add(j.id_icims);

        const loc = [j.city, j.country_code].filter(Boolean).join(", ");
        const directUrl = `https://www.amazon.jobs/en/jobs/${j.id_icims}`;

        jobs.push({
          id: `${portal.id}-${j.id_icims}`,
          company: portal.company,
          category: portal.category,
          ats: portal.ats,
          sourcePortal: portal.id,
          title: j.title ? j.title.trim() : "",
          location: loc,
          directApplyUrl: directUrl,
          descriptionSnippet: j.description ? j.description.slice(0, 300) : "",
          postedAt: j.posted_date || new Date().toISOString(),
          discoveredAt: new Date().toISOString(),
          estSalary: portal.defaultEstSalary || "₹18 - ₹40 LPA"
        });
      }
    } catch (err) {
      console.log(`  ⚠️  [Amazon] Query "${q}" error: ${err.message}`);
    }
  }

  console.log(`  ✅ [Amazon] Fetched ${jobs.length} relevant India tech jobs.`);
  return jobs;
}

/**
 * Main Hunt Coordinator
 */
export async function runMncHunter() {
  console.log("===============================================================");
  console.log("🏢 Autonomous MNC & High-Paying Tech Sourcing Engine");
  console.log("===============================================================");

  if (!fs.existsSync(PORTALS_FILE)) {
    console.error(`Missing portals configuration at ${PORTALS_FILE}`);
    return [];
  }

  const portalsData = JSON.parse(fs.readFileSync(PORTALS_FILE, "utf-8"));
  const portals = portalsData.portals || [];
  console.log(`🎯 Loaded ${portals.length} active enterprise & product portal connectors.`);

  const allDiscovered = [];

  for (const portal of portals) {
    console.log(`\n🔍 Scanning ${portal.company} (${portal.category})...`);
    let portalJobs = [];

    switch (portal.ats) {
      case "greenhouse":
        portalJobs = await huntGreenhouse(portal);
        break;
      case "lever":
        portalJobs = await huntLever(portal);
        break;
      case "smartrecruiters":
        portalJobs = await huntSmartRecruiters(portal);
        break;
      case "amazon":
        portalJobs = await huntAmazon(portal);
        break;
      default:
        console.log(`  ℹ️  Unhandled ATS type: ${portal.ats}`);
    }

    // Resolve and sanitize direct apply links
    for (const job of portalJobs) {
      job.directApplyUrl = await resolveDirectApplyUrl(job.directApplyUrl);
      allDiscovered.push(job);
    }
  }

  console.log(`\n🎉 Total Raw Postings Harvested: ${allDiscovered.length}`);

  // Write raw data
  const dataDir = path.dirname(RAW_OUTPUT_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(RAW_OUTPUT_FILE, JSON.stringify(allDiscovered, null, 2));
  console.log(`💾 Saved raw harvest to ${RAW_OUTPUT_FILE}`);

  return allDiscovered;
}

// Allow direct CLI invocation
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMncHunter()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Fatal Hunter Error:", err);
      process.exit(1);
    });
}

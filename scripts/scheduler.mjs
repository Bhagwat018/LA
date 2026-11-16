#!/usr/bin/env node
import cron from "node-cron";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const logsDir = path.join(rootDir, "logs");

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

console.log("\n=======================================================");
console.log("⏰ LinkedIn Autonomous Growth Daemon Scheduler Active");
console.log("=======================================================");
console.log("Active Operating Window (After 12:00 PM & Before 8:00 PM):");
console.log("  🌤️  Afternoon Peak Slot:  01:30 PM (Monday - Friday)");
console.log("  🌆  Evening Peak Slot:    05:30 PM (Monday - Friday)");
console.log(`Current System Time: ${new Date().toLocaleString()}`);
console.log("=======================================================\n");

let isRunning = false;

function triggerPipeline(triggerLabel = "Scheduled Peak Run") {
  if (isRunning) {
    console.log(`⏳ [${new Date().toLocaleTimeString()}] Pipeline already running. Skipping trigger.`);
    return;
  }

  isRunning = true;
  console.log(`\n🚀 [${new Date().toLocaleString()}] Triggering Daily Pipeline (${triggerLabel})...`);

  const logFile = path.join(logsDir, `pipeline-${new Date().toISOString().split("T")[0]}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: "a" });

  const child = spawn("node", [path.join(rootDir, "scripts", "daily-pipeline.mjs")], {
    cwd: rootDir,
    env: { ...process.env, HEADLESS: process.env.HEADLESS || "true" },
  });

  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  child.on("close", (code) => {
    isRunning = false;
    console.log(`\n✅ [${new Date().toLocaleTimeString()}] Pipeline finished with exit code: ${code}`);
    console.log(`📋 Detailed log appended to: ${logFile}`);
    console.log("⏳ Waiting for next scheduled peak window...\n");
  });
}

// Afternoon Peak: 01:30 PM (13:30) Mon-Fri (After 12 PM, Before 8 PM)
cron.schedule("30 13 * * 1-5", () => {
  triggerPipeline("Afternoon Peak (01:30 PM)");
});

// Evening Peak: 05:30 PM (17:30) Mon-Fri (After 12 PM, Before 8 PM)
cron.schedule("30 17 * * 1-5", () => {
  triggerPipeline("Evening Peak (05:30 PM)");
});

// If user starts with --now, run immediately on boot
if (process.argv.includes("--now")) {
  console.log("⚡ Instant Run requested via '--now'. Starting pipeline immediately...");
  triggerPipeline("Immediate Initial Run");
} else {
  console.log("💡 Tip: Pass '--now' to run the pipeline immediately once upon launch.");
  console.log("   Example: npm run daemon -- --now\n");
}

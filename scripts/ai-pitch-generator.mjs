#!/usr/bin/env node
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const profilePath = path.join(rootDir, "config", "profile.json");

const profile = fs.existsSync(profilePath)
  ? JSON.parse(fs.readFileSync(profilePath, "utf-8"))
  : {
      name: "Gopal Bhagwat",
      title: "Senior Mobile Engineer | React Native & Full-Stack Specialist",
      experienceYears: 3,
    };

const PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const FALLBACK_MODEL = "gemini-flash-lite-latest";

/**
 * Deeply analyzes the client's post and crafts a tailored email & LinkedIn pitch
 * powered by Google Gemini.
 */
export async function generateAIPitch(lead) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.log("ℹ️ No GEMINI_API_KEY found, using rule-based pitch.");
    return getFallbackPitch(lead);
  }

  const prompt = `You are a world-class freelance client acquisition expert writing on behalf of Gopal Bhagwat.

GOPAL BHAGWAT'S VERIFIED RESUME & BACKGROUND:
- Role: Senior Mobile Engineer | React Native & Full-Stack Specialist (iOS, Android, Web)
- Experience: 3+ years delivering 4+ production apps across Google Play & App Store
- Featured Projects:
  1. TruVideo Automotive SDK: Turbo Modules, native bridging in Kotlin/Swift, enterprise camera/media modules, real-time streaming.
  2. KickScore (Web + App): Live sports scores, real-time feeds, interactive chat platform built for 100K+ users.
  3. Performance Optimization: Hermes bytecode compilation, custom image caching, memoization (cut load times by 35%, reduced crashes by 40%).
  4. Offline-First & Billing: SaveKit & Invoicely (SQLite persistence, Apple StoreKit, Google Play Billing).
  5. Open-Source: Published react-native-responsive-layout-kit on NPM.
  6. Awards: Code Commander Award 2025.
- Links: GitHub: https://github.com/Bhagwat018 | Mobile: +91 6267957589 | Email: gopalbhagwat21@gmail.com
- Availability: Immediate start on milestone or contract basis.

CLIENT POST & REQUIREMENT:
- Author: ${lead.authorName} (${lead.authorHeadline || "Client/Recruiter"})
- Post Excerpt: "${lead.cleanExcerpt}"
- Tech Stack Mentioned: ${lead.techStack?.join(", ") || "Software Development"}

YOUR TASK:
1. STEP 1 (ANALYSIS): Deeply understand what the client actually needs (e.g. MVP from scratch, React Native app development, bug fixes, SDK integration, performance improvement, or contract staffing).
2. STEP 2 (MATCHING): Select the SINGLE most relevant project from Gopal's resume that proves he has already solved this exact problem.
3. STEP 3 (EMAIL PROPOSAL): Write a concise, high-converting cold email (under 120 words):
   - Subject: Highly relevant, professional, mentioning their specific tech/role.
   - Body: Greet with client's first name. Specifically acknowledge their post and pain point. Introduce the matching proof/metric from Gopal's resume. Mention immediate contract availability and link to GitHub/portfolio. End with a polite invite for a 10-minute discovery chat.
4. STEP 4 (LINKEDIN NOTE): Write a personalized connection note that is strictly UNDER 280 CHARACTERS.

Respond ONLY with a valid JSON object matching this structure:
{
  "clientNeedSummary": "1-sentence summary of client's need",
  "selectedProjectProof": "Why this specific project was selected",
  "emailSubject": "...",
  "emailBody": "...",
  "linkedInNote": "..."
}`;

  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(6000),
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (text) {
        const parsed = JSON.parse(text);
        if (parsed.emailSubject && parsed.emailBody && parsed.linkedInNote) {
          // Safety check: Ensure LinkedIn note does not exceed 285 chars
          if (parsed.linkedInNote.length > 285) {
            parsed.linkedInNote = parsed.linkedInNote.slice(0, 282) + "...";
          }
          return {
            source: `gemini-${model}`,
            ...parsed,
          };
        }
      }
    } catch (err) {
      console.warn(`⚠️ Model ${model} generation attempt failed:`, err.message);
    }
  }

  return getFallbackPitch(lead);
}

function getFallbackPitch(lead) {
  const firstName = lead.authorName ? lead.authorName.split(" ")[0] : "there";
  const tech = lead.techStack && lead.techStack.length > 0 ? lead.techStack[0] : "React Native / Mobile";

  return {
    source: "template_fallback",
    clientNeedSummary: `Freelance / contract developer for ${tech}`,
    selectedProjectProof: "KickScore (100K+ users) & 4 production apps",
    emailSubject: `Senior React Native & Mobile Engineer for your ${tech} requirement - Gopal Bhagwat`,
    emailBody: `Hi ${firstName},

I came across your post looking for a ${tech} developer.

I'm a Senior Mobile & Full-Stack Engineer with 3+ years of experience delivering 4+ production apps across iOS, Android, and Web (React Native, React.js, Next.js, TypeScript).

Key Highlights:
• Delivered 4 production apps on App Store & Google Play (including KickScore for 100K+ users)
• TruVideo Automotive SDK: Turbo Modules, native bridging (Kotlin/Swift), and real-time streaming
• Awarded Code Commander Award 2025

GitHub & Portfolio: https://github.com/Bhagwat018
Contact: +91 6267957589 | gopalbhagwat21@gmail.com

I am available immediately on a milestone or contract basis. If you're open to a brief chat, I'd love to share relevant live app demos and discuss your scope.

Best regards,
Gopal Bhagwat`,
    linkedInNote: `Hi ${firstName}, saw your post for a ${tech} developer. I'm a Senior Mobile Engineer (3+ yrs, 4 production apps, React Native/Web, native bridging). Available immediately on contract/milestone. Would love to connect!`,
  };
}

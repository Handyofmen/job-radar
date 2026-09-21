import { google } from "googleapis";
import * as cheerio from "cheerio";
import { sources } from "./config-loader.js";

const { clientId, clientSecret, refreshToken, processedLabel } = sources.gmail;

const SCAN_LABEL_NAME = "Job Leads";
const MAX_MESSAGES_PER_RUN = 150;

const SOURCE_SENDERS = {
  linkedin: ["jobalerts-noreply@linkedin.com", "jobs-noreply@linkedin.com"],
  indeed: ["donotreply@jobalert.indeed.com"],
  glassdoor: ["noreply@glassdoor.com"],
  jobberman: ["support@jobberman.com"],
  myjobmag: ["no_reply@myjobmag.com"]
};

function decodeBase64Url(data) {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function extractBodies(payload) {
  let html = "";
  let plain = "";
  function walk(part) {
    if (!part) return;
    if (part.mimeType === "text/html" && part.body && part.body.data) {
      html += decodeBase64Url(part.body.data);
    } else if (part.mimeType === "text/plain" && part.body && part.body.data) {
      plain += decodeBase64Url(part.body.data);
    }
    (part.parts || []).forEach(walk);
  }
  walk(payload);
  return { html, plain };
}

// Anchored on the reliable "View job: <url>" line rather than splitting on
// dashes — LinkedIn digests have boilerplate header text before the first
// job block that a naive split would have misread as a real job entry.
function parseLinkedInPlainText(text) {
  const jobs = [];
  const regex = /([^\n]+)\n([^\n]+)\n([^\n]+)\n(?:Apply with resume & profile\n)?View job:\s*(\S+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const [, title, company, location, link] = match;
    if (/^(jobs that match|based on|see all jobs|this email was)/i.test(title)) continue;
    jobs.push({ title: title.trim(), company: company.trim(), location: location.trim(), link, source: "LinkedIn" });
  }
  return jobs;
}

function parseIndeedPlainText(text) {
  const jobs = [];
  const lines = text.split("\n").map(l => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(.+?)\s-\s(.+)$/);
    if (match && lines[i - 1] && lines[i - 1].length > 0 && !lines[i - 1].includes(" - ")) {
      let link = null;
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        if (/^https?:\/\//.test(lines[j])) { link = lines[j]; break; }
      }
      jobs.push({
        title: lines[i - 1],
        company: match[1].trim(),
        location: match[2].trim(),
        link,
        source: "Indeed"
      });
    }
  }
  return jobs;
}

function parseGlassdoorHtml(html) {
  const $ = cheerio.load(html);
  const jobs = [];
  $('a[href*="jobListing.htm"]').each((i, el) => {
    const $el = $(el);
    const spanTexts = $el.find("span").map((i, s) => $(s).text().trim()).get()
      .filter(t => t && !/★/.test(t));
    const company = spanTexts[0] || "Unknown";

    const paragraphs = $el.find("p").map((i, p) => $(p).text().trim()).get()
      .filter(t => t && t !== "Easy Apply" && !/^\d+d$/.test(t));
    const title = paragraphs[0] || "";
    const location = paragraphs[1] || "";

    if (title) jobs.push({ title, company, location, link: $el.attr("href") || null, source: "Glassdoor" });
  });
  return jobs;
}

function parseJobbermanHtml(html) {
  const $ = cheerio.load(html);
  const jobs = [];
  $("a.title").each((i, el) => {
    const $el = $(el);
    const title = $el.text().trim();
    const $table = $el.closest("table");
    const company = $table.find(".business_name").first().text().replace(/\u00a0/g, "").trim();
    const location = $table.find(".listing_attribute").first().text().trim();
    if (title) jobs.push({ title, company, location, link: $el.attr("href") || null, source: "Jobberman" });
  });
  return jobs;
}

function parseMyJobMagHtml(html) {
  const $ = cheerio.load(html);
  const jobs = [];
  $('a[href*="myjobmag.com/job"]').each((i, el) => {
    const $el = $(el);
    const title = $el.text().trim();
    const link = $el.attr("href") ? $el.attr("href").split("?")[0] : null;
    const company = $el.next("span").text().trim();
    if (title && link) {
      jobs.push({ title, company: company || "Unknown", location: "", link, source: "MyJobMag" });
    }
  });
  return jobs;
}

function parseBySender(senderEmail, bodies) {
  const html = bodies.html;
  const plain = bodies.plain;
  if (SOURCE_SENDERS.linkedin.some(s => senderEmail.includes(s))) return parseLinkedInPlainText(plain);
  if (SOURCE_SENDERS.indeed.some(s => senderEmail.includes(s))) return parseIndeedPlainText(plain);
  if (SOURCE_SENDERS.glassdoor.some(s => senderEmail.includes(s))) return parseGlassdoorHtml(html);
  if (SOURCE_SENDERS.jobberman.some(s => senderEmail.includes(s))) return parseJobbermanHtml(html);
  if (SOURCE_SENDERS.myjobmag.some(s => senderEmail.includes(s))) return parseMyJobMagHtml(html);
  return [];
}

async function ensureProcessedLabelId(gmail) {
  const res = await gmail.users.labels.list({ userId: "me" });
  const existing = res.data.labels.find(l => l.name === processedLabel);
  if (existing) return existing.id;
  const created = await gmail.users.labels.create({
    userId: "me",
    requestBody: { name: processedLabel, labelListVisibility: "labelShow", messageListVisibility: "show" }
  });
  return created.data.id;
}

export async function fetchAndParseGmailAlerts() {
  if (!clientId) return [];

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  const gmail = google.gmail({ version: "v1", auth });

  const processedLabelId = await ensureProcessedLabelId(gmail);

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: `label:"${SCAN_LABEL_NAME}" -label:"${processedLabel}"`,
    maxResults: MAX_MESSAGES_PER_RUN
  });

  const messages = listRes.data.messages || [];
  const allJobs = [];

  for (const m of messages) {
    const msgRes = await gmail.users.messages.get({ userId: "me", id: m.id, format: "full" });
    const headers = msgRes.data.payload.headers || [];
    const fromHeaderObj = headers.find(h => h.name === "From");
    const fromHeader = fromHeaderObj ? fromHeaderObj.value : "";
    const dateHeaderObj = headers.find(h => h.name === "Date");
    const dateHeader = dateHeaderObj ? dateHeaderObj.value : null;

    const bodies = extractBodies(msgRes.data.payload);
    const parsedJobs = parseBySender(fromHeader, bodies).map(j => ({
      ...j,
      postedAt: dateHeader
    }));
    allJobs.push(...parsedJobs);

    await gmail.users.messages.modify({
      userId: "me",
      id: m.id,
      requestBody: { addLabelIds: [processedLabelId] }
    });
  }

  return allJobs;
}
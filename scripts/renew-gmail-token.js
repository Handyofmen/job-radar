/**
 * Renews the Google refresh token (which Google forces to expire every
 * 7 days for unverified/testing apps) and automatically updates the
 * GOOGLE_REFRESH_TOKEN secret on GitHub — no manual copy-paste required.
 *
 * Run with: npm run renew-gmail-token
 *
 * One-time setup needed first: a GitHub Personal Access Token with
 * "Secrets: Read and write" permission on this repo, saved in
 * config/sources.json under a "github" section.
 */
import fs from "fs";
import http from "http";

// libsodium-wrappers has a known bug where Node's native ESM resolver
// can't find its internal .mjs build file. Loading it via createRequire
// forces the older CommonJS resolution path instead, which works correctly.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const sodium = require("libsodium-wrappers");

const { google } = require("googleapis");
const open = (await import("open")).default;
const fetch = (await import("node-fetch")).default;

const sources = JSON.parse(fs.readFileSync("./config/sources.json", "utf-8"));
const { clientId, clientSecret } = sources.gmail;
const { personalAccessToken, owner, repo } = sources.github;

const REDIRECT_URI = "http://localhost:3000/oauth2callback";
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify"
];

async function getNewRefreshToken() {
  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES
  });

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      if (!req.url.startsWith("/oauth2callback")) return;
      const url = new URL(req.url, "http://localhost:3000");
      const code = url.searchParams.get("code");

      res.end("Success — you can close this tab and return to the terminal.");
      server.close();

      try {
        const { tokens } = await oAuth2Client.getToken(code);
        resolve(tokens.refresh_token);
      } catch (err) {
        reject(err);
      }
    });

    server.listen(3000, () => {
      console.log("Opening browser for Google sign-in...");
      open(authUrl);
    });
  });
}

async function updateGitHubSecret(secretName, secretValue) {
  await sodium.ready;

  // Get the repo's public key — required to encrypt the secret before upload
  const keyRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/secrets/public-key`,
    { headers: { Authorization: `Bearer ${personalAccessToken}`, Accept: "application/vnd.github+json" } }
  );
  if (!keyRes.ok) {
    throw new Error(`Failed to get public key: ${keyRes.status} ${await keyRes.text()}`);
  }
  const { key, key_id } = await keyRes.json();

  const messageBytes = Buffer.from(secretValue);
  const keyBytes = Buffer.from(key, "base64");
  const encryptedBytes = sodium.crypto_box_seal(messageBytes, keyBytes);
  const encryptedValue = Buffer.from(encryptedBytes).toString("base64");

  const putRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/secrets/${secretName}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${personalAccessToken}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ encrypted_value: encryptedValue, key_id })
    }
  );
  if (!putRes.ok && putRes.status !== 204) {
    throw new Error(`Failed to update secret: ${putRes.status} ${await putRes.text()}`);
  }
}

async function main() {
  const newToken = await getNewRefreshToken();
  console.log("Got new refresh token, updating GitHub Secret...");

  await updateGitHubSecret("GOOGLE_REFRESH_TOKEN", newToken);
  console.log("✅ GOOGLE_REFRESH_TOKEN updated on GitHub successfully.");

  // Also update the local copy so local testing stays in sync
  sources.gmail.refreshToken = newToken;
  fs.writeFileSync("./config/sources.json", JSON.stringify(sources, null, 2));
  console.log("✅ Local config/sources.json updated too.");

  process.exit(0);
}

main().catch(err => {
  console.error("Renewal failed:", err.message || err);
  process.exit(1);
});

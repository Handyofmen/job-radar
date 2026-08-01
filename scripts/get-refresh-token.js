/**
 * One-time script to generate a Gmail refresh token.
 * Run locally with: node scripts/get-refresh-token.js
 *
 * Before running, fill in CLIENT_ID and CLIENT_SECRET below
 * (from the OAuth client JSON you downloaded from Google Cloud Console).
 */
import { google } from "googleapis";
import http from "http";
import open from "open"; // npm install open --save-dev (only needed for this script)

const CLIENT_ID = "75492365829-psgj1n57mj5dkjoru2ie9nbardtpjsin.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const REDIRECT_URI = "http://localhost:3000/oauth2callback";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify" // needed to add the Processed label
];

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline", // required to get a refresh token
  prompt: "consent",      // forces Google to re-issue a refresh token even on repeat runs
  scope: SCOPES
});

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith("/oauth2callback")) return;

  const url = new URL(req.url, "http://localhost:3000");
  const code = url.searchParams.get("code");

  res.end("Success — you can close this tab and return to the terminal.");
  server.close();

  const { tokens } = await oAuth2Client.getToken(code);
  console.log("\nSave these in config/sources.json (and as GitHub Actions secrets):\n");
  console.log("REFRESH_TOKEN:", tokens.refresh_token);
});

server.listen(3000, () => {
  console.log("Opening browser for Google sign-in...");
  open(authUrl);
});

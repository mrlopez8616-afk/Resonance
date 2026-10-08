/**
 * Local click-test for the single-user login.
 * Uses PGlite over a loopback socket (the app uses node-postgres for 127.0.0.1).
 *
 *   node scripts/auth-browser.mjs
 */
import { mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { hash } from "@node-rs/argon2";
import { Secret, TOTP } from "otpauth";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { chromium } from "playwright";

const PORT = 3001;
const DB_PORT = 54329;
const ORIGIN = `http://localhost:${PORT}`;
const PASSWORD = "playwright-floor";
const TOTP_SECRET = new Secret({ size: 20 }).base32;
const SESSION_SECRET = "browser-session-secret-0123456789abcdef";
const SYNC_SECRET = "browser-sync-secret";
const FITNESS_TOKEN = "browser-fitness-token";
const PROFILE = "/tmp/resonance-auth-profile";
const ARTIFACTS = "/opt/cursor/artifacts";

const results = {};

function codeAt(now = Date.now()) {
  return new TOTP({
    secret: Secret.fromBase32(TOTP_SECRET),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  }).generate({ timestamp: now });
}

const APP_ROOT = new URL("..", import.meta.url).pathname;

function startProcess(command, args, env) {
  const child = spawn(command, args, {
    cwd: APP_ROOT,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let log = "";
  child.stdout.on("data", (chunk) => {
    log += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    log += chunk.toString();
  });
  child.log = () => log;
  return child;
}

function stopProcess(child) {
  if (!child?.pid || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

function watchAuth(page) {
  page.on("pageerror", (error) => console.log("pageerror", error.message));
  page.on("response", (response) => {
    const url = response.url();
    if (!url.includes("/api/auth/")) return;
    console.log("auth response", response.status(), new URL(url).pathname);
  });
}

async function waitForServer() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${ORIGIN}/login`, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      await delay(250);
    }
  }
  throw new Error("Next server did not start.");
}

async function shot(page, name) {
  await mkdir(ARTIFACTS, { recursive: true });
  await page.screenshot({ path: `${ARTIFACTS}/${name}.png`, fullPage: true });
}

async function main() {
  const passwordHash = await hash(PASSWORD);
  const db = new PGlite();
  const sql = new PGLiteSocketServer({
    db,
    port: DB_PORT,
    host: "127.0.0.1",
    maxConnections: 20,
  });
  await sql.start();

  const env = {
    DATABASE_URL: `postgres://postgres@127.0.0.1:${DB_PORT}/postgres`,
    AUTH_PASSWORD_HASH: passwordHash,
    AUTH_TOTP_SECRET: TOTP_SECRET,
    AUTH_SESSION_SECRET: SESSION_SECRET,
    WEBAUTHN_RP_ID: "localhost",
    WEBAUTHN_ORIGIN: ORIGIN,
    RESONANCE_SYNC_SECRET: SYNC_SECRET,
    FITNESS_INGEST_TOKEN: FITNESS_TOKEN,
  };

  const migrate = startProcess("node", ["node_modules/tsx/dist/cli.mjs", "scripts/db-migrate.ts"], env);
  const migrateCode = await new Promise((resolve) => migrate.once("exit", resolve));
  if (migrateCode !== 0) {
    throw new Error(`migrate failed\n${migrate.log()}`);
  }

  const server = startProcess(
    "node",
    ["node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", String(PORT)],
    env,
  );
  try {
    await waitForServer();

    await rm(PROFILE, { recursive: true, force: true });
    let context = await chromium.launchPersistentContext(PROFILE, {
      headless: true,
      viewport: { width: 1280, height: 900 },
    });
    let page = context.pages()[0] ?? (await context.newPage());
    watchAuth(page);

    await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
    const homeUrl = new URL(page.url());
    results.a_home = {
      path: homeUrl.pathname,
      next: homeUrl.searchParams.get("next"),
    };
    await shot(page, "login");

    await page.goto(`${ORIGIN}/fights`, { waitUntil: "networkidle" });
    results.a_fights = new URL(page.url()).searchParams.get("next");
    await page.goto(`${ORIGIN}/n/predictions`, { waitUntil: "networkidle" });
    results.a_predictions = new URL(page.url()).searchParams.get("next");

    const anonBets = await page.request.get(`${ORIGIN}/api/bets`);
    results.a_bets = anonBets.status();

    const bearer = await page.request.post(`${ORIGIN}/api/bets`, {
      headers: { authorization: `Bearer ${SYNC_SECRET}`, "content-type": "application/json" },
      data: "{}",
    });
    results.b_bearer = bearer.status();

    const ingest = await page.request.post(`${ORIGIN}/api/fitness/ingest`, {
      headers: { "x-fitness-token": FITNESS_TOKEN, "content-type": "application/json" },
      data: {
        data: {
          metrics: [
            {
              name: "step_count",
              units: "count",
              data: [{ qty: 10, date: "2026-10-06 00:00:00 -0500" }],
            },
          ],
        },
      },
      timeout: 20_000,
    });
    results.b_fitness = ingest.status();

    const apiLogin = await page.request.post(`${ORIGIN}/api/auth/login`, {
      headers: { "content-type": "application/json" },
      data: { password: PASSWORD, code: codeAt() },
    });
    results.c_api_login = apiLogin.status();
    if (!apiLogin.ok()) {
      console.log("api login body", await apiLogin.text());
      console.log(server.log());
      throw new Error(`API login failed with ${apiLogin.status()}`);
    }
    await page.request.post(`${ORIGIN}/api/auth/logout`);

    await page.goto(`${ORIGIN}/login?next=/`, { waitUntil: "networkidle" });
    await page.locator("#password").fill(PASSWORD);
    await page.locator("#code").fill(codeAt());
    await page.getByRole("button", { name: "Sign in" }).click();
    try {
      await page.waitForURL((url) => url.pathname === "/", { timeout: 15000 });
    } catch (error) {
      console.log("stuck at", page.url());
      console.log(await page.locator("body").innerText());
      console.log(server.log());
      await shot(page, "login-stuck");
      throw error;
    }
    await page.waitForSelector("text=RESONANCE 2.0");
    await shot(page, "logged-in-home");
    results.c_before_close = new URL(page.url()).pathname;

    await context.close();
    context = await chromium.launchPersistentContext(PROFILE, {
      headless: true,
      viewport: { width: 1280, height: 900 },
    });
    page = context.pages()[0] ?? (await context.newPage());
    watchAuth(page);
    await page.goto(`${ORIGIN}/`, { waitUntil: "networkidle" });
    results.c_after_reopen = new URL(page.url()).pathname;

    const client = await context.newCDPSession(page);
    await client.send("WebAuthn.enable");
    await client.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        ctap2Version: "ctap2_1",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });

    await page.goto(`${ORIGIN}/settings/security`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Add passkey" }).click();
    await page.getByText("No passkey yet.").waitFor({ state: "detached", timeout: 15000 });
    await shot(page, "security");
    results.e_registered = await page.locator(".security-row").count();

    await page.getByRole("button", { name: "Sign out everywhere" }).click();
    await page.waitForURL((url) => url.pathname === "/login", { timeout: 15000 });
    results.d_after_everywhere = new URL(page.url()).pathname;
    const afterEverywhere = await page.request.get(`${ORIGIN}/`, { maxRedirects: 0 });
    results.d_home_status = afterEverywhere.status();
    results.d_home_location = afterEverywhere.headers()["location"] ?? null;
    if (results.d_home_status < 300 || results.d_home_status >= 400 || !String(results.d_home_location).includes("/login")) {
      throw new Error(`expected a login redirect after sign-out, got ${results.d_home_status} ${results.d_home_location}`);
    }

    await page.getByRole("button", { name: "Use passkey" }).click();
    try {
      await page.waitForURL((url) => url.pathname === "/", { timeout: 20000 });
    } catch (error) {
      console.log("passkey stuck at", page.url());
      console.log(await page.locator("body").innerText());
      console.log(server.log());
      throw error;
    }
    results.e_passkey_home = new URL(page.url()).pathname;

    const digest = createHash("sha256").update(JSON.stringify(results)).digest("hex").slice(0, 12);
    console.log(JSON.stringify({ ok: true, results, digest }, null, 2));
    await context.close();
  } finally {
    stopProcess(server);
    await sql.stop();
    await delay(300);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});

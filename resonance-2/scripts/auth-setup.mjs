#!/usr/bin/env node
/**
 * Local setup. Prints env values. Does not write them to disk.
 *
 *   npm run auth:setup
 */
import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import { stdin, stdout } from "node:process";
import { Writable } from "node:stream";
import { Algorithm, hash } from "@node-rs/argon2";
import { Secret, TOTP } from "otpauth";
import QRCode from "qrcode";

function promptHidden(question) {
  return new Promise((resolve) => {
    stdout.write(question);
    const sink = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });
    const rl = createInterface({ input: stdin, output: sink, terminal: true });
    rl.question("", (answer) => {
      rl.close();
      stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  if (!stdin.isTTY) {
    console.error("Run this in a terminal so the password is not echoed.");
    process.exit(1);
  }
  let password = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const first = await promptHidden("Password: ");
    const second = await promptHidden("Password again: ");
    if (first && first === second) {
      password = first;
      break;
    }
    console.error(first ? "Those did not match." : "Password cannot be empty.");
  }
  if (!password) process.exit(1);

  const passwordHash = await hash(password, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({
    issuer: "Resonance",
    label: "Andres",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
  const sessionSecret = randomBytes(32).toString("hex");
  const uri = totp.toString();

  console.log("");
  console.log("Set these in Vercel before merging. Do not commit them.");
  console.log("");
  console.log(`AUTH_PASSWORD_HASH=${passwordHash}`);
  console.log(`AUTH_TOTP_SECRET=${secret.base32}`);
  console.log(`AUTH_SESSION_SECRET=${sessionSecret}`);
  console.log("WEBAUTHN_RP_ID=resonance3.vercel.app");
  console.log("WEBAUTHN_ORIGIN=https://resonance3.vercel.app");
  console.log("");
  console.log(uri);
  try {
    console.log(await QRCode.toString(uri, { type: "terminal", small: true }));
  } catch {
    console.log("QR render failed. Add the otpauth URI to an authenticator by hand.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Setup failed.");
  process.exit(1);
});

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const root = import.meta.dirname;
const library = fs.readFileSync(path.join(root, "vendor/crypto-js.js"), "utf8");
const expected = "ee02257ffbaf0a9b481c7039b0f3bb20c360c9674fe4be8b38ae709b2ea59bbe";
if (createHash("sha256").update(library).digest("hex") !== expected) throw new Error("CryptoJS checksum mismatch");
const source = fs.readFileSync(path.join(root, "src/telaidian.js"), "utf8");
fs.copyFileSync(path.join(root, "vendor/LICENSE"), path.join(root, "LICENSE-CryptoJS.txt"));
fs.writeFileSync(path.join(root, "telaidian.js"),
  "/* CryptoJS 4.2.0 (MIT), https://github.com/brix/crypto-js ; license in LICENSE-CryptoJS.txt. */\n" + library + "\n;\n" + source);
console.log("Built loon/telaidian.js (offline bundle; no runtime library downloads)");

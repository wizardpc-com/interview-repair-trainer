import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const standaloneRoot = join(".next", "standalone");
const standaloneServer = join(standaloneRoot, "server.js");

if (!existsSync(standaloneServer)) {
  throw new Error("Standalone server output is missing; run next build first");
}

const assets = [
  [join(".next", "static"), join(standaloneRoot, ".next", "static")],
  ["public", join(standaloneRoot, "public")],
];

for (const [source, destination] of assets) {
  if (!existsSync(source)) {
    continue;
  }

  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true });
}

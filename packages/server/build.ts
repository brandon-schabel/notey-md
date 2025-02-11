// File: packages/server/build.ts

import { spawnSync } from "node:child_process";
import { rmSync, cpSync } from "node:fs";
import { resolve, join } from "path";

// We’ll assume we run this script from packages/server.
// Adjust relative paths as needed if your directory structure differs.

async function buildProject() {
  console.log("Step 1) Building Markdown Parser...");
  const parserBuild = spawnSync("bun", ["run", "build"], {
    cwd: resolve(__dirname, "..", "markdown-parser"),
    stdio: "inherit",
  });
  if (parserBuild.status !== 0) {
    console.error("Markdown parser build failed!");
    process.exit(parserBuild.status || 1);
  }

  console.log("Step 2) Clean old artifacts in server/dist/ and server/bin/...");
  rmSync(resolve(__dirname, "dist"), { recursive: true, force: true });
  rmSync(resolve(__dirname, "bin"), { recursive: true, force: true });

  console.log("Step 3) Compile the server into a native binary...");
  // --compile tells Bun to produce a single native binary for the local OS.
  const serverBuild = spawnSync("bun", [
    "build", 
    "index.ts", 
    "--outdir", "bin",
    "--name", "notey-md",
    "--minify",
    "--compile"
  ], {
    cwd: __dirname,
    stdio: "inherit",
  });
  if (serverBuild.status !== 0) {
    console.error("Server build (binary) failed!");
    process.exit(serverBuild.status || 1);
  }

  console.log("Step 4) Build the front-end (editor.ts) for the browser...");
  // This produces a transpiled JS file in dist/public:
  //   e.g. dist/public/editor.js
  const frontendBuild = spawnSync("bun", [
    "build",
    "editor.ts",
    "--outdir", "dist/public",
    "--loader=ts",
    // optionally: "--minify", "--sourcemap", etc.
  ], {
    cwd: __dirname,
    stdio: "inherit",
  });
  if (frontendBuild.status !== 0) {
    console.error("Front-end build failed!");
    process.exit(frontendBuild.status || 1);
  }

  console.log("Step 5) Copy static HTML (and any other assets) to dist/public...");
  const editorHtmlSource = resolve(__dirname, "editor.html");
  const editorHtmlDest = resolve(__dirname, "dist/public/editor.html");
  cpSync(editorHtmlSource, editorHtmlDest);

  // If you have other static files or folders, copy them similarly:
  // cpSync(resolve(__dirname, "some.css"), resolve(__dirname, "dist/public/some.css"));
  // or cpSync(resolve(__dirname, "assets"), resolve(__dirname, "dist/public/assets"), { recursive: true });

  console.log("Build complete! Native binary is in bin/notey-md");
  console.log("Front-end assets are in dist/public");
}

buildProject().catch((err) => {
  console.error("Build script error:", err);
  process.exit(1);
});

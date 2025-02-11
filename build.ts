import { mkdirSync, copyFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { createWriteStream } from "node:fs";
import archiver from "archiver";
import { $ } from "bun";
import { performance } from "node:perf_hooks";

async function buildProject() {
  const startTime = performance.now();
  const rootDir = process.cwd();
  const distDir = join(rootDir, "dist");

  // Clear the dist directory
  await $`rm -rf ${distDir}`;

  // Build the markdown parser first as the project depends on its output
  const parserDir = join(rootDir, "packages", "markdown-parser");
  console.log("Building markdown parser...");
  await $`cd ${parserDir} && bun run build`;

  // Build the frontend editor (editor.ts and editor.html)
  const frontendDir = join(rootDir, "packages", "frontend");
  console.log("Building frontend editor...");
  await $`cd ${frontendDir} && bun run build`;

  // Build the main project backend from index.ts
  console.log("Building main project backend...");
  const mainEntry = join(rootDir, "index.ts");
  await Bun.build({
    entrypoints: [mainEntry],
    outdir: distDir,
    target: "bun",
    minify: true,
    sourcemap: "external"
  });

  // Prepare additional assets in the dist folder
  console.log("Copying required assets to dist...");
  // Create a folder for the frontend output
  const frontendDistDir = join(distDir, "frontend-dist");
  mkdirSync(frontendDistDir, { recursive: true });
  // Copy the built frontend files
  await $`cp -r ${join(frontendDir, "dist")}/* ${frontendDistDir}/`;

  // Copy the editor HTML from the frontend folder
  copyFileSync(join(frontendDir, "editor.html"), join(distDir, "editor.html"));

  // Copy the built markdown parser output so the project can use it
  const parserDist = join(parserDir, "dist");
  const destParserDist = join(distDir, "markdown-parser");
  mkdirSync(destParserDist, { recursive: true });
  await $`cp -r ${parserDist}/* ${destParserDist}/`;

  // Load package information to include version and name in the binary name
  const pkg = require(join(rootDir, "package.json"));
  const bundleNamePrefix = `${pkg.name}-${pkg.version}`;

  type PlatformTarget = {
    name: string;
    target: string;
    executableExt: string;
  };

  const targets: PlatformTarget[] = [
    { name: `${bundleNamePrefix}-linux-x64`, target: "bun-linux-x64", executableExt: "" },
    { name: `${bundleNamePrefix}-macos-x64`, target: "bun-darwin-x64", executableExt: "" },
    { name: `${bundleNamePrefix}-macos-arm64`, target: "bun-darwin-arm64", executableExt: "" },
    { name: `${bundleNamePrefix}-windows-x64`, target: "bun-windows-x64", executableExt: ".exe" }
  ];

  // Create binary bundles for each target
  for (const { name, target, executableExt } of targets) {
    console.log(`Creating ${name} standalone executable...`);
    const platformDir = join(distDir, name);
    mkdirSync(platformDir, { recursive: true });

    // Copy required assets to the platform directory
    await $`cp -r ${join(distDir, "markdown-parser")} ${platformDir}/markdown-parser`;
    await $`cp -r ${join(distDir, "frontend-dist")} ${platformDir}/frontend-dist`;
    copyFileSync(join(distDir, "editor.html"), join(platformDir, "editor.html"));

    // Build the standalone binary with compile for this target
    const executableName = `${pkg.name}-v${pkg.version}${executableExt}`;
    await $`bun build --compile --target=${target} ${mainEntry} --outfile ${join(platformDir, executableName)}`;

    // Set executable permissions for non-Windows platforms
    if (!executableExt) {
      chmodSync(join(platformDir, executableName), 0o755);
    }

    // Create a zip archive for the platform-specific bundle
    console.log(`Creating zip archive for ${name}...`);
    await createZipArchive(platformDir, `${platformDir}.zip`);
    await $`mv ${platformDir}.zip ${join(distDir, name)}.zip`;
  }

  const endTime = performance.now();
  const totalSeconds = ((endTime - startTime) / 1000).toFixed(2);
  console.log(`Build completed in ${totalSeconds} seconds.`);
}

function createZipArchive(sourceDir: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      console.log(`Zip archive created successfully: ${archive.pointer()} total bytes`);
      resolve();
    });

    archive.on("error", (err) => {
      reject(err);
    });

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

buildProject().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
}); 
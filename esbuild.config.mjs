import { context } from "esbuild";

const isProduction = process.argv[2] === "production";

const buildOptions = {
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  platform: "browser",
  target: "es2022",
  sourcemap: isProduction ? false : "inline",
  minify: isProduction,
  outfile: "main.js",
  logLevel: "info"
};

if (isProduction) {
  const buildContext = await context(buildOptions);
  await buildContext.rebuild();
  await buildContext.dispose();
} else {
  const buildContext = await context(buildOptions);
  await buildContext.watch();
}


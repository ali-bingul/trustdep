// filepath: scripts/update-top-packages.mjs
/**
 * Updates data/top10k.json with the most-popular npm packages.
 *
 * Source: npm registry's official /-/v1/search endpoint, paginated.
 * Sorted by popularity (download count + dependent ratio).
 *
 * Run weekly via CI or `npm run update-top`.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "data", "top10k.json");
const TARGET_COUNT = 10_000;
const PAGE_SIZE = 250;

/**
 * Curated list of the ~400 most-downloaded npm packages (millions/week).
 * Source: well-known top npm packages by download count (stable list).
 * These are the primary typosquat targets and MUST be in every shipped list.
 * Search-based fallback is keyword-driven and misses these classic packages.
 */
const TOP_CRITICAL = [
  // Top utilities (50M+/week)
  "lodash", "react", "react-dom", "axios", "chalk", "express", "debug",
  "commander", "moment", "vue", "angular", "rxjs", "tslib", "yargs",
  "request", "underscore", "async", "bluebird", "semver", "uuid",
  "ms", "minimist", "glob", "fs-extra", "rimraf", "mkdirp", "inquirer",
  "ora", "boxen", "kleur", "picocolors", "colors", "ansi-styles",
  "ansi-regex", "strip-ansi", "wrap-ansi", "supports-color", "color-convert",
  // Webpack ecosystem
  "webpack", "webpack-cli", "webpack-dev-server", "babel-loader", "css-loader",
  "style-loader", "file-loader", "url-loader", "ts-loader", "html-webpack-plugin",
  "mini-css-extract-plugin", "terser-webpack-plugin", "copy-webpack-plugin",
  "clean-webpack-plugin", "fork-ts-checker-webpack-plugin",
  // Babel
  "@babel/core", "@babel/preset-env", "@babel/preset-react", "@babel/preset-typescript",
  "@babel/cli", "@babel/runtime", "@babel/polyfill", "@babel/plugin-transform-runtime",
  "babel-jest", "babel-eslint",
  // ESLint
  "eslint", "prettier", "eslint-plugin-react", "eslint-plugin-import",
  "eslint-plugin-jsx-a11y", "eslint-config-airbnb", "eslint-config-prettier",
  "eslint-plugin-prettier", "@typescript-eslint/parser", "@typescript-eslint/eslint-plugin",
  // TypeScript
  "typescript", "ts-node", "tslint", "ts-jest", "@types/node", "@types/react",
  "@types/react-dom", "@types/jest", "@types/express", "@types/lodash",
  // Test
  "jest", "mocha", "chai", "sinon", "vitest", "jasmine", "ava", "tap", "nyc",
  "supertest", "cypress", "playwright", "puppeteer", "@testing-library/react",
  "@testing-library/jest-dom", "@testing-library/user-event", "enzyme",
  // React ecosystem
  "react-router", "react-router-dom", "redux", "react-redux", "@reduxjs/toolkit",
  "redux-thunk", "redux-saga", "next", "gatsby", "create-react-app",
  "react-scripts", "styled-components", "@emotion/react", "@emotion/styled",
  "material-ui", "@mui/material", "@mui/icons-material", "antd", "react-bootstrap",
  "formik", "react-hook-form", "yup", "react-query", "@tanstack/react-query",
  "swr", "react-helmet", "prop-types", "classnames", "clsx",
  // Vue
  "vuex", "vue-router", "vuetify", "nuxt", "@vue/cli", "vue-loader",
  // Angular
  "@angular/core", "@angular/common", "@angular/compiler", "@angular/forms",
  "@angular/router", "@angular/platform-browser", "@angular/cli",
  // Node/server
  "body-parser", "cors", "helmet", "compression", "morgan", "cookie-parser",
  "express-session", "passport", "jsonwebtoken", "bcrypt", "bcryptjs",
  "dotenv", "config", "winston", "pino", "bunyan", "log4js", "nodemon",
  "pm2", "forever", "concurrently", "cross-env", "shelljs",
  // Database
  "mongoose", "sequelize", "knex", "pg", "mysql", "mysql2", "redis", "ioredis",
  "mongodb", "sqlite3", "typeorm", "prisma", "@prisma/client",
  // HTTP
  "node-fetch", "got", "superagent", "isomorphic-fetch", "cross-fetch",
  "form-data", "qs", "querystring", "url-parse",
  // Build tools
  "rollup", "vite", "esbuild", "parcel", "gulp", "grunt", "browserify",
  "@rollup/plugin-node-resolve", "@rollup/plugin-commonjs", "@rollup/plugin-typescript",
  "swc", "@swc/core", "tsup", "tsc",
  // Postcss/css
  "postcss", "autoprefixer", "tailwindcss", "sass", "node-sass", "less",
  "stylus", "less-loader", "sass-loader", "postcss-loader",
  // Misc utilities
  "axios", "node-uuid", "shortid", "nanoid", "ulid", "date-fns", "dayjs",
  "luxon", "validator", "joi", "ajv", "zod", "ramda", "immutable",
  "immer", "deep-equal", "deepmerge", "merge", "extend", "object-assign",
  "fast-deep-equal", "lodash.merge", "lodash.get", "lodash.set", "lodash.clonedeep",
  "lodash.debounce", "lodash.throttle", "lodash.isequal",
  // File system / path
  "graceful-fs", "chokidar", "ignore", "minimatch", "globby", "fast-glob",
  "find-up", "locate-path", "p-locate", "p-limit", "p-map", "p-queue",
  "make-dir", "tmp", "tempy", "trash", "del",
  // Stream / buffer
  "through2", "readable-stream", "stream-buffers", "concat-stream",
  "split2", "pump", "pumpify", "duplexify", "end-of-stream",
  // Crypto
  "crypto-js", "node-forge", "scrypt-js", "tweetnacl", "elliptic",
  // Markdown / templating
  "marked", "markdown-it", "remark", "rehype", "handlebars", "ejs",
  "pug", "mustache", "nunjucks", "liquidjs",
  // Process / shell
  "execa", "cross-spawn", "shell-exec", "spawn-please", "which",
  "node-cleanup", "exit-hook", "signal-exit",
  // CLI
  "commander", "yargs", "meow", "cac", "minimist", "arg", "mri",
  "prompts", "enquirer", "listr", "listr2", "log-symbols", "figures",
  "cli-table", "cli-table3", "cli-spinners", "cli-progress",
  // Misc popular
  "core-js", "regenerator-runtime", "@babel/runtime-corejs3", "raw-body",
  "iconv-lite", "safe-buffer", "buffer", "process", "events", "util",
  "punycode", "tough-cookie", "psl", "dom-serializer", "domhandler",
  "domutils", "entities", "htmlparser2", "cheerio", "jsdom",
  "xml2js", "fast-xml-parser", "csv-parse", "csv-parser", "papaparse",
  "exceljs", "node-xlsx", "sharp", "jimp", "gm",
  // Vue/React UI
  "react-icons", "lucide-react", "heroicons", "react-spring", "framer-motion",
  "react-transition-group", "react-virtualized", "react-window", "react-table",
  "react-select", "react-datepicker", "react-modal", "react-toastify",
  // Backend frameworks
  "koa", "fastify", "hapi", "@hapi/hapi", "restify", "nestjs", "@nestjs/core",
  "@nestjs/common", "@nestjs/platform-express", "@nestjs/typeorm",
  "socket.io", "socket.io-client", "ws", "graphql", "apollo-server",
  "apollo-client", "@apollo/client", "graphql-tag", "type-graphql",
  // Cloud / aws
  "aws-sdk", "@aws-sdk/client-s3", "@aws-sdk/client-dynamodb", "firebase",
  "firebase-admin", "@google-cloud/storage",
  // Misc
  "node-gyp", "node-pre-gyp", "prebuild-install", "node-addon-api",
  "bindings", "nan", "node-abi", "detect-libc",
];

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "user-agent": "pkgsafe-update-script" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, attempts = 4) {
  let delay = 1500;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchJson(url);
    } catch (err) {
      if (i === attempts - 1) throw err;
      if (String(err.message).includes("429")) {
        await sleep(delay);
        delay *= 2;
        continue;
      }
      throw err;
    }
  }
}

/**
 * Fetches popular packages by paginating npms.io search.
 * npms.io ranks by composite score (popularity + maintenance + quality).
 * Returns most-depended-upon packages in the registry.
 */
async function fetchFromNpmsIo() {
  const names = [];
  const seen = new Set();
  const PAGE_LIMIT = 250; // npms.io max
  // npms.io supports paging up to ~5000 with text=*, then returns empty.
  for (let from = 0; from < 5000 && names.length < TARGET_COUNT; from += PAGE_LIMIT) {
    const url = `https://api.npms.io/v2/search?q=*&size=${PAGE_LIMIT}&from=${from}`;
    try {
      process.stdout.write(`  npms.io page from=${from}... `);
      const data = await fetchWithRetry(url);
      const results = data?.results ?? [];
      let added = 0;
      for (const r of results) {
        const n = r?.package?.name;
        if (typeof n !== "string") continue;
        const lower = n.toLowerCase().trim();
        if (!lower || seen.has(lower)) continue;
        seen.add(lower);
        names.push(lower);
        added++;
      }
      process.stdout.write(`+${added} (total ${names.length})\n`);
      if (results.length === 0) break;
      await sleep(500);
    } catch (err) {
      process.stdout.write(`error: ${err.message}\n`);
      break;
    }
  }
  return names;
}

/**
 * Fallback: paginate npm registry search with broad keyword seeds.
 */
async function fetchFromNpmSearch() {
  const names = [];
  const seen = new Set();
  const seeds = [
    "react", "vue", "angular", "node", "typescript", "javascript",
    "cli", "test", "webpack", "babel", "eslint", "express", "server",
    "database", "api", "utility", "ui", "framework", "tool", "plugin",
    "loader", "parser", "logger", "auth", "http", "stream", "promise",
    "async", "json", "css", "html", "dom", "browser", "date", "string",
    "array", "object", "functional", "lodash", "fs", "path", "env",
    "config", "build", "lint", "format", "minify", "compile",
  ];
  for (const seed of seeds) {
    if (names.length >= TARGET_COUNT) break;
    process.stdout.write(`  seed "${seed}"... `);
    let pageCount = 0;
    for (let from = 0; from < 2000 && names.length < TARGET_COUNT; from += PAGE_SIZE) {
      try {
        const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(seed)}&size=${PAGE_SIZE}&from=${from}&popularity=1.0&quality=0&maintenance=0`;
        const data = await fetchWithRetry(url);
        const objects = data?.objects ?? [];
        if (objects.length === 0) break;
        for (const o of objects) {
          const n = o?.package?.name;
          if (typeof n !== "string") continue;
          const lower = n.toLowerCase().trim();
          if (!lower || seen.has(lower)) continue;
          seen.add(lower);
          names.push(lower);
        }
        pageCount++;
        await sleep(400);
        if (objects.length < PAGE_SIZE) break;
      } catch (err) {
        process.stdout.write(`(page error: ${err.message}) `);
        break;
      }
    }
    process.stdout.write(`+${pageCount} pages, total ${names.length}\n`);
  }
  return names;
}

async function main() {
  process.stdout.write(`Fetching popular packages...\n\n`);

  // Start with curated critical list (most-attacked, well-known top packages)
  const names = [];
  const seen = new Set();
  for (const n of TOP_CRITICAL) {
    const lower = n.toLowerCase().trim();
    if (!seen.has(lower)) {
      seen.add(lower);
      names.push(lower);
    }
  }
  process.stdout.write(`[curated] ${names.length} critical packages seeded\n\n`);

  process.stdout.write(`[1/2] npms.io ranked search\n`);
  const npms = await fetchFromNpmsIo();
  for (const n of npms) {
    if (!seen.has(n)) { seen.add(n); names.push(n); }
    if (names.length >= TARGET_COUNT) break;
  }

  if (names.length < TARGET_COUNT) {
    process.stdout.write(`\n[2/2] npm registry keyword fallback\n`);
    const extra = await fetchFromNpmSearch();
    for (const n of extra) {
      if (!seen.has(n)) { seen.add(n); names.push(n); }
      if (names.length >= TARGET_COUNT) break;
    }
  }

  if (names.length === 0) {
    process.stderr.write("No packages fetched. Aborting.\n");
    process.exit(1);
  }

  const final = names.slice(0, TARGET_COUNT);
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(final) + "\n", "utf8");
  process.stdout.write(`\nWrote ${final.length} packages to ${path.relative(process.cwd(), OUT)}\n`);
}

main().catch((err) => {
  process.stderr.write(`Error: ${err?.message ?? err}\n`);
  process.exit(1);
});

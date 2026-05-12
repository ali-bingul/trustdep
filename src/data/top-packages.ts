// filepath: src/data/top-packages.ts
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let cached: string[] | null = null;

const FALLBACK: string[] = [
  "react", "react-dom", "lodash", "axios", "express", "typescript", "vue",
  "angular", "next", "nuxt", "svelte", "jquery", "moment", "dayjs", "date-fns",
  "chalk", "debug", "commander", "yargs", "got", "node-fetch", "request",
  "underscore", "ramda", "rxjs", "redux", "vuex", "pinia", "zustand", "mobx",
  "webpack", "vite", "rollup", "parcel", "esbuild", "babel", "eslint", "prettier",
  "jest", "mocha", "chai", "vitest", "playwright", "cypress", "puppeteer",
  "ws", "socket.io", "fastify", "koa", "hapi", "nestjs", "graphql", "apollo-server",
  "mongoose", "sequelize", "typeorm", "prisma", "mysql", "pg", "redis", "ioredis",
  "uuid", "nanoid", "validator", "joi", "yup", "zod", "ajv", "class-validator",
  "winston", "pino", "morgan", "log4js", "bunyan",
  "bcrypt", "bcryptjs", "jsonwebtoken", "passport", "helmet", "cors",
  "dotenv", "config", "rc", "minimist", "meow", "ora", "cli-table3",
  "fs-extra", "glob", "rimraf", "mkdirp", "globby", "fast-glob", "chokidar",
  "semver", "tar", "zip-stream", "archiver", "extract-zip",
  "ts-node", "tsx", "nodemon", "concurrently", "cross-env", "npm-run-all",
  "husky", "lint-staged", "commitlint", "conventional-changelog",
  "tslib", "core-js", "regenerator-runtime", "@types/node", "@types/react",
  "tailwindcss", "postcss", "autoprefixer", "sass", "less", "stylus",
  "styled-components", "emotion", "css-loader", "style-loader", "mini-css-extract-plugin",
  "puppeteer-core", "playwright-core", "selenium-webdriver",
  "form-data", "body-parser", "multer", "compression", "cookie-parser",
  "minimatch", "picomatch", "micromatch", "anymatch", "is-glob",
  "ansi-regex", "strip-ansi", "wrap-ansi", "string-width", "cli-cursor",
  "tar-stream", "stream-buffers", "through2", "pump", "split2",
  "ramda", "immutable", "immer", "lodash.merge", "lodash.clonedeep",
];

export async function loadTopPackages(): Promise<string[]> {
  if (cached) return cached;

  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, "..", "..", "data", "top10k.json"),
    path.join(here, "..", "data", "top10k.json"),
  ];

  for (const file of candidates) {
    try {
      const raw = await fs.readFile(file, "utf8");
      const list = JSON.parse(raw) as unknown;
      if (Array.isArray(list) && list.every(x => typeof x === "string")) {
        cached = list;
        return cached;
      }
    } catch {
      // try next
    }
  }

  cached = FALLBACK;
  return cached;
}

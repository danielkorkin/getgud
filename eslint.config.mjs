import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored agent skills, not app source:
    ".agents/**",
    ".claude/**",
    ".cursor/**",
    ".devin/**",
    // Generated Prisma contract files (see .gitattributes):
    "src/prisma/contract.json",
    "src/prisma/contract.d.ts",
    "migrations/snapshots/**/contract.json",
    "migrations/snapshots/**/contract.d.ts",
  ]),
]);

export default eslintConfig;

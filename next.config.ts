import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // isomorphic-dompurify (content sanitization, src/lib/content/render.ts)
  // pulls in jsdom, which Turbopack/webpack otherwise try to bundle for the
  // client and fail on jsdom's optional `canvas` peer dependency. Both are
  // server-only anyway (render.ts is guarded with `import "server-only"`),
  // so keep them out of the bundle entirely.
  serverExternalPackages: ["isomorphic-dompurify", "jsdom"],
};

export default nextConfig;

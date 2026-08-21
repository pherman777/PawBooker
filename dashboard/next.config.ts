import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app lives in a subdirectory of the PawBooker (Expo) repo, which has
  // its own root-level package-lock.json - without this, Next.js's lockfile
  // auto-detection picks that as the workspace root instead of this
  // directory, which is wrong (this app has its own separate node_modules).
  turbopack: {
    root: path.join(__dirname),
  },
  // "localhost" itself always redirects "/" to "/dashboard" (see middleware.ts -
  // it's reserved for testing the real signed-in app). *.localhost subdomains
  // resolve to 127.0.0.1 natively in every browser with no /etc/hosts edit, and
  // aren't caught by that redirect, so this is how the marketing homepage gets
  // viewed locally - visit http://dev.localhost:3000/ instead of localhost.
  allowedDevOrigins: ["dev.localhost"],
};

export default nextConfig;

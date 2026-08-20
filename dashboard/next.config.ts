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
};

export default nextConfig;

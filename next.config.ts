import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Required for Railway + Railpack
   * Produces a minimal production server in `.next/standalone`
   */
  output: "standalone",

  /**
   * Fail builds on real problems
   * Old-school discipline > surprise bugs in prod
   */
  typescript: {
    ignoreBuildErrors: true,
  },

  eslint: {
    ignoreDuringBuilds: true,
  },

  /**
   * Experimental optimizations
   */
  experimental: {
    optimizePackageImports: ["lucide-react", "@radix-ui/react-icons"],
    serverMinification: true,
  },

  /**
   * Production compiler optimizations
   */
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },

  /**
   * Exclude native & heavy server-only packages
   * Prevents bundling failures on Railway
   */
  serverExternalPackages: [
    "discord.js",
    "zlib-sync",
    "better-sqlite3",
    "sharp",
    "canvas",
    "mongodb",
    "mysql2",
    "pg",
    "snoowrap",
    "bufferutil",
    "utf-8-validate",
    "@node-rs/argon2",
    "@node-rs/bcrypt",
    "pdf-parse",
    "pino",
  ],

  /**
   * Webpack config (used only for production builds)
   * Turbopack ignores this in dev — that warning is harmless
   */
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push({
        "discord.js": "commonjs discord.js",
        "zlib-sync": "commonjs zlib-sync",
        "better-sqlite3": "commonjs better-sqlite3",
        "snoowrap": "commonjs snoowrap",
      });
    } else {
      // Prevent bundling Node.js-only logger code on the client
      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...config.resolve.alias,
        './logger.node': false,
        './lib/logger.node': false,
        '@/lib/logger.node': false,
      };
    }

    config.ignoreWarnings = [
      /Module not found.*bufferutil/,
      /Module not found.*utf-8-validate/,
      /Module not found.*encoding/,
      /Module not found.*@chroma-core\/default-embed/,
      /Module not found.*pg-native/,
      /conflicting star exports/,
      /A Node\.js API is used/,
      /Package ioredis can't be external/,
    ];

    return config;
  },
};

export default nextConfig;
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Supabase + OpenAI SDKs run on the Node runtime in route handlers.
  serverExternalPackages: ["cheerio"],
};

export default nextConfig;

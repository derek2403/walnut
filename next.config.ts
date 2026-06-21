import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // These have native bindings / WASM and must not be bundled into server routes.
  serverExternalPackages: [
    "node-llama-cpp",
    "@node-llama-cpp/mac-arm64-metal",
    "@mysten/walrus",
    "@mysten/walrus-wasm",
  ],
};

export default nextConfig;

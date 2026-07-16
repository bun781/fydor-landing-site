import type { NextConfig } from "next";
const nextConfig: NextConfig = { turbopack: { root: __dirname }, async redirects() { return [{ source: "/index.html", destination: "/", permanent: true }, { source: "/about.html", destination: "/about", permanent: true }, { source: "/library.html", destination: "/library", permanent: true }]; } };
export default nextConfig;

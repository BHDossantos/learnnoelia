/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  // Clean, store-friendly URLs for the legal pages (App Store / Play ask for a
  // privacy policy URL; shorter is better).
  async redirects() {
    return [
      { source: "/privacy", destination: "/legal/privacy", permanent: true },
      { source: "/terms", destination: "/legal/terms", permanent: true },
    ];
  },
};
export default nextConfig;

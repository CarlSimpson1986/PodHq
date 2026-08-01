import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const isProd = process.env.NODE_ENV === "production";

// Content-Security-Policy is set per-request in src/proxy.ts instead of
// here — it needs a fresh nonce on every request (see proxy.ts for why),
// which a static config value can't provide.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

const withPWA = withPWAInit({
  dest: "public",
  disable: !isProd,
  register: true,
  workboxOptions: {
    disableDevLogs: true,
  },
});

export default withPWA(nextConfig);

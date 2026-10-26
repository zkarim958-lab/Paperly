/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Basic hardening headers. No Content-Security-Policy on purpose: AdSense loads
  // scripts and frames from many Google domains, so add a CSP only after testing it with ads on.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  webpack: (config) => {
    // pdfjs-dist optionally requires the Node-only "canvas" package. We only
    // run it in the browser, so tell webpack to ignore it.
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    config.experiments = { ...config.experiments, topLevelAwait: true };
    return config;
  },
};

export default nextConfig;

// Lets `next dev` use Cloudflare bindings locally. Ignored if the package isn't installed.
if (process.env.NODE_ENV === "development") {
  try {
    const { initOpenNextCloudflareForDev } = await import("@opennextjs/cloudflare");
    initOpenNextCloudflareForDev();
  } catch {
    /* not using Cloudflare */
  }
}

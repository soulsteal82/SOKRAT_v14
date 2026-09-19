import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  webpack: (config: any, { isServer }: { isServer: boolean }) => {
    if (isServer) {
      // Prevent Leaflet from being bundled on the server
      config.externals = [...(config.externals || []), 'leaflet', 'react-leaflet'];
    }
    return config;
  },
};

export default nextConfig;
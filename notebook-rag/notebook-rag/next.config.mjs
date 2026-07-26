/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdf-parse ships a test harness that must not be bundled by webpack.
  webpack: (config) => {
    config.externals = [...(config.externals || []), 'pdf-parse'];
    return config;
  },
};
export default nextConfig;

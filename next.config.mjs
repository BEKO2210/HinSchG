/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Erzeugt eine schlanke, eigenstaendige Server-Ausgabe fuer den Docker-Multi-Stage-Build.
  output: 'standalone',
};

export default nextConfig;

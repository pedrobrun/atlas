/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @northwind/contracts ships TypeScript sources, so Next must compile it.
  transpilePackages: ['@northwind/contracts'],
  poweredByHeader: false,
  async redirects() {
    return [{ source: '/', destination: '/requests', permanent: false }];
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // firebase-admin pulls in @grpc/grpc-js and google-gax, which ship native
  // bindings / dynamic requires that Next's server bundler doesn't handle
  // well when inlined. Keeping it external makes it load like a normal
  // Node.js dependency at runtime instead of being bundled.
  serverExternalPackages: ["firebase-admin"],
};
export default nextConfig;

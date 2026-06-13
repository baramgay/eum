/** @type {import('next').NextConfig} */
const config = {
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000'] },
  },
}

module.exports = config

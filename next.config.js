/** @type {import('next').NextConfig} */
const config = {
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3001'] },
  },
}

module.exports = config

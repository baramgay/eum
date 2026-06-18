import { cleanupTestUsers } from './helpers/auth'

export default function globalTeardown() {
  cleanupTestUsers()
}

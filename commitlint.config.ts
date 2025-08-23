import type { UserConfig } from '@commitlint/types'

const Configuration: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  // Add project-specific commit rules here if needed
}

module.exports = Configuration



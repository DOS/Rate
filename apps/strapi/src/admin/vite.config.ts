import { mergeConfig } from "vite"
import type { UserConfig } from "vite"

export default (config: UserConfig) => {
  return mergeConfig(config, {
    // No custom HTML injection to avoid 404 runtime errors
    resolve: {
      alias: {
        "@": "/src",
      },
    },
    optimizeDeps: {
      include: ['prismjs'],
    },
  } as UserConfig)
}
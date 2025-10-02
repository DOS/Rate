const localUploadConfig: any = {
  // Local provider setup
  // https://docs.strapi.io/dev-docs/plugins/upload
  sizeLimit: 250 * 1024 * 1024, // 256mb in bytes,
}

const prepareAwsS3Config = (env: any) => {
  const awsAccessKeyId = env("AWS_ACCESS_KEY_ID")
  const awsAccessSecret = env("AWS_ACCESS_SECRET")
  const awsRegion = env("AWS_REGION")
  const awsBucket = env("AWS_BUCKET")
  const awsRequirements = [
    awsAccessKeyId,
    awsAccessSecret,
    awsRegion,
    awsBucket,
  ]
  const awsRequirementsOk = awsRequirements.every(
    (req) => req != null && req !== ""
  )

  if (awsRequirementsOk) {
    return {
      provider: "aws-s3",
      providerOptions: {
        baseUrl: env("CDN_URL"),
        rootPath: env("CDN_ROOT_PATH"),
        s3Options: {
          credentials: {
            accessKeyId: awsAccessKeyId,
            secretAccessKey: awsAccessSecret,
          },
          region: awsRegion,
          params: {
            ACL: env("AWS_ACL", "public-read"),
            signedUrlExpires: env("AWS_SIGNED_URL_EXPIRES", 15 * 60),
            Bucket: awsBucket,
          },
        },
      },
      actionOptions: {
        upload: {},
        uploadStream: {},
        delete: {},
      },
    }
  }

  return undefined
}

export default ({ env }: any) => {
  const awsS3Config = prepareAwsS3Config(env)
  if (!awsS3Config) {
    console.info(
      "AWS S3 upload configuration is not complete. Local file storage will be used."
    )
  }

  return {
    upload: {
      config: awsS3Config ?? localUploadConfig,
    },

    // seo: {
    //   enabled: true,
    // },

    // "config-sync": {
    //   enabled: true,
    // },

    // "strapi-v5-plugin-populate-deep": {
    //   config: {
    //     defaultDepth: 5,
    //   },
    // },

    // Configure Redis plugin first (required for rest-cache redis provider)
    redis: {
      config: {
        connections: {
          default: {
            connection: {
              host: 'localhost',
              port: 6379,
              db: 0,
              // Redis connection settings
              connectTimeout: 10000,
              maxRetriesPerRequest: 3,
              enableOfflineQueue: false,
              lazyConnect: false,
              retryStrategy: (times: number) => {
                if (times > 3) {
                  // Stop retrying after 3 attempts
                  return undefined;
                }
                // Wait 1 second before retrying
                return Math.min(times * 1000, 3000);
              },
            },
            settings: {
              debug: false,
            },
          },
        },
      },
    },

    // REST Cache plugin configuration with Redis
    // TEMPORARILY DISABLED: provider-rest-cache-redis v5.0.0 has bug "Keyv is not a constructor"
    // Will re-enable when package is fixed or downgrade to compatible version
    // "rest-cache": {
    //   config: {
    //     provider: {
    //       name: "redis",
    //       options: {
    //         max: 32767,
    //         connection: "default",
    //       },
    //     },
    //     strategy: {
    //       keysPrefix: "strapi-cache:",
    //       contentTypes: [
    //         "api::listing.listing",
    //         "api::category.category",
    //         "api::review.review",
    //         "api::item.item",
    //         "api::platform.platform",
    //       ],
    //     },
    //   },
    // },

    "users-permissions": {
      config: {
        jwt: {
          expiresIn: "30d", // this value is synced with NextAuth session maxAge
        },
      },
    },

    // sentry: {
    //   enabled: true,
    //   config: {
    //     // Only set `dsn` property in production
    //     dsn: env("NODE_ENV") === "production" ? env("SENTRY_DSN") : null,
    //     sendMetadata: true,
    //   }
    // },

    // 'smart-component-filter': {
    //   enabled: false,
    //   resolve: './src/plugins/smart-component-filter'
    // },

    // email: {
    //   config: {
    //     provider: "mailgun",
    //     providerOptions: {
    //       key: env("MAILGUN_API_KEY"),
    //       domain: env("MAILGUN_DOMAIN"),
    //       url: env("MAILGUN_HOST", "https://api.eu.mailgun.net"),
    //     },
    //     settings: {
    //       defaultFrom: env("MAILGUN_EMAIL"),
    //       defaultReplyTo: env("MAILGUN_EMAIL"),
    //     },
    //   },
    // },
  }
}

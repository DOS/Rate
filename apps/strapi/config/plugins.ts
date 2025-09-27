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

    redis: {
      enabled: true,
      config: {
        connection: {
          host: "localhost",
          port: 6379,
          db: 0,
        },
        settings: {
          debug: false,
        },
      },
    },

    "rest-cache": {
      enabled: true,
      config: {
        provider: {
          name: "redis",
          options: {
            max: 32767,
            ttl: 3600000, // 1 hour in milliseconds
            connection: "default",
          },
        },
        strategy: {
          contentTypes: [
            // List of content types to cache
            {
              contentType: "api::listing.listing",
              maxAge: 3600000, // 1 hour
              hitPass: false,
              keys: {
                useQueryParams: true,
                useHeaders: ["Accept-Language"],
              },
              plugins: ["users-permissions"],
            },
            {
              contentType: "api::category.category",
              maxAge: 86400000, // 24 hours
              hitPass: false,
              keys: {
                useQueryParams: true,
                useHeaders: ["Accept-Language"],
              },
              plugins: ["users-permissions"],
            },
            {
              contentType: "api::review.review",
              maxAge: 1800000, // 30 minutes
              hitPass: false,
              keys: {
                useQueryParams: true,
                useHeaders: ["Accept-Language"],
              },
              plugins: ["users-permissions"],
            },
            {
              contentType: "api::item.item",
              maxAge: 3600000, // 1 hour
              hitPass: false,
              keys: {
                useQueryParams: true,
                useHeaders: ["Accept-Language"],
              },
              plugins: ["users-permissions"],
            },
            {
              contentType: "api::platform.platform",
              maxAge: 86400000, // 24 hours
              hitPass: false,
              keys: {
                useQueryParams: true,
                useHeaders: ["Accept-Language"],
              },
              plugins: ["users-permissions"],
            },
          ],
          debug: env("NODE_ENV") === "development",
          clearRelatedCache: true,
          keysPrefix: "strapi-cache:",
        },
      },
    },

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

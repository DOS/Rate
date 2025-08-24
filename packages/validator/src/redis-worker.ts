import Redis from 'ioredis';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

interface ValidationRequest {
  request_id: string;
  source: string;
  user_id: string;
  action: string;
  data: {
    items: Array<{
      // Scam data fields
      phone?: string;
      bank_account?: string;
      email?: string;
      name?: string;
      
      // Review/Product data fields
      type?: 'review' | 'product' | 'scam';
      source?: string;
      review?: {
        username?: string;
        comment?: string;
        starRate?: number;
        avatar?: string;
        images?: string[];
        videos?: string[];
        product?: any;
        [key: string]: any;
      };
      product?: {
        productName?: string;
        productId?: string;
        price?: number;
        sellerName?: string;
        brand?: string;
        [key: string]: any;
      };
      url?: string;
      crawledAt?: string;
      [key: string]: any;
    }>;
  };
  priority: string;
  callback_config: {
    stream?: string;
    webhook_url?: string;
  };
  timestamp: string;
}

interface ValidationResult {
  status: 'success' | 'error' | 'partial';
  original: any;
  normalized: any;
  errors: Array<{
    error_code: number;
    message: string;
    field?: string;
  }>;
}

class DataValidator {
  static validatePhone(phone: string): ValidationResult['errors'][0] | { valid: true; normalized: string } {
    if (!phone) {
      return { error_code: 100, message: 'Missing phone number', field: 'phone' };
    }

    // Remove spaces and special characters
    let phoneClean = phone.replace(/[\s\-\.\(\)]/g, '');

    // Handle country code
    if (phoneClean.startsWith('+84')) {
      phoneClean = '0' + phoneClean.slice(3);
    } else if (phoneClean.startsWith('84')) {
      phoneClean = '0' + phoneClean.slice(2);
    }

    // Validate Vietnamese phone format
    if (phoneClean.length < 10) {
      return { 
        error_code: 101, 
        message: `Phone number too short: ${phoneClean.length} chars, minimum 10`,
        field: 'phone'
      };
    }

    const vietnamesePhoneRegex = /^0[3|5|7|8|9]\d{8}$/;
    if (!vietnamesePhoneRegex.test(phoneClean)) {
      return { error_code: 102, message: 'Invalid Vietnamese phone format', field: 'phone' };
    }

    return { valid: true, normalized: phoneClean };
  }

  static validateBankAccount(account: string): ValidationResult['errors'][0] | { valid: true; normalized: string } {
    if (!account) {
      return { error_code: 200, message: 'Missing bank account', field: 'bank_account' };
    }

    const accountClean = account.replace(/[\s\-]/g, '');

    if (accountClean.length < 8) {
      return { 
        error_code: 201, 
        message: `Bank account too short: ${accountClean.length} chars, minimum 8`,
        field: 'bank_account'
      };
    }

    if (!/^\d+$/.test(accountClean)) {
      return { error_code: 202, message: 'Bank account must contain only digits', field: 'bank_account' };
    }

    return { valid: true, normalized: accountClean };
  }

  static validateEmail(email: string): ValidationResult['errors'][0] | { valid: true; normalized: string | null } {
    if (!email) {
      return { valid: true, normalized: null }; // Email is optional
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email.toLowerCase())) {
      return { error_code: 300, message: 'Invalid email format', field: 'email' };
    }

    return { valid: true, normalized: email.toLowerCase() };
  }

  static validateName(name: string): ValidationResult['errors'][0] | { valid: true; normalized: string | null } {
    if (!name) {
      return { valid: true, normalized: null }; // Name is optional
    }

    const nameClean = name.trim();
    if (nameClean.length < 2) {
      return { 
        error_code: 400, 
        message: `Name too short: ${nameClean.length} chars, minimum 2`,
        field: 'name'
      };
    }

    return { valid: true, normalized: nameClean };
  }
}

export class RedisStreamWorker {
  private redis: Redis;
  private responseRedis: Redis;
  private pgPool: Pool;
  private consumerGroup: string;
  private consumerName: string;
  private streamKey: string;
  private responseStream: string;
  private importResponseStream: string;
  private running: boolean = true;
  private stats = {
    processed: 0,
    errors: 0,
    startTime: new Date()
  };

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    this.redis = new Redis(redisUrl);
    this.responseRedis = new Redis(redisUrl);
    
    this.streamKey = process.env.REDIS_STREAM || 'validation_requests';
    this.responseStream = process.env.RESPONSE_STREAM || 'extension_responses';
    this.importResponseStream = process.env.IMPORT_RESPONSE_STREAM || 'importer_responses';
    this.consumerGroup = process.env.CONSUMER_GROUP || 'validator_workers';
    this.consumerName = process.env.CONSUMER_NAME || `worker_${uuidv4().slice(0, 8)}`;

    // Parse connection details separately to handle special characters in password
    const dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'rate_db',
      user: process.env.DB_USER || 'JOY',
      password: process.env.DB_PASSWORD || '***REMOVED-SECRET***',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };

    this.pgPool = new Pool(dbConfig);

    // Setup error handlers
    this.redis.on('error', (err) => console.error('Redis error:', err));
    this.responseRedis.on('error', (err) => console.error('Response Redis error:', err));
  }

  async init(): Promise<void> {
    try {
      // Create consumer group if not exists
      await this.redis.xgroup('CREATE', this.streamKey, this.consumerGroup, '0', 'MKSTREAM')
        .catch((err) => {
          if (!err.message.includes('BUSYGROUP')) throw err;
          console.log('Consumer group already exists');
        });

      // Ensure database schema
      await this.ensureDatabaseSchema();

      console.log(`Worker ${this.consumerName} initialized successfully`);
    } catch (error) {
      console.error('Failed to initialize worker:', error);
      throw error;
    }
  }

  private async ensureDatabaseSchema(): Promise<void> {
    const client = await this.pgPool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS validated_items (
          id SERIAL PRIMARY KEY,
          request_id VARCHAR(100),
          
          -- Item type
          item_type VARCHAR(20),
          
          -- Scam data fields
          phone VARCHAR(20),
          bank_account VARCHAR(50),
          email VARCHAR(255),
          name VARCHAR(255),
          
          -- Review data fields
          username VARCHAR(255),
          comment TEXT,
          star_rate INTEGER,
          images_count INTEGER,
          videos_count INTEGER,
          
          -- Product data fields
          product_name TEXT,
          product_id VARCHAR(100),
          seller_name VARCHAR(255),
          brand VARCHAR(100),
          price DECIMAL(15,2),
          
          -- Common fields
          url TEXT,
          crawled_at TIMESTAMPTZ,
          source VARCHAR(100),
          status VARCHAR(20) DEFAULT 'pending',
          error_message TEXT,
          error_code INTEGER,
          validation_errors JSONB,
          raw_data JSONB,
          
          -- Processing metadata
          stream_id VARCHAR(100),
          stream_timestamp TIMESTAMPTZ,
          consumer_name VARCHAR(100),
          processing_duration_ms INTEGER,
          retry_count INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Create indexes
      await client.query('CREATE INDEX IF NOT EXISTS idx_validated_items_status ON validated_items(status)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_validated_items_request_id ON validated_items(request_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_validated_items_type ON validated_items(item_type)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_validated_items_product ON validated_items(product_id)');
      
      console.log('Database schema verified');
    } finally {
      client.release();
    }
  }

  private async validateItem(item: any): Promise<ValidationResult> {
    const errors: ValidationResult['errors'] = [];
    const normalized: any = {};

    // Determine item type
    const itemType = item.type || (item.review ? 'review' : item.product ? 'product' : 'scam');
    normalized.type = itemType;

    switch (itemType) {
      case 'review':
        // Validate review data
        if (item.review) {
          const review = item.review;
          
          // Validate username (optional - can be masked)
          if (review.username) {
            normalized.username = review.username;
            // Don't validate masked usernames like "h****."
            if (!review.username.includes('*') && review.username.length < 2) {
              errors.push({ error_code: 500, message: 'Review username too short', field: 'username' });
            }
          } else {
            normalized.username = null;
          }
          
          // Validate comment (optional - many reviews only have star rating)
          if (review.comment) {
            normalized.comment = review.comment.substring(0, 1000); // Limit comment length
            // Only validate if comment exists
            if (review.comment.length < 5) {
              errors.push({ error_code: 501, message: 'Review comment too short', field: 'comment' });
            }
          } else {
            // Comment is optional - some reviews only have star rating
            normalized.comment = null;
          }
          
          // Store product info
          if (review.product) {
            normalized.product_name = review.product.productName;
            normalized.product_id = review.product.productId;
            normalized.seller_name = review.product.sellerName;
            normalized.price = review.product.price;
          }
          
          // Store rating (this is usually always present)
          normalized.star_rate = review.starRate || 0;
          normalized.images_count = review.images?.length || 0;
          normalized.videos_count = review.videos?.length || 0;
        }
        
        // Store URL and crawl time
        normalized.url = item.url;
        normalized.crawled_at = item.crawledAt;
        break;
        
      case 'product':
        // Validate product data
        if (item.product) {
          const product = item.product;
          
          if (product.productName) {
            normalized.product_name = product.productName;
          } else {
            errors.push({ error_code: 600, message: 'Product missing name', field: 'productName' });
          }
          
          normalized.product_id = product.productId;
          normalized.price = product.price;
          normalized.seller_name = product.sellerName;
          normalized.brand = product.brand;
        }
        
        normalized.url = item.url;
        normalized.crawled_at = item.crawledAt;
        break;
        
      case 'scam':
      default:
        // Original scam data validation
        // Validate phone
        if (item.phone !== undefined) {
          const phoneResult = DataValidator.validatePhone(item.phone);
          if ('valid' in phoneResult && phoneResult.valid) {
            normalized.phone = phoneResult.normalized;
          } else {
            errors.push(phoneResult as ValidationResult['errors'][0]);
          }
        }

        // Validate bank account
        if (item.bank_account !== undefined) {
          const bankResult = DataValidator.validateBankAccount(item.bank_account);
          if ('valid' in bankResult && bankResult.valid) {
            normalized.bank_account = bankResult.normalized;
          } else {
            errors.push(bankResult as ValidationResult['errors'][0]);
          }
        }

        // Validate email
        if (item.email !== undefined) {
          const emailResult = DataValidator.validateEmail(item.email);
          if ('valid' in emailResult && emailResult.valid) {
            normalized.email = emailResult.normalized;
          } else {
            errors.push(emailResult as ValidationResult['errors'][0]);
          }
        }

        // Validate name
        if (item.name !== undefined) {
          const nameResult = DataValidator.validateName(item.name);
          if ('valid' in nameResult && nameResult.valid) {
            normalized.name = nameResult.normalized;
          } else {
            errors.push(nameResult as ValidationResult['errors'][0]);
          }
        }
        break;
    }

    return {
      status: errors.length > 0 ? 'error' : 'success',
      original: item,
      normalized,
      errors
    };
  }

  private async saveToDatabase(
    item: any,
    validationResult: ValidationResult,
    request: ValidationRequest,
    messageId: string,
    processingTime: number
  ): Promise<void> {
    const client = await this.pgPool.connect();
    try {
      const { normalized, errors, status } = validationResult;
      
      const errorMessage = errors.length > 0 
        ? errors.map(e => e.message).join('; ')
        : null;
      
      const errorCode = errors.length > 0 ? errors[0].error_code : null;

      await client.query(`
        INSERT INTO validated_items (
          request_id, item_type,
          phone, bank_account, email, name,
          username, comment, star_rate, images_count, videos_count,
          product_name, product_id, seller_name, brand, price,
          url, crawled_at,
          source, status,
          error_message, error_code, validation_errors, raw_data,
          stream_id, stream_timestamp, consumer_name,
          processing_duration_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
      `, [
        request.request_id,
        normalized.type || 'unknown',
        // Scam fields
        normalized.phone || null,
        normalized.bank_account || null,
        normalized.email || null,
        normalized.name || null,
        // Review fields
        normalized.username || null,
        normalized.comment || null,
        normalized.star_rate || null,
        normalized.images_count || null,
        normalized.videos_count || null,
        // Product fields
        normalized.product_name || null,
        normalized.product_id || null,
        normalized.seller_name || null,
        normalized.brand || null,
        normalized.price || null,
        // Common fields
        normalized.url || item.url || null,
        normalized.crawled_at ? new Date(normalized.crawled_at) : null,
        request.source,
        status,
        errorMessage,
        errorCode,
        errors.length > 0 ? JSON.stringify(errors) : null,
        JSON.stringify(item), // Store original data
        messageId,
        new Date(request.timestamp),
        this.consumerName,
        Math.round(processingTime * 1000)
      ]);
    } finally {
      client.release();
    }
  }

  private async sendResponse(
    stream: string,
    request: ValidationRequest,
    validatedItems: ValidationResult[],
    processingTime: number
  ): Promise<void> {
    const successItems = validatedItems.filter(v => v.status === 'success');
    const errorItems = validatedItems.filter(v => v.status === 'error');

    const response = {
      request_id: request.request_id,
      status: errorItems.length === 0 ? 'success' : (successItems.length > 0 ? 'partial' : 'error'),
      validated_count: successItems.length,
      error_count: errorItems.length,
      errors: errorItems.map(item => item.errors).flat(),
      processing_time: processingTime,
      timestamp: new Date().toISOString(),
      consumer: this.consumerName
    };

    await this.responseRedis.xadd(
      stream,
      '*',
      'data', JSON.stringify(response)
    );

    console.log(`Sent response for ${request.request_id} to ${stream}`);
  }

  private async processMessage(messageId: string, data: any): Promise<boolean> {
    const startTime = Date.now();

    try {
      // Parse the message
      let request: ValidationRequest;
      
      // Check if data is an array (Redis format)
      if (Array.isArray(data)) {
        // Redis returns data as array of key-value pairs
        const messageData: any = {};
        for (let i = 0; i < data.length; i += 2) {
          messageData[data[i]] = data[i + 1];
        }
        
        if (messageData.data) {
          // Message from Strapi service or test
          request = JSON.parse(messageData.data);
        } else {
          // Direct format
          request = messageData as ValidationRequest;
        }
      } else if (data.data) {
        // Message from Strapi service
        request = JSON.parse(data.data);
      } else {
        // Direct message format
        request = {
          request_id: data.request_id || messageId,
          source: data.source || 'unknown',
          user_id: data.user_id || 'anonymous',
          action: data.action || 'validate',
          data: data.data || { items: [] },
          priority: data.priority || 'normal',
          callback_config: data.callback_config || {},
          timestamp: data.timestamp || new Date().toISOString()
        };
      }

      console.log(`Processing request ${request.request_id} from ${request.source}`);

      // Process items
      const items = request.data.items || [];
      const validatedItems: ValidationResult[] = [];

      for (const item of items) {
        const validationResult = await this.validateItem(item);
        validatedItems.push(validationResult);

        // Save to database
        await this.saveToDatabase(
          item,
          validationResult,
          request,
          messageId,
          (Date.now() - startTime) / 1000
        );
      }

      // Send response to appropriate stream
      const responseStream = request.callback_config.stream ||
        (request.source === 'extension' ? this.responseStream : this.importResponseStream);

      await this.sendResponse(
        responseStream,
        request,
        validatedItems,
        (Date.now() - startTime) / 1000
      );

      this.stats.processed += items.length;
      console.log(`Processed ${items.length} items from request ${request.request_id}`);
      
      return true;
    } catch (error) {
      console.error(`Error processing message ${messageId}:`, error);
      this.stats.errors++;
      return false;
    }
  }

  async start(): Promise<void> {
    console.log(`Worker ${this.consumerName} starting...`);

    while (this.running) {
      try {
        // Read messages from stream
        const messages = await this.redis.xreadgroup(
          'GROUP', this.consumerGroup, this.consumerName,
          'COUNT', 10,
          'BLOCK', 1000,
          'STREAMS', this.streamKey, '>'
        );

        if (messages && messages.length > 0) {
          for (const [stream, streamMessages] of messages) {
            for (const [messageId, data] of streamMessages) {
              const success = await this.processMessage(messageId, data);
              
              if (success) {
                // Acknowledge the message
                await this.redis.xack(this.streamKey, this.consumerGroup, messageId);
              }
            }
          }
        }

        // Periodically claim pending messages
        if (this.stats.processed % 100 === 0) {
          await this.claimPendingMessages();
        }

      } catch (error) {
        console.error('Error in main loop:', error);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  private async claimPendingMessages(): Promise<void> {
    try {
      const minIdleTime = 300000; // 5 minutes

      // Get pending messages
      const pending = await this.redis.xpending(
        this.streamKey,
        this.consumerGroup,
        '-', '+', 10
      );

      if (pending && pending.length > 1) {
        const pendingMessages = pending.slice(1); // Skip the summary
        
        for (const [messageId, consumer, idleTime] of pendingMessages) {
          if (parseInt(idleTime) > minIdleTime) {
            // Claim the message
            const claimed = await this.redis.xclaim(
              this.streamKey,
              this.consumerGroup,
              this.consumerName,
              minIdleTime,
              messageId
            );

            if (claimed && claimed.length > 0) {
              console.log(`Claimed pending message: ${messageId}`);
              
              for (const [msgId, data] of claimed) {
                const success = await this.processMessage(msgId, data);
                if (success) {
                  await this.redis.xack(this.streamKey, this.consumerGroup, msgId);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error claiming pending messages:', error);
    }
  }

  async stop(): Promise<void> {
    console.log('Shutting down worker...');
    this.running = false;

    // Close connections
    await this.redis.quit();
    await this.responseRedis.quit();
    await this.pgPool.end();

    // Log final statistics
    const runtime = (Date.now() - this.stats.startTime.getTime()) / 1000;
    console.log(`Worker stats - Processed: ${this.stats.processed}, Errors: ${this.stats.errors}, Runtime: ${runtime.toFixed(2)}s`);
  }
}

// Main execution
if (require.main === module) {
  const worker = new RedisStreamWorker();

  // Handle shutdown signals
  process.on('SIGINT', async () => {
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await worker.stop();
    process.exit(0);
  });

  // Start the worker
  worker.init()
    .then(() => worker.start())
    .catch((error) => {
      console.error('Worker failed:', error);
      process.exit(1);
    });
}
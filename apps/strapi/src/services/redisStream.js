'use strict';

const Redis = require('redis');

class RedisStreamService {
  constructor() {
    this.client = null;
    this.connected = false;
    this.requestStream = 'validation_requests';
    this.responseStream = 'extension_responses';
    this.importResponseStream = 'importer_responses';
  }

  async connect() {
    if (this.connected) return;

    try {
      this.client = Redis.createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        socket: {
          reconnectStrategy: (retries) => Math.min(retries * 50, 5000)
        }
      });

      this.client.on('error', (err) => {
        strapi.log.error('Redis Client Error:', err);
      });

      this.client.on('connect', () => {
        strapi.log.info('Redis Stream Service: Connected to Redis');
      });

      this.client.on('ready', () => {
        strapi.log.info('Redis Stream Service: Ready');
        this.connected = true;
      });

      await this.client.connect();
    } catch (error) {
      strapi.log.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client && this.connected) {
      await this.client.quit();
      this.connected = false;
      strapi.log.info('Redis Stream Service: Disconnected');
    }
  }

  async publishValidationRequest(data, source = 'extension') {
    await this.ensureConnected();

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const message = {
      request_id: requestId,
      source,
      user_id: data.userId || 'anonymous',
      action: data.action || 'validate',
      data: {
        items: Array.isArray(data.items) ? data.items : [data.items]
      },
      priority: data.priority || 'normal',
      callback_config: {
        stream: source === 'extension' ? this.responseStream : this.importResponseStream,
        webhook_url: data.webhookUrl || null
      },
      timestamp: new Date().toISOString()
    };

    try {
      await this.client.xAdd(
        this.requestStream,
        '*',
        { data: JSON.stringify(message) }
      );

      strapi.log.info(`Published validation request: ${requestId}`);
      return { requestId, message };
    } catch (error) {
      strapi.log.error('Failed to publish validation request:', error);
      throw error;
    }
  }

  async subscribeToResponses(stream, callback, lastId = '$') {
    await this.ensureConnected();

    const consumerGroup = `strapi_${stream}_consumers`;
    const consumerName = `strapi_${process.pid}`;

    // Create consumer group if not exists
    try {
      await this.client.xGroupCreate(stream, consumerGroup, '$', {
        MKSTREAM: true
      });
    } catch (err) {
      // Group might already exist, that's OK
      if (!err.message.includes('BUSYGROUP')) {
        throw err;
      }
    }

    // Poll for messages
    const pollMessages = async () => {
      try {
        const messages = await this.client.xReadGroup(
          consumerGroup,
          consumerName,
          [{ key: stream, id: '>' }],
          { COUNT: 10, BLOCK: 1000 }
        );

        if (messages && messages.length > 0) {
          for (const streamMessages of messages) {
            for (const message of streamMessages.messages) {
              try {
                const data = JSON.parse(message.message.data);
                await callback(data);
                
                // Acknowledge message
                await this.client.xAck(stream, consumerGroup, message.id);
              } catch (err) {
                strapi.log.error('Error processing message:', err);
              }
            }
          }
        }
      } catch (err) {
        if (err.message && !err.message.includes('NOGROUP')) {
          strapi.log.error('Error reading from stream:', err);
        }
      }

      // Continue polling if still connected
      if (this.connected) {
        setImmediate(pollMessages);
      }
    };

    // Start polling
    pollMessages();
  }

  async getRequestStatus(requestId) {
    await this.ensureConnected();

    // Check in response streams for the request
    try {
      const extensionResponses = await this.client.xRange(
        this.responseStream,
        '-',
        '+',
        { COUNT: 1000 }
      );

      const importerResponses = await this.client.xRange(
        this.importResponseStream,
        '-',
        '+',
        { COUNT: 1000 }
      );

      const allResponses = [...extensionResponses, ...importerResponses];

      for (const response of allResponses) {
        try {
          const data = JSON.parse(response.message.data);
          if (data.request_id === requestId) {
            return data;
          }
        } catch (err) {
          // Skip invalid messages
        }
      }

      return null;
    } catch (error) {
      strapi.log.error('Failed to get request status:', error);
      throw error;
    }
  }

  async ensureConnected() {
    if (!this.connected) {
      await this.connect();
    }
  }
}

// Create singleton instance
const redisStreamService = new RedisStreamService();

module.exports = redisStreamService;

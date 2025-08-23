/**
 * Strapi API Client for Rate Extension
 * Handles communication with Strapi backend for validation requests
 */

class StrapiClient {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || 'http://localhost:1337';
    this.apiToken = config.apiToken || null;
    this.jwtToken = config.jwtToken || null;
    this.timeout = config.timeout || 30000; // 30 seconds default
  }

  /**
   * Set authentication token
   * @param {string} token - JWT or API token
   * @param {string} type - 'jwt' or 'api'
   */
  setAuthToken(token, type = 'jwt') {
    if (type === 'jwt') {
      this.jwtToken = token;
    } else {
      this.apiToken = token;
    }
  }

  /**
   * Get authentication headers
   * @returns {Object} Headers object with auth
   */
  getAuthHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (this.jwtToken) {
      headers['Authorization'] = `Bearer ${this.jwtToken}`;
    } else if (this.apiToken) {
      headers['Authorization'] = `Bearer ${this.apiToken}`;
    }

    return headers;
  }

  /**
   * Make HTTP request with retry logic
   * @param {string} url - Request URL
   * @param {Object} options - Fetch options
   * @param {number} retries - Number of retries
   * @returns {Promise<Response>}
   */
  async makeRequest(url, options = {}, retries = 3) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok && retries > 0) {
        console.warn(`Request failed with status ${response.status}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        return this.makeRequest(url, options, retries - 1);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }

      if (retries > 0) {
        console.warn(`Request error: ${error.message}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.makeRequest(url, options, retries - 1);
      }

      throw error;
    }
  }

  /**
   * Validate items through Strapi API
   * @param {Array|Object} items - Items to validate
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Validation response
   */
  async validate(items, options = {}) {
    const url = `${this.baseUrl}/api/validation/validate`;
    
    const body = {
      items: Array.isArray(items) ? items : [items],
      priority: options.priority || 'normal',
      webhookUrl: options.webhookUrl || null
    };

    try {
      const response = await this.makeRequest(url, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Validation request failed');
      }

      return data;
    } catch (error) {
      console.error('Validation error:', error);
      throw error;
    }
  }

  /**
   * Check validation request status
   * @param {string} requestId - Request ID to check
   * @returns {Promise<Object>} Status response
   */
  async getStatus(requestId) {
    if (!requestId) {
      throw new Error('Request ID is required');
    }

    const url = `${this.baseUrl}/api/validation/status/${requestId}`;

    try {
      const response = await this.makeRequest(url, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Status check failed');
      }

      return data;
    } catch (error) {
      console.error('Status check error:', error);
      throw error;
    }
  }

  /**
   * Batch validate multiple sets of items
   * @param {Array} batches - Array of batch objects
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Batch validation response
   */
  async batchValidate(batches, options = {}) {
    const url = `${this.baseUrl}/api/validation/batch`;
    
    const body = {
      batches: batches.map((batch, index) => ({
        id: batch.id || `batch_${index}`,
        items: batch.items,
        priority: batch.priority || options.priority || 'normal',
        webhookUrl: batch.webhookUrl || options.webhookUrl || null
      })),
      priority: options.priority || 'normal',
      webhookUrl: options.webhookUrl || null
    };

    try {
      const response = await this.makeRequest(url, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Batch validation request failed');
      }

      return data;
    } catch (error) {
      console.error('Batch validation error:', error);
      throw error;
    }
  }

  /**
   * Poll for validation result with timeout
   * @param {string} requestId - Request ID to poll
   * @param {Object} options - Polling options
   * @returns {Promise<Object>} Final result
   */
  async pollForResult(requestId, options = {}) {
    const maxAttempts = options.maxAttempts || 60; // 60 attempts = 5 minutes with 5s interval
    const interval = options.interval || 5000; // 5 seconds
    const onProgress = options.onProgress || (() => {});

    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const status = await this.getStatus(requestId);
        
        onProgress(status, attempts);

        if (status.status === 'completed' || status.status === 'error') {
          return status;
        }

        await new Promise(resolve => setTimeout(resolve, interval));
        attempts++;
      } catch (error) {
        console.error(`Polling error (attempt ${attempts}):`, error);
        attempts++;
        
        if (attempts >= maxAttempts) {
          throw new Error('Polling timeout exceeded');
        }
        
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }

    throw new Error('Polling timeout exceeded');
  }

  /**
   * Test connection to Strapi API
   * @returns {Promise<boolean>} Connection status
   */
  async testConnection() {
    try {
      const response = await this.makeRequest(`${this.baseUrl}/api`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      }, 1); // Only 1 retry for connection test

      return response.ok;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StrapiClient;
} else {
  window.StrapiClient = StrapiClient;
}

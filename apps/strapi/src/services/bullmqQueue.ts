/**
 * BullMQ Queue Service with Worker in same process
 * Using Worker with inline processor to maintain Strapi context
 */

import { Queue, QueueEvents, Job, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { Core } from '@strapi/strapi';
import { getValidationService } from './unifiedValidation';

// Connection config
const redisConnection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null, // Required for BullMQ
});

// Queue instances
let listingQueue: Queue;
let queueEvents: QueueEvents;
let worker: Worker;
let strapiInstance: Core.Strapi;

/**
 * Initialize BullMQ Queue with Worker in same process
 */
export async function initializeQueue(strapi: Core.Strapi): Promise<void> {
  try {
    // Store strapi instance for worker access
    strapiInstance = strapi;
    
    // Create queue
    listingQueue = new Queue('listing-import', {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: {
          age: 3600, // Keep completed jobs for 1 hour
          count: 100, // Keep last 100 completed jobs
        },
        removeOnFail: {
          age: 86400, // Keep failed jobs for 24 hours
          count: 50,
        },
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    // Create Worker with inline processor function that has access to strapi
    worker = new Worker(
      'listing-import',
      async (job: Job) => {
        const { data } = job;
        
        // Always use the stored strapi instance
        const strapi = strapiInstance;
        
        strapi.log.info(`[BullMQ] Processing job ${job.id} - ${data.source || 'unknown'}`);
        
        try {
          // Use validation service with strapi instance from closure
          const validationService = getValidationService(strapi);
          
          // Check if this is a batch of items
          if (data.items && Array.isArray(data.items)) {
            strapi.log.info(`[BullMQ] Processing batch of ${data.items.length} items`);
            
            const results = [];
            const totalItems = data.items.length;
            
            // Process each item separately
            for (let i = 0; i < data.items.length; i++) {
              const item = data.items[i];
              const progress = Math.floor((i / totalItems) * 90) + 10;
              await job.updateProgress(progress);
              
              try {
                // Create single item data structure
                const singleItemData = {
                  ...data,
                  items: [item] // Wrap single item in array for compatibility
                };
                
                // Validate single item
                const validationResult = await validationService.validate(singleItemData, data.source || 'queue');
                
                if (!validationResult.isValid) {
                  strapi.log.warn(`[BullMQ] Item ${i + 1} validation failed: ${validationResult.errors.join(', ')}`);
                  results.push({ 
                    success: false, 
                    itemIndex: i,
                    errors: validationResult.errors 
                  });
                  continue;
                }
                
                // Process validated item
                const result = await validationService.processValidatedData(validationResult);
                results.push({ 
                  success: true, 
                  itemIndex: i,
                  result 
                });
                
                strapi.log.info(`[BullMQ] Processed item ${i + 1}/${totalItems}`);
              } catch (itemError) {
                strapi.log.error(`[BullMQ] Error processing item ${i + 1}:`, itemError);
                results.push({ 
                  success: false, 
                  itemIndex: i,
                  error: (itemError as Error).message 
                });
              }
            }
            
            await job.updateProgress(100);
            strapi.log.info(`[BullMQ] Job ${job.id} completed - processed ${results.length} items`);
            
            return {
              totalItems: totalItems,
              processed: results.filter(r => r.success).length,
              failed: results.filter(r => !r.success).length,
              results
            };
          } else {
            // Single item processing (backward compatibility)
            await job.updateProgress(10);
            
            // Validate data
            const validationResult = await validationService.validate(data, data.source || 'queue');
            
            if (!validationResult.isValid) {
              throw new Error(`Validation failed: ${validationResult.errors.join(', ')}`);
            }
            
            await job.updateProgress(50);
            
            // Process validated data
            const result = await validationService.processValidatedData(validationResult);
            
            await job.updateProgress(100);
            
            strapi.log.info(`[BullMQ] Job ${job.id} completed successfully`);
            
            return result;
          }
        } catch (error) {
          strapi.log.error(`[BullMQ] Job ${job.id} failed:`, error);
          throw error;
        }
      },
      {
        connection: redisConnection,
        concurrency: 5, // Process up to 5 jobs concurrently
      }
    );

    // Worker event listeners
    worker.on('completed', (job) => {
      strapiInstance.log.info(`[BullMQ Worker] Job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
      strapiInstance.log.error(`[BullMQ Worker] Job ${job?.id} failed:`, err.message);
    });

    // Queue events for monitoring
    queueEvents = new QueueEvents('listing-import', {
      connection: redisConnection,
    });

    strapiInstance.log.info('[BullMQ] Queue and Worker initialized successfully');
    
  } catch (error) {
    strapiInstance.log.error('[BullMQ] Failed to initialize queue:', error);
    throw error;
  }
}

/**
 * Add job to queue
 */
export async function addJob(data: any, options: any = {}): Promise<Job> {
  if (!listingQueue) {
    throw new Error('Queue not initialized');
  }
  
  const job = await listingQueue.add('process-listing', data, {
    priority: options.priority || 0,
    delay: options.delay || 0,
    ...options,
  });
  
  strapiInstance.log.info(`[BullMQ] Job ${job.id} added to queue`);
  return job;
}

/**
 * Add bulk jobs
 */
export async function addBulkJobs(items: any[], options: any = {}): Promise<Job[]> {
  if (!listingQueue) {
    throw new Error('Queue not initialized');
  }
  
  const jobs = await listingQueue.addBulk(
    items.map((item, index) => ({
      name: 'process-listing',
      data: item,
      opts: {
        priority: options.priority || 0,
        delay: (options.delay || 0) + (index * 100), // Stagger by 100ms
        ...options,
      },
    }))
  );
  
  strapiInstance.log.info(`[BullMQ] Added ${jobs.length} jobs to queue`);
  return jobs;
}

/**
 * Get job by ID
 */
export async function getJob(jobId: string): Promise<Job | undefined> {
  if (!listingQueue) {
    throw new Error('Queue not initialized');
  }
  
  return await listingQueue.getJob(jobId);
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<any> {
  if (!listingQueue) {
    throw new Error('Queue not initialized');
  }
  
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    listingQueue.getWaitingCount(),
    listingQueue.getActiveCount(),
    listingQueue.getCompletedCount(),
    listingQueue.getFailedCount(),
    listingQueue.getDelayedCount(),
  ]);
  
  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed,
  };
}

/**
 * Clean old jobs
 */
export async function cleanQueue(grace: number = 3600000): Promise<void> {
  if (!listingQueue) {
    throw new Error('Queue not initialized');
  }
  
  const graceSec = Math.floor(grace / 1000);
  await listingQueue.clean(graceSec, 100, 'completed');
  await listingQueue.clean(graceSec, 100, 'failed');
  strapiInstance.log.info('[BullMQ] Queue cleaned');
}

/**
 * Pause/Resume queue
 */
export async function pauseQueue(): Promise<void> {
  if (!listingQueue) {
    throw new Error('Queue not initialized');
  }
  
  await listingQueue.pause();
  if (worker) {
    await worker.pause();
  }
  strapiInstance.log.info('[BullMQ] Queue and Worker paused');
}

export async function resumeQueue(): Promise<void> {
  if (!listingQueue) {
    throw new Error('Queue not initialized');
  }
  
  await listingQueue.resume();
  if (worker) {
    await worker.resume();
  }
  strapiInstance.log.info('[BullMQ] Queue and Worker resumed');
}

/**
 * Close queue connections
 */
export async function closeQueue(): Promise<void> {
  if (worker) {
    await worker.close();
  }
  if (queueEvents) {
    await queueEvents.close();
  }
  if (listingQueue) {
    await listingQueue.close();
  }
  await redisConnection.quit();
  strapiInstance.log.info('[BullMQ] Queue connections closed');
}

/**
 * Get queue instance for advanced usage
 */
export function getQueue(): Queue | null {
  return listingQueue;
}

/**
 * Health check
 */
export async function healthCheck(): Promise<boolean> {
  try {
    if (!listingQueue) return false;
    await listingQueue.getJobCounts();
    return true;
  } catch {
    return false;
  }
}
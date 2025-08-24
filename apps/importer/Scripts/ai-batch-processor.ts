#!/usr/bin/env node

/**
 * AI Batch Processor for Crawled Data
 * Processes crawled scam data with AI analysis before pushing to validation
 */

import fs from 'fs/promises';
import path from 'path';
import { ValidationPusherWithAI } from './push-to-validation-with-ai';
import type { ScamRecord, BatchMetadata } from './push-to-validation-with-ai';

interface ProcessorOptions {
  inputPath?: string;
  outputPath?: string;
  batchSize?: number;
  enableAI?: boolean;
  dryRun?: boolean;
  source?: string;
}

class AIBatchProcessor {
  private options: ProcessorOptions;
  private pusher: ValidationPusherWithAI;
  private processedCount: number = 0;
  private failedCount: number = 0;
  private startTime: number = Date.now();

  constructor(options: ProcessorOptions = {}) {
    this.options = {
      inputPath: options.inputPath || './Data/crawled',
      outputPath: options.outputPath || './Data/processed',
      batchSize: options.batchSize || 50,
      enableAI: options.enableAI !== false,
      dryRun: options.dryRun || false,
      source: options.source || 'checkscam.vn'
    };

    this.pusher = new ValidationPusherWithAI({
      enableAI: this.options.enableAI,
      batchSize: this.options.batchSize,
      aiConcurrency: 5
    });
  }

  async processDirectory(): Promise<void> {
    console.log('🚀 Starting AI Batch Processing');
    console.log('================================');
    console.log(`📁 Input directory: ${this.options.inputPath}`);
    console.log(`🤖 AI Analysis: ${this.options.enableAI ? 'Enabled' : 'Disabled'}`);
    console.log(`📦 Batch size: ${this.options.batchSize}`);
    console.log(`🏃 Mode: ${this.options.dryRun ? 'Dry Run' : 'Live Processing'}`);
    console.log('');

    try {
      // Get all JSON files from input directory
      const files = await this.getJsonFiles(this.options.inputPath!);
      
      if (files.length === 0) {
        console.log('❌ No JSON files found in input directory');
        return;
      }

      console.log(`📊 Found ${files.length} files to process`);
      console.log('');

      // Process each file
      for (const file of files) {
        await this.processFile(file);
      }

      // Final summary
      this.printSummary();

    } catch (error) {
      console.error('❌ Processing failed:', error);
      throw error;
    } finally {
      await this.pusher.close();
    }
  }

  private async getJsonFiles(dirPath: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const files: string[] = [];

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively get files from subdirectories
          const subFiles = await this.getJsonFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          files.push(fullPath);
        }
      }

      return files;
    } catch (error) {
      console.warn(`⚠️  Failed to read directory ${dirPath}:`, error);
      return [];
    }
  }

  private async processFile(filePath: string): Promise<void> {
    const fileName = path.basename(filePath);
    console.log(`📄 Processing: ${fileName}`);

    try {
      // Read and parse JSON file
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      // Convert to ScamRecord format
      const records = this.convertToScamRecords(data, filePath);
      
      if (records.length === 0) {
        console.log(`  ⚠️  No valid records found in ${fileName}`);
        return;
      }

      console.log(`  📝 Found ${records.length} records`);

      // Create batch metadata
      const metadata: BatchMetadata = {
        batchId: `batch_${path.basename(fileName, '.json')}_${Date.now()}`,
        source: this.options.source!,
        timestamp: new Date().toISOString(),
        totalRecords: records.length
      };

      // Process batch (with or without AI)
      if (!this.options.dryRun) {
        await this.pusher.pushBatch(records, metadata);
        this.processedCount += records.length;

        // Move processed file to output directory
        await this.moveProcessedFile(filePath);
        console.log(`  ✅ Successfully processed ${records.length} records`);
      } else {
        console.log(`  🔍 [DRY RUN] Would process ${records.length} records`);
        this.processedCount += records.length;
      }

    } catch (error) {
      console.error(`  ❌ Failed to process ${fileName}:`, error);
      this.failedCount++;
      
      // Move failed file to error directory
      if (!this.options.dryRun) {
        await this.moveFailedFile(filePath);
      }
    }

    console.log('');
  }

  private convertToScamRecords(data: any, filePath: string): ScamRecord[] {
    const records: ScamRecord[] = [];

    // Handle different data formats
    if (Array.isArray(data)) {
      // Direct array of records
      for (const item of data) {
        const record = this.parseRecord(item, filePath);
        if (record) records.push(record);
      }
    } else if (data.data && Array.isArray(data.data)) {
      // Wrapped in data property
      for (const item of data.data) {
        const record = this.parseRecord(item, filePath);
        if (record) records.push(record);
      }
    } else if (data.records && Array.isArray(data.records)) {
      // Wrapped in records property
      for (const item of data.records) {
        const record = this.parseRecord(item, filePath);
        if (record) records.push(record);
      }
    } else {
      // Single record
      const record = this.parseRecord(data, filePath);
      if (record) records.push(record);
    }

    return records;
  }

  private parseRecord(item: any, filePath: string): ScamRecord | null {
    try {
      // Extract relevant fields based on common patterns
      return {
        id: item.id || item._id || undefined,
        url: item.url || item.link || item.website || '',
        title: item.title || item.name || item.subject || '',
        description: item.description || item.content || item.details || '',
        category: this.extractCategory(item),
        reportCount: item.reportCount || item.reports || item.report_count || 0,
        lastReported: item.lastReported || item.last_reported || item.date || new Date().toISOString(),
        status: item.status || 'pending',
        tags: this.extractTags(item),
        metadata: {
          source: this.options.source!,
          crawledAt: item.crawledAt || item.crawled_at || new Date().toISOString(),
          batch: path.basename(filePath, '.json'),
          originalData: item
        }
      };
    } catch (error) {
      console.warn('  ⚠️  Failed to parse record:', error);
      return null;
    }
  }

  private extractCategory(item: any): string {
    // Try to determine category from various fields
    if (item.category) return item.category;
    if (item.type) return item.type;
    
    // Check for phone-related content
    if (item.phone || item.phoneNumber || item.phone_number) {
      return 'phone';
    }
    
    // Check for transaction-related content
    if (item.transaction || item.payment || item.banking) {
      return 'financial';
    }
    
    // Check for review-related content
    if (item.review || item.rating || item.feedback) {
      return 'review';
    }
    
    return 'other';
  }

  private extractTags(item: any): string[] {
    const tags: string[] = [];
    
    // Direct tags
    if (Array.isArray(item.tags)) {
      tags.push(...item.tags);
    }
    
    // Keywords
    if (Array.isArray(item.keywords)) {
      tags.push(...item.keywords);
    }
    
    // Auto-generate tags based on content
    const content = (item.title || '') + ' ' + (item.description || '');
    
    // Vietnamese scam keywords
    const scamKeywords = [
      'lừa đảo', 'OTP', 'chuyển tiền', 'trúng thưởng',
      'ngân hàng', 'visa', 'mastercard', 'vay tiền'
    ];
    
    for (const keyword of scamKeywords) {
      if (content.toLowerCase().includes(keyword.toLowerCase())) {
        tags.push(keyword.replace(' ', '_'));
      }
    }
    
    return [...new Set(tags)]; // Remove duplicates
  }

  private async moveProcessedFile(filePath: string): Promise<void> {
    try {
      const fileName = path.basename(filePath);
      const outputDir = path.join(this.options.outputPath!, 'processed');
      const outputPath = path.join(outputDir, fileName);

      // Create output directory if it doesn't exist
      await fs.mkdir(outputDir, { recursive: true });

      // Move file
      await fs.rename(filePath, outputPath);
      console.log(`  📁 Moved to: ${outputPath}`);
    } catch (error) {
      console.warn(`  ⚠️  Failed to move processed file:`, error);
    }
  }

  private async moveFailedFile(filePath: string): Promise<void> {
    try {
      const fileName = path.basename(filePath);
      const errorDir = path.join(this.options.outputPath!, 'errors');
      const errorPath = path.join(errorDir, fileName);

      // Create error directory if it doesn't exist
      await fs.mkdir(errorDir, { recursive: true });

      // Move file
      await fs.rename(filePath, errorPath);
      console.log(`  📁 Moved to error directory: ${errorPath}`);
    } catch (error) {
      console.warn(`  ⚠️  Failed to move error file:`, error);
    }
  }

  private printSummary(): void {
    const duration = (Date.now() - this.startTime) / 1000;
    
    console.log('');
    console.log('================================');
    console.log('📊 Processing Summary');
    console.log('================================');
    console.log(`✅ Processed: ${this.processedCount} records`);
    console.log(`❌ Failed: ${this.failedCount} files`);
    console.log(`⏱️  Duration: ${duration.toFixed(2)} seconds`);
    console.log(`🚀 Rate: ${(this.processedCount / duration).toFixed(2)} records/second`);
    
    if (this.options.enableAI) {
      console.log('');
      console.log('🤖 AI Analysis enabled - check metrics above');
    }
    
    if (this.options.dryRun) {
      console.log('');
      console.log('⚠️  This was a DRY RUN - no data was actually processed');
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const options: ProcessorOptions = {
    inputPath: './Data/crawled',
    outputPath: './Data/processed',
    batchSize: 50,
    enableAI: true,
    dryRun: false,
    source: 'checkscam.vn'
  };

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input':
      case '-i':
        options.inputPath = args[++i];
        break;
      
      case '--output':
      case '-o':
        options.outputPath = args[++i];
        break;
      
      case '--batch-size':
      case '-b':
        options.batchSize = parseInt(args[++i], 10);
        break;
      
      case '--no-ai':
        options.enableAI = false;
        break;
      
      case '--dry-run':
      case '-d':
        options.dryRun = true;
        break;
      
      case '--source':
      case '-s':
        options.source = args[++i];
        break;
      
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
        break;
      
      default:
        if (args[i].startsWith('-')) {
          console.error(`Unknown option: ${args[i]}`);
          showHelp();
          process.exit(1);
        }
    }
  }

  // Run processor
  const processor = new AIBatchProcessor(options);
  
  try {
    await processor.processDirectory();
    process.exit(0);
  } catch (error) {
    console.error('Processing failed:', error);
    process.exit(1);
  }
}

function showHelp() {
  console.log(`
AI Batch Processor for Crawled Data
====================================

Usage: node ai-batch-processor.js [options]

Options:
  -i, --input <path>      Input directory with crawled JSON files (default: ./Data/crawled)
  -o, --output <path>     Output directory for processed files (default: ./Data/processed)
  -b, --batch-size <n>    Number of records per batch (default: 50)
  -s, --source <name>     Source identifier (default: checkscam.vn)
  --no-ai                 Disable AI analysis
  -d, --dry-run          Run without actually processing data
  -h, --help             Show this help message

Examples:
  # Process all files with AI analysis
  node ai-batch-processor.js

  # Process specific directory without AI
  node ai-batch-processor.js -i ./Data/new-crawls --no-ai

  # Dry run to test processing
  node ai-batch-processor.js --dry-run

  # Process with custom batch size
  node ai-batch-processor.js -b 100 -s "custom-source"
`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { AIBatchProcessor };
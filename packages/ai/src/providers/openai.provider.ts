/**
 * OpenAI Provider Implementation
 * MVP implementation using GPT-5 for advanced scam detection
 */

import OpenAI from 'openai';
import {
  AIProvider,
  AnalysisResult,
  SpamCheckData,
  SpamResult,
  FakeReviewResult,
  SentimentResult,
  ScamCategory,
  Severity,
  Sentiment,
  AIServiceError,
  RateLimitError
} from '../types';

export class OpenAIProvider implements AIProvider {
  name = 'openai';
  private client: OpenAI;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(config: {
    apiKey: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }) {
    if (!config.apiKey) {
      throw new AIServiceError('OpenAI API key is required', 'MISSING_API_KEY');
    }

    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model || 'gpt-5-mini'; // Using GPT-5-mini for best balance of cost & performance
    this.temperature = config.temperature || 0.3;
    this.maxTokens = config.maxTokens || 2000; // Increased for GPT-5
  }

  async analyze(text: string): Promise<AnalysisResult> {
    const startTime = Date.now();
    
    const systemPrompt = `You are an expert anti-scam AI assistant specialized in detecting Vietnamese and international scams.
    
    Analyze the following text and return a JSON response with these exact fields:
    {
      "isScam": boolean,
      "confidence": number (0.0 to 1.0),
      "category": "financial" | "phishing" | "fake_goods" | "identity_theft" | "romance_scam" | "tech_support" | "investment" | "other",
      "indicators": string[] (specific scam indicators found, in Vietnamese or English),
      "sentiment": "positive" | "negative" | "neutral",
      "explanation": string (brief explanation in Vietnamese if text is Vietnamese, otherwise in English)
    }
    
    Consider these Vietnamese-specific scam patterns:
    - Banking/financial scams: "chuyển tiền", "OTP", "mã xác thực", "thẻ ngân hàng", "vay tiền"
    - Urgency tactics: "khẩn cấp", "ngay lập tức", "còn 24h", "hết hạn"
    - Authority impersonation: "công an", "ngân hàng nhà nước", "bộ công an"
    - Common scam phrases: "trúng thưởng", "nhận quà", "miễn phí", "cơ hội cuối"
    - Phone/online scams: "làm việc online", "thu nhập cao", "không cần kinh nghiệm"
    
    Be especially vigilant for:
    - Sequential or premium phone numbers (1900, 1800)
    - Requests for personal information or money transfers
    - Too-good-to-be-true offers
    - Emotional manipulation or urgency
    - Poor grammar or generic language (for fake reviews)`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: this.maxTokens
      });

      const messageContent = response.choices[0]?.message?.content;
      if (!messageContent) {
        throw new AIServiceError('No response content from OpenAI', 'EMPTY_RESPONSE', this.name);
      }
      const result = JSON.parse(messageContent);
      
      // Validate and sanitize the response
      const analysis: AnalysisResult = {
        isScam: Boolean(result.isScam),
        confidence: this.clampConfidence(result.confidence),
        category: this.validateCategory(result.category),
        severity: this.calculateSeverity(result.confidence, result.isScam),
        indicators: Array.isArray(result.indicators) ? result.indicators : [],
        sentiment: this.validateSentiment(result.sentiment),
        explanation: result.explanation || 'No explanation provided',
        metadata: {
          processingTime: Date.now() - startTime,
          modelVersion: this.model,
          provider: this.name
        }
      };

      return analysis;
    } catch (error: any) {
      if (error?.status === 429) {
        throw new RateLimitError('OpenAI rate limit exceeded. Please try again later.', this.name);
      }
      
      if (error?.status === 401) {
        throw new AIServiceError('Invalid OpenAI API key', 'INVALID_API_KEY', this.name);
      }

      console.error('OpenAI API error:', error);
      throw new AIServiceError(
        `AI analysis failed: ${error?.message || 'Unknown error'}`,
        'ANALYSIS_FAILED',
        this.name,
        true
      );
    }
  }

  async detectSpam(data: SpamCheckData): Promise<SpamResult> {
    const prompt = `Analyze if this phone number shows spam/scam behavior:
    
    Phone: ${data.phone}
    ${data.callFrequency ? `Call frequency: ${data.callFrequency} calls/day` : ''}
    ${data.reportCount ? `User reports: ${data.reportCount}` : ''}
    ${data.timePattern ? `Calling pattern: ${data.timePattern}` : ''}
    ${data.firstSeen ? `First seen: ${data.firstSeen}` : ''}
    ${data.lastSeen ? `Last activity: ${data.lastSeen}` : ''}
    
    Consider:
    - Vietnamese premium numbers (1900, 1800)
    - Sequential numbers (11111, 88888)
    - High call frequency
    - Odd hour calling patterns
    - Number of user reports
    
    Return JSON:
    {
      "isSpam": boolean,
      "confidence": number (0.0 to 1.0),
      "spamType": "telemarketing" | "robocall" | "scam" | "survey" | "debt_collector" (optional),
      "reason": string (explanation in Vietnamese or English)
    }`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_completion_tokens: 500
      });

      const messageContent = response.choices[0]?.message?.content;
      if (!messageContent) {
        throw new AIServiceError('No response content from OpenAI', 'EMPTY_RESPONSE', this.name);
      }
      const result = JSON.parse(messageContent);
      
      return {
        isSpam: Boolean(result.isSpam),
        confidence: this.clampConfidence(result.confidence),
        spamType: result.spamType,
        reason: result.reason || 'No specific reason identified'
      };
    } catch (error: any) {
      console.error('Spam detection error:', error);
      throw new AIServiceError(
        'Spam detection failed',
        'SPAM_DETECTION_FAILED',
        this.name,
        true
      );
    }
  }

  async checkFakeReview(review: string): Promise<FakeReviewResult> {
    const prompt = `Detect if this review is fake or genuine. Pay special attention to Vietnamese review patterns.
    
    Review: "${review}"
    
    Check for:
    - Generic language ("rất tốt", "10 điểm", "highly recommend")
    - Lack of specific details about the product/service
    - Excessive praise without substance
    - Grammatical patterns common in fake reviews
    - Copy-paste indicators
    - Emotional manipulation
    - Incentivized review language ("I received this product for free")
    
    Vietnamese-specific patterns:
    - Overly formal language in casual contexts
    - Repeated use of "rất", "quá", "cực kỳ"
    - Unnatural product name mentions
    - Mixed English-Vietnamese in suspicious ways
    
    Return JSON:
    {
      "isFake": boolean,
      "confidence": number (0.0 to 1.0),
      "indicators": string[] (specific indicators found),
      "reviewQuality": "authentic" | "suspicious" | "likely_fake" | "confirmed_fake"
    }`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_completion_tokens: 800
      });

      const messageContent = response.choices[0]?.message?.content;
      if (!messageContent) {
        throw new AIServiceError('No response content from OpenAI', 'EMPTY_RESPONSE', this.name);
      }
      const result = JSON.parse(messageContent);
      
      return {
        isFake: Boolean(result.isFake),
        confidence: this.clampConfidence(result.confidence),
        indicators: Array.isArray(result.indicators) ? result.indicators : [],
        reviewQuality: result.reviewQuality || 'suspicious'
      };
    } catch (error: any) {
      console.error('Fake review detection error:', error);
      throw new AIServiceError(
        'Fake review detection failed',
        'FAKE_REVIEW_DETECTION_FAILED',
        this.name,
        true
      );
    }
  }

  async analyzeSentiment(text: string): Promise<SentimentResult> {
    const prompt = `Analyze the sentiment and emotions in this text (Vietnamese or English):
    
    Text: "${text}"
    
    Return JSON:
    {
      "sentiment": "positive" | "negative" | "neutral",
      "confidence": number (0.0 to 1.0),
      "emotions": {
        "anger": number (0.0 to 1.0),
        "fear": number (0.0 to 1.0),
        "joy": number (0.0 to 1.0),
        "sadness": number (0.0 to 1.0),
        "surprise": number (0.0 to 1.0)
      }
    }`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_completion_tokens: 300
      });

      const messageContent = response.choices[0]?.message?.content;
      if (!messageContent) {
        throw new AIServiceError('No response content from OpenAI', 'EMPTY_RESPONSE', this.name);
      }
      const result = JSON.parse(messageContent);
      
      return {
        sentiment: this.validateSentiment(result.sentiment),
        confidence: this.clampConfidence(result.confidence),
        emotions: result.emotions
      };
    } catch (error: any) {
      console.error('Sentiment analysis error:', error);
      throw new AIServiceError(
        'Sentiment analysis failed',
        'SENTIMENT_ANALYSIS_FAILED',
        this.name,
        true
      );
    }
  }

  // Helper methods
  private clampConfidence(value: any): number {
    const num = parseFloat(value);
    if (isNaN(num)) return 0.5;
    return Math.max(0, Math.min(1, num));
  }

  private validateCategory(category: any): ScamCategory {
    const validCategories: ScamCategory[] = [
      'financial', 'phishing', 'fake_goods', 'identity_theft',
      'romance_scam', 'tech_support', 'investment', 'other'
    ];
    
    return validCategories.includes(category) ? category : 'other';
  }

  private validateSentiment(sentiment: any): Sentiment {
    const validSentiments: Sentiment[] = ['positive', 'negative', 'neutral'];
    return validSentiments.includes(sentiment) ? sentiment : 'neutral';
  }

  private calculateSeverity(confidence: number, isScam: boolean): Severity {
    if (!isScam) return 'low';
    
    if (confidence >= 0.9) return 'critical';
    if (confidence >= 0.7) return 'high';
    if (confidence >= 0.5) return 'medium';
    return 'low';
  }
}
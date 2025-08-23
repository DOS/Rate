#!/usr/bin/env node

/**
 * Test script for AI Service
 * Tests scam detection, spam identification, and fake review analysis
 */

import { AIAnalysisService } from './packages/ai/dist/index.js';

console.log('🚀 Starting AI Service Test...\n');

const testAI = async () => {
  try {
    // Initialize AI service
    console.log('📦 Initializing AI Service...');
    const ai = new AIAnalysisService();
    console.log('✅ AI Service initialized\n');

    // Test 1: Phone number spam detection
    console.log('====================================');
    console.log('Test 1: Premium Phone Number Analysis');
    console.log('====================================');
    const phoneTest = await ai.analyzeContent({
      type: 'phone',
      content: '1900123456',
      source: 'test',
      metadata: {
        callFrequency: 15,
        reportCount: 8
      }
    });
    console.log('📞 Phone:', '1900123456');
    console.log('🎯 Is Scam:', phoneTest.isScam);
    console.log('📊 Confidence:', (phoneTest.confidence * 100).toFixed(1) + '%');
    console.log('🏷️ Category:', phoneTest.category);
    console.log('⚠️ Severity:', phoneTest.severity);
    console.log('🔍 Indicators:', phoneTest.indicators);
    console.log('💬 Explanation:', phoneTest.explanation);
    console.log('⏱️ Processing time:', phoneTest.metadata.processingTime + 'ms');
    console.log('🤖 Provider:', phoneTest.metadata.provider);
    console.log();

    // Test 2: Vietnamese scam text
    console.log('====================================');
    console.log('Test 2: Vietnamese Scam Text Analysis');
    console.log('====================================');
    const scamText = `Chúc mừng bạn đã trúng thưởng 100 triệu đồng! 
    Vui lòng chuyển tiền phí 500k để nhận thưởng. 
    Gửi mã OTP và số tài khoản ngân hàng ngay!`;
    
    const textTest = await ai.analyzeContent({
      type: 'transaction',
      content: scamText,
      source: 'test'
    });
    console.log('📝 Text:', scamText.substring(0, 50) + '...');
    console.log('🎯 Is Scam:', textTest.isScam);
    console.log('📊 Confidence:', (textTest.confidence * 100).toFixed(1) + '%');
    console.log('🏷️ Category:', textTest.category);
    console.log('⚠️ Severity:', textTest.severity);
    console.log('🔍 Indicators:', textTest.indicators);
    console.log('💭 Sentiment:', textTest.sentiment);
    console.log('💬 Explanation:', textTest.explanation);
    console.log('⏱️ Processing time:', textTest.metadata.processingTime + 'ms');
    console.log();

    // Test 3: Fake review detection
    console.log('====================================');
    console.log('Test 3: Fake Review Detection');
    console.log('====================================');
    const fakeReview = "Sản phẩm rất tốt, 10 điểm, highly recommend! Tôi rất hài lòng!!!";
    
    const reviewResult = await ai.checkFakeReview(fakeReview);
    console.log('📝 Review:', fakeReview);
    console.log('🎯 Is Fake:', reviewResult.isFake);
    console.log('📊 Confidence:', (reviewResult.confidence * 100).toFixed(1) + '%');
    console.log('🔍 Indicators:', reviewResult.indicators);
    console.log('📈 Quality:', reviewResult.reviewQuality);
    console.log();

    // Test 4: Spam phone detection
    console.log('====================================');
    console.log('Test 4: Spam Phone Detection');
    console.log('====================================');
    const spamResult = await ai.detectSpam({
      phone: '0909888888',
      callFrequency: 25,
      reportCount: 15,
      timePattern: 'late_night'
    });
    console.log('📞 Phone:', '0909888888');
    console.log('🎯 Is Spam:', spamResult.isSpam);
    console.log('📊 Confidence:', (spamResult.confidence * 100).toFixed(1) + '%');
    console.log('📋 Type:', spamResult.spamType || 'N/A');
    console.log('💬 Reason:', spamResult.reason);
    console.log();

    // Test 5: Sentiment analysis
    console.log('====================================');
    console.log('Test 5: Sentiment Analysis');
    console.log('====================================');
    const sentimentText = "Tôi rất lo lắng về việc bị lừa đảo. Nhiều người đã mất tiền!";
    
    const sentimentResult = await ai.analyzeSentiment(sentimentText);
    console.log('📝 Text:', sentimentText);
    console.log('💭 Sentiment:', sentimentResult.sentiment);
    console.log('📊 Confidence:', (sentimentResult.confidence * 100).toFixed(1) + '%');
    if (sentimentResult.emotions) {
      console.log('😊 Emotions:', sentimentResult.emotions);
    }
    console.log();

    // Get metrics
    console.log('====================================');
    console.log('📊 AI Service Metrics');
    console.log('====================================');
    const metrics = ai.getMetrics();
    console.log('⚡ Avg Response Time:', metrics.avgResponseTime.toFixed(0) + 'ms');
    console.log('📈 Cache Hit Rate:', (metrics.cacheHitRate * 100).toFixed(1) + '%');
    console.log('🔢 API Calls:', metrics.apiCallsCount);
    console.log('💰 Estimated Cost: $' + metrics.estimatedCost.toFixed(2));
    console.log('🚨 Scams Detected:', metrics.scamsDetected);
    console.log('📞 Spam Detected:', metrics.spamDetected);
    console.log('📝 Fake Reviews:', metrics.fakeReviewsDetected);
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
};

// Run tests
testAI().then(() => {
  console.log('\n🎉 AI Service test completed!');
  process.exit(0);
}).catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});
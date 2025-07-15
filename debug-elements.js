// Quick debug script to test lesson generation using POC-style lesson script
const { generateSampleLesson } = require('./apps/web/src/utils/testData.ts');

try {
  const lesson = generateSampleLesson();
  console.log('Generated lesson with', lesson.length, 'slides');
  console.log('First slide:', JSON.stringify(lesson[0], null, 2));
  console.log('SUCCESS: POC economy script integration working!');
} catch (error) {
  console.error('Error generating lesson:', error.message);
}
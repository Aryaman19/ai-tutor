import { makeLessonScript as HowEconomyWorks } from './howEconomyWorks';
// Add more imports as you create scripts

export const lessons = {
  "How Economy Works": HowEconomyWorks,
  // Add more lessons here
};

export type LessonName = keyof typeof lessons;
import { apiClient } from './client';
import type { Doubt } from '@ai-tutor/types';

export const doubtsApi = {
  async create(
    lesson_id: string,
    question: string,
    video_timestamp?: number,
    context?: string
  ): Promise<Doubt> {
    const response = await apiClient.post<Doubt>('/api/doubt', {
      lesson_id,
      question,
      video_timestamp,
      context,
    });
    return response.data;
  },
};

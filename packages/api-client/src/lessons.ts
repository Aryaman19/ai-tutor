import { apiClient } from './client';
import type { Lesson } from '@ai-tutor/types';

export const lessonsApi = {
  async createELI5(topic: string, difficulty_level: string = 'beginner'): Promise<Lesson> {
    const response = await apiClient.post<Lesson>('/api/lesson/eli5', {
      topic,
      difficulty_level,
    });
    return response.data;
  },

  async getAll(limit: number = 50, offset: number = 0): Promise<Lesson[]> {
    const response = await apiClient.get<Lesson[]>('/api/lessons', {
      params: { limit, offset },
    });
    return response.data;
  },

  async getById(id: string): Promise<Lesson> {
    const response = await apiClient.get<Lesson>(`/api/lesson/${id}`);
    return response.data;
  },
};

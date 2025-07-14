import { apiClient } from './client';
import type { Lesson } from '@ai-tutor/types';

export const lessonsApi = {
  async createLesson(topic: string, difficulty_level: string = 'beginner'): Promise<Lesson> {
    const response = await apiClient.post<Lesson>('/api/lesson', {
      topic,
      difficulty_level,
    });
    return response.data;
  },

  async generateLessonContent(id: string): Promise<Lesson> {
    const response = await apiClient.post<Lesson>(`/api/lesson/${id}/generate`);
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

  async updateLesson(id: string, updates: Partial<Lesson>): Promise<Lesson> {
    const response = await apiClient.put<Lesson>(`/api/lesson/${id}`, updates);
    return response.data;
  },

  async deleteLesson(id: string): Promise<void> {
    await apiClient.delete(`/api/lesson/${id}`);
  },
};

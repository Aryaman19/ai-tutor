/**
 * Type utilities for backward compatibility with legacy code
 */

import type { EventContent } from '@ai-tutor/types';

/**
 * Safe content access utility for EventContent that might be string
 */
export function asContentObject(content: string | EventContent): EventContent & { [key: string]: any } {
  if (typeof content === 'string') {
    return { 
      length: content.length,
      toString: () => content,
      visual: undefined,
      audio: undefined,
      transition: undefined,
    } as any;
  }
  return content as EventContent & { [key: string]: any };
}

/**
 * Safe string access utility for content
 */
export function asString(content: string | EventContent): string {
  if (typeof content === 'string') {
    return content;
  }
  return JSON.stringify(content);
}

/**
 * Check if content has visual properties
 */
export function hasVisual(content: string | EventContent): boolean {
  return typeof content === 'object' && content.visual !== undefined;
}

/**
 * Check if content has audio properties
 */
export function hasAudio(content: string | EventContent): boolean {
  return typeof content === 'object' && content.audio !== undefined;
}

/**
 * Check if content has transition properties
 */
export function hasTransition(content: string | EventContent): boolean {
  return typeof content === 'object' && content.transition !== undefined;
}
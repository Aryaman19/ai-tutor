/**
 * Timeline utility functions for handling TimelineEvent data
 */

import type { TimelineEvent, EventContent } from '@ai-tutor/types';

/**
 * Extract string content from TimelineEvent.content
 */
export function getEventContentString(event: TimelineEvent): string {
  if (typeof event.content === 'string') {
    return event.content;
  }
  
  // If EventContent object, try to extract meaningful string
  const content = event.content as EventContent;
  if (content.audio?.text) {
    return content.audio.text;
  }
  
  if (content.visual?.properties?.text) {
    return content.visual.properties.text;
  }
  
  return '';
}

/**
 * Get semantic type from event, fallback to default
 */
export function getEventSemanticType(event: TimelineEvent): string {
  return event.semanticType || 'narration';
}

/**
 * Get start time from event (handles both timestamp and startTime)
 */
export function getEventStartTime(event: TimelineEvent): number {
  return event.startTime || event.timestamp;
}

/**
 * Check if EventContent has string-like operations
 */
export function getEventContentLength(event: TimelineEvent): number {
  const content = getEventContentString(event);
  return content.length;
}

/**
 * Check if content includes a substring
 */
export function eventContentIncludes(event: TimelineEvent, searchString: string): boolean {
  const content = getEventContentString(event);
  return content.includes(searchString);
}
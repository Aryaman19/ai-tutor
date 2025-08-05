# Lesson Format Compatibility Guide

## Overview

The ExcalidrawPlayer has been enhanced to support multiple lesson data formats:

1. **POC Format**: Simple format used in the original proof-of-concept
2. **API Format**: Full-featured format returned by the backend API
3. **Local Format**: Enhanced local lesson format with Excalidraw elements

## Data Structures

### 1. POC Format (LessonSlide)
```typescript
interface LessonSlide {
  narration: string;
  elements: ExcalidrawElement[];
}
```

### 2. API Format (CanvasStep)
```typescript
interface CanvasStep {
  step_number: number;
  title: string;
  explanation?: string;      // New field for explanation text
  content?: string;          // Legacy field for backward compatibility  
  narration?: string;        // Script content for narration
  canvas_data?: any;
  visual_elements?: any[];   // Text descriptions of visual elements
  elements?: any[];          // Excalidraw elements (usually empty from API)
  duration?: number;         // Estimated duration in seconds
}
```

### 3. Local Format (LessonStep)
```typescript
interface LessonStep {
  step_number: number;
  title: string;
  explanation?: string;
  narration?: string;
  elements?: ExcalidrawElement[];  // Actual Excalidraw elements
}
```

## Compatibility Layer

The `lessonAdapter.ts` utility provides:

### Transformation Functions
- `normalizeToPlayerFormat(data)`: Auto-detects format and converts to POC format
- `transformApiToPlayerFormat(steps)`: Specifically converts API format to POC format
- `isApiFormat(data)`: Checks if data is in API format
- `isPocFormat(data)`: Checks if data is in POC format

### API Integration
- `fetchApiLesson(lessonId)`: Fetches lesson from API and returns POC format
- `fetchApiLessonScript(lessonId)`: Fetches lesson script from API and returns POC format


## Usage Examples

### Loading Local Lessons
```typescript
const lessonFn = lessons["How Economy Works"];
const rawData = lessonFn();
const slides = normalizeToPlayerFormat(rawData);
```

### Loading API Lessons
```typescript
const slides = await fetchApiLesson("lesson-id-123");
```


## ExcalidrawPlayer Integration

The ExcalidrawPlayer now:

1. **Auto-detects lesson format** using `normalizeToPlayerFormat()`
2. **Supports API lessons** via `api:lessonId` naming convention
4. **Maintains backward compatibility** with existing local lessons

### Lesson Selection
- Local lessons: Use existing lesson names
- API lessons: Use format `api:lessonId`

## Key Differences Between Formats

| Feature | POC | API | Local |
|---------|-----|-----|--------|
| Narration | ✅ Direct | ✅ Via explanation/content | ✅ Direct |
| Visual Elements | ✅ Excalidraw objects | ❌ Text descriptions only | ✅ Excalidraw objects |
| Step Numbers | ❌ | ✅ | ✅ |
| Titles | ❌ | ✅ | ✅ |
| Duration | ❌ | ✅ | ❌ |
| Canvas Data | ❌ | ✅ | ❌ |

## Current Limitations

1. **API Visual Elements**: The API returns `visual_elements` as text descriptions, not actual Excalidraw elements
2. **Missing Drawing Generation**: Need to implement conversion from text descriptions to Excalidraw elements
3. **Limited API Testing**: API integration requires actual backend connectivity

## Future Enhancements

1. **Visual Element Parser**: Convert API text descriptions to Excalidraw elements
2. **AI-Powered Drawing**: Use AI to generate Excalidraw elements from descriptions
3. **Real API Integration**: Connect to actual lesson API endpoints
4. **Enhanced Validation**: More comprehensive format validation

## Migration Path

To fully support API lessons with visual elements:

1. Enhance API to return actual Excalidraw elements
2. Implement visual element parser for text descriptions
3. Add AI-powered drawing generation
4. Update lesson generation to create Excalidraw-compatible elements

## Validation

Use the `validateLessonData()` function to validate lesson format compatibility.
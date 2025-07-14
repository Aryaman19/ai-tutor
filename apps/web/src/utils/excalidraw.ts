import { nanoid } from "nanoid";

export interface ExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: string;
  strokeWidth: number;
  strokeStyle: string;
  roughness: number;
  opacity: number;
  groupIds: string[];
  frameId: string | null;
  roundness: any;
  seed: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: any;
  updated: number;
  link: string | null;
  locked: boolean;
  index: string; // Fractional index for ordering - CRITICAL for Excalidraw
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: string;
  verticalAlign?: string;
  baseline?: number;
  points?: number[][];
  lastCommittedPoint?: number[];
  startBinding?: any;
  endBinding?: any;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
}

export interface LessonScript {
  narration: string;
  elements: ExcalidrawElement[];
}

export interface LessonStep {
  step_number: number;
  title: string;
  explanation?: string;  // New field
  content?: string;      // Legacy field for backward compatibility
  narration?: string;
  visual_elements?: string[] | any[];
  elements?: ExcalidrawElement[];
  audio_url?: string;
  canvas_data?: any;
  duration?: number;
}

// Constants
export const COLORS = {
  PRIMARY: "#1971c2",
  SECONDARY: "#495057",
  SUCCESS: "#51cf66",
  WARNING: "#ffd43b",
  ERROR: "#ff6b6b",
  WHITE: "#ffffff",
  BLACK: "#000000",
  GRAY: "#868e96",
  LIGHT_GRAY: "#f8f9fa",
  BLUE: "#339af0",
  GREEN: "#69db7c",
  YELLOW: "#ffe066",
  RED: "#ff8787",
  PURPLE: "#da77f2",
  ORANGE: "#ff922b"
};

export const FONT_FAMILIES = {
  VIRGIL: 1,
  HELVETICA: 2,
  CASCADIA: 3
};

// Fractional index generator for proper element ordering
let indexCounter = 0;
export function generateFractionalIndex(): string {
  indexCounter++;
  return `a${indexCounter.toString(36).padStart(4, "0")}`;
}

// Regenerate indices and IDs to prevent conflicts (like in POC)
export function regenerateElementIndices(elements: ExcalidrawElement[]): ExcalidrawElement[] {
  return elements.map((element, index) => ({
    ...element,
    // Generate new clean fractional indices
    index: `a${(index + 1).toString(36).padStart(4, "0")}`,
    // Ensure unique IDs to prevent conflicts
    id: element.id.includes(":")
      ? `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      : element.id,
    // Update version nonce to trigger re-render
    versionNonce: Math.floor(Math.random() * 2147483647),
    updated: Date.now()
  }));
}

// Base element creator
export function makeBase(): Partial<ExcalidrawElement> {
  return {
    id: nanoid(),
    angle: 0,
    strokeColor: COLORS.BLACK,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: Math.floor(Math.random() * 2147483647),
    versionNonce: Math.floor(Math.random() * 2147483647),
    isDeleted: false,
    boundElements: [],
    updated: Date.now(),
    link: null,
    locked: false,
    index: generateFractionalIndex() // Add fractional index
  };
}

// Text element creator
export function makeText(
  x: number,
  y: number,
  text: string,
  options: {
    fontSize?: number;
    fontFamily?: number;
    textAlign?: "left" | "center" | "right";
    strokeColor?: string;
    width?: number;
    height?: number;
  } = {}
): ExcalidrawElement {
  const fontSize = options.fontSize || 20;
  const fontFamily = options.fontFamily || FONT_FAMILIES.VIRGIL;
  const textAlign = options.textAlign || "left";
  const strokeColor = options.strokeColor || COLORS.BLACK;
  
  // Estimate text dimensions if not provided
  const charWidth = fontSize * 0.6;
  const lineHeight = fontSize * 1.2;
  const lines = text.split('\n');
  const maxLineLength = Math.max(...lines.map(line => line.length));
  
  const width = options.width || maxLineLength * charWidth;
  const height = options.height || lines.length * lineHeight;

  return {
    ...makeBase(),
    type: "text",
    x,
    y,
    width,
    height,
    text,
    fontSize,
    fontFamily,
    textAlign,
    verticalAlign: "top",
    baseline: fontSize,
    strokeColor
  } as ExcalidrawElement;
}

// Rectangle element creator
export function makeRectangle(
  x: number,
  y: number,
  width: number,
  height: number,
  options: {
    strokeColor?: string;
    backgroundColor?: string;
    strokeWidth?: number;
    fillStyle?: string;
  } = {}
): ExcalidrawElement {
  return {
    ...makeBase(),
    type: "rectangle",
    x,
    y,
    width,
    height,
    strokeColor: options.strokeColor || COLORS.BLACK,
    backgroundColor: options.backgroundColor || "transparent",
    strokeWidth: options.strokeWidth || 2,
    fillStyle: options.fillStyle || "solid",
    roundness: { type: 3 }
  } as ExcalidrawElement;
}

// Ellipse element creator
export function makeEllipse(
  x: number,
  y: number,
  width: number,
  height: number,
  options: {
    strokeColor?: string;
    backgroundColor?: string;
    strokeWidth?: number;
    fillStyle?: string;
  } = {}
): ExcalidrawElement {
  return {
    ...makeBase(),
    type: "ellipse",
    x,
    y,
    width,
    height,
    strokeColor: options.strokeColor || COLORS.BLACK,
    backgroundColor: options.backgroundColor || "transparent",
    strokeWidth: options.strokeWidth || 2,
    fillStyle: options.fillStyle || "solid"
  } as ExcalidrawElement;
}

// Arrow element creator
export function makeArrow(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  options: {
    strokeColor?: string;
    strokeWidth?: number;
    startArrowhead?: string | null;
    endArrowhead?: string | null;
  } = {}
): ExcalidrawElement {
  const points: number[][] = [
    [0, 0],
    [endX - startX, endY - startY]
  ];

  return {
    ...makeBase(),
    type: "arrow",
    x: startX,
    y: startY,
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
    points,
    lastCommittedPoint: [endX - startX, endY - startY],
    strokeColor: options.strokeColor || COLORS.BLACK,
    strokeWidth: options.strokeWidth || 2,
    startArrowhead: options.startArrowhead || null,
    endArrowhead: options.endArrowhead || "arrow"
  } as ExcalidrawElement;
}

// Diamond element creator
export function makeDiamond(
  x: number,
  y: number,
  width: number,
  height: number,
  options: {
    strokeColor?: string;
    backgroundColor?: string;
    strokeWidth?: number;
    fillStyle?: string;
  } = {}
): ExcalidrawElement {
  return {
    ...makeBase(),
    type: "diamond",
    x,
    y,
    width,
    height,
    strokeColor: options.strokeColor || COLORS.BLACK,
    backgroundColor: options.backgroundColor || "transparent",
    strokeWidth: options.strokeWidth || 2,
    fillStyle: options.fillStyle || "solid"
  } as ExcalidrawElement;
}

// Labeled rectangle creator
export function makeLabeledRectangle(
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  options: {
    strokeColor?: string;
    backgroundColor?: string;
    textColor?: string;
    fontSize?: number;
    fontFamily?: number;
  } = {}
): ExcalidrawElement[] {
  const rect = makeRectangle(x, y, width, height, {
    strokeColor: options.strokeColor,
    backgroundColor: options.backgroundColor
  });

  const text = makeText(
    x + width / 2,
    y + height / 2,
    label,
    {
      fontSize: options.fontSize || 16,
      fontFamily: options.fontFamily || FONT_FAMILIES.VIRGIL,
      textAlign: "center",
      strokeColor: options.textColor || COLORS.BLACK,
      width: width - 20,
      height: height - 20
    }
  );

  // Center the text
  text.x = x + (width - text.width) / 2;
  text.y = y + (height - text.height) / 2;

  return [rect, text];
}

// Labeled arrow creator
export function makeLabeledArrow(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  label: string,
  options: {
    strokeColor?: string;
    textColor?: string;
    fontSize?: number;
    strokeWidth?: number;
    startArrowhead?: string | null;
    endArrowhead?: string | null;
  } = {}
): ExcalidrawElement[] {
  const arrow = makeArrow(startX, startY, endX, endY, {
    strokeColor: options.strokeColor,
    strokeWidth: options.strokeWidth,
    startArrowhead: options.startArrowhead,
    endArrowhead: options.endArrowhead
  });

  const text = makeText(
    (startX + endX) / 2,
    (startY + endY) / 2 - 15,
    label,
    {
      fontSize: options.fontSize || 14,
      fontFamily: FONT_FAMILIES.VIRGIL,
      textAlign: "center",
      strokeColor: options.textColor || COLORS.BLACK
    }
  );

  // Center the text
  text.x = (startX + endX) / 2 - text.width / 2;

  return [arrow, text];
}

// Grid positioning helpers
export function getCellPosition(row: number, col: number, cellWidth = 100, cellHeight = 80): { x: number; y: number } {
  return {
    x: col * cellWidth + 50,
    y: row * cellHeight + 50
  };
}

export function getCellCenter(row: number, col: number, cellWidth = 100, cellHeight = 80): { x: number; y: number } {
  const pos = getCellPosition(row, col, cellWidth, cellHeight);
  return {
    x: pos.x + cellWidth / 2,
    y: pos.y + cellHeight / 2
  };
}

// Utility to create a simple flowchart step
export function makeFlowchartStep(
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  description?: string,
  options: {
    backgroundColor?: string;
    strokeColor?: string;
    textColor?: string;
  } = {}
): ExcalidrawElement[] {
  const elements: ExcalidrawElement[] = [];

  // Main rectangle
  const rect = makeRectangle(x, y, width, height, {
    backgroundColor: options.backgroundColor || COLORS.LIGHT_GRAY,
    strokeColor: options.strokeColor || COLORS.PRIMARY,
    strokeWidth: 2
  });
  elements.push(rect);

  // Title text
  const titleText = makeText(
    x + 10,
    y + 10,
    title,
    {
      fontSize: 18,
      fontFamily: FONT_FAMILIES.HELVETICA,
      strokeColor: options.textColor || COLORS.BLACK,
      width: width - 20
    }
  );
  elements.push(titleText);

  // Description text if provided
  if (description) {
    const descText = makeText(
      x + 10,
      y + 35,
      description,
      {
        fontSize: 14,
        fontFamily: FONT_FAMILIES.HELVETICA,
        strokeColor: options.textColor || COLORS.SECONDARY,
        width: width - 20
      }
    );
    elements.push(descText);
  }

  return elements;
}

// Utility to create a callout/note box
export function makeCallout(
  x: number,
  y: number,
  width: number,
  text: string,
  type: "info" | "warning" | "success" | "error" = "info"
): ExcalidrawElement[] {
  const colorMap = {
    info: { bg: COLORS.BLUE, border: COLORS.PRIMARY },
    warning: { bg: COLORS.YELLOW, border: COLORS.WARNING },
    success: { bg: COLORS.GREEN, border: COLORS.SUCCESS },
    error: { bg: COLORS.RED, border: COLORS.ERROR }
  };

  const colors = colorMap[type];
  const height = Math.max(60, text.length * 0.5 + 40);

  return makeLabeledRectangle(x, y, width, height, text, {
    backgroundColor: colors.bg,
    strokeColor: colors.border,
    textColor: COLORS.BLACK,
    fontSize: 14
  });
}
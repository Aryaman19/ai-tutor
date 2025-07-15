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
  version?: number; // Added version field
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
  // Additional optional fields for compatibility
  originalText?: string;
  lineHeight?: number;
  containerId?: string | null;
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
  ORANGE: "#ff922b",
  // POC style naming
  primary: "#1971c2",
  secondary: "#495057",
  success: "#51cf66",
  warning: "#ffd43b",
  danger: "#ff6b6b",
  info: "#74c0fc",
  light: "#f8f9fa",
  dark: "#212529"
};

export const FONT_FAMILIES = {
  VIRGIL: 1,
  HELVETICA: 2,
  CASCADIA: 3
};

export const FONTS = {
  normal: 1,
  code: 2,
  handwritten: 3,
};

// Fractional index generator for proper element ordering
let indexCounter = 0;
export function generateFractionalIndex(): string {
  indexCounter++;
  return `a${indexCounter.toString(36).padStart(4, "0")}`;
}

// Reset index counter (useful for new documents)
export function resetIndexCounter(): void {
  indexCounter = 0;
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
    version: 1,
    angle: 0,
    strokeColor: COLORS.BLACK,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100, // Excalidraw uses 0-100 scale, not 0-1
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: Math.floor(Math.random() * 2147483647),
    versionNonce: Math.floor(Math.random() * 2147483647),
    isDeleted: false,
    boundElements: [], // Should be empty array, not null
    updated: Date.now(),
    link: null,
    locked: false,
    index: generateFractionalIndex() // Add fractional index
  };
}

// Text element creator (POC compatible)
export function makeText(
  options: {
    x: number;
    y: number;
    text: string;
    fontSize?: number;
    fontFamily?: number;
    textAlign?: "left" | "center" | "right";
    color?: string;
    strokeColor?: string;
    width?: number;
    height?: number;
    backgroundColor?: string;
    bold?: boolean;
    italic?: boolean;
  }
): ExcalidrawElement;
export function makeText(
  x: number,
  y: number,
  text: string,
  options?: {
    fontSize?: number;
    fontFamily?: number;
    textAlign?: "left" | "center" | "right";
    strokeColor?: string;
    width?: number;
    height?: number;
  }
): ExcalidrawElement;
export function makeText(
  xOrOptions: number | {
    x: number;
    y: number;
    text: string;
    fontSize?: number;
    fontFamily?: number;
    textAlign?: "left" | "center" | "right";
    color?: string;
    strokeColor?: string;
    width?: number;
    height?: number;
    backgroundColor?: string;
    bold?: boolean;
    italic?: boolean;
  },
  y?: number,
  text?: string,
  options: {
    fontSize?: number;
    fontFamily?: number;
    textAlign?: "left" | "center" | "right";
    strokeColor?: string;
    width?: number;
    height?: number;
  } = {}
): ExcalidrawElement {
  let finalX: number, finalY: number, finalText: string, finalOptions: any;
  
  if (typeof xOrOptions === 'object') {
    // POC style: makeText({ x, y, text, ... })
    finalX = xOrOptions.x;
    finalY = xOrOptions.y;
    finalText = xOrOptions.text;
    finalOptions = xOrOptions;
  } else {
    // Legacy style: makeText(x, y, text, options)
    finalX = xOrOptions;
    finalY = y!;
    finalText = text!;
    finalOptions = options;
  }
  
  const fontSize = finalOptions.fontSize || 28;
  const fontFamily = finalOptions.fontFamily || FONT_FAMILIES.VIRGIL;
  const textAlign = finalOptions.textAlign || "left";
  const strokeColor = finalOptions.color || finalOptions.strokeColor || COLORS.BLACK;
  const backgroundColor = finalOptions.backgroundColor || "transparent";
  
  // Estimate text dimensions if not provided
  const lines = finalText.split('\n');
  const height = Math.round(lines.length * fontSize * 1.25);
  const width = finalOptions.width || 500;

  return {
    ...makeBase(),
    type: "text",
    x: Math.round(finalX),
    y: Math.round(finalY),
    width: Math.round(width),
    height: Math.round(height),
    text: finalText,
    originalText: finalText,
    fontSize: Math.round(fontSize),
    fontFamily,
    textAlign,
    verticalAlign: "top",
    lineHeight: 1.25,
    containerId: null,
    strokeColor,
    backgroundColor,
    baseline: fontSize,
    ...(finalOptions.bold && { strokeWidth: 3 }),
    ...(finalOptions.italic && { fontStyle: "italic" }),
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

// Labeled rectangle creator (legacy)
export function makeLabeledRectangleLegacy(
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

// Labeled arrow creator (legacy)
export function makeLabeledArrowLegacy(
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

// Grid positioning helpers (POC compatible)
const GRID_CONFIG = {
  cellWidth: 900,
  cellHeight: 600,
  margin: 40,
  cols: 5,
};

export function getCellPosition(index: number, customGrid = GRID_CONFIG): { x: number; y: number; col: number; row: number } {
  const safeIndex = Math.max(0, Math.floor(Number(index) || 0));
  const col = safeIndex % customGrid.cols;
  const row = Math.floor(safeIndex / customGrid.cols);
  return {
    x: Math.round(col * customGrid.cellWidth + customGrid.margin),
    y: Math.round(row * customGrid.cellHeight + customGrid.margin),
    col,
    row,
  };
}

export function getCellCenter(index: number, customGrid = GRID_CONFIG): { x: number; y: number } {
  const { x, y } = getCellPosition(index, customGrid);
  return {
    x: Math.round(x + customGrid.cellWidth / 2),
    y: Math.round(y + customGrid.cellHeight / 2),
  };
}

// Legacy grid functions for backward compatibility
export function getCellPositionLegacy(row: number, col: number, cellWidth = 100, cellHeight = 80): { x: number; y: number } {
  return {
    x: col * cellWidth + 50,
    y: row * cellHeight + 50
  };
}

export function getCellCenterLegacy(row: number, col: number, cellWidth = 100, cellHeight = 80): { x: number; y: number } {
  const pos = getCellPositionLegacy(row, col, cellWidth, cellHeight);
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

// Utility to create a callout/note box (POC compatible)
export function makeCallout(options: {
  x: number;
  y: number;
  width: number;
  text: string;
  type?: "info" | "warning" | "success" | "error" | "danger" | "secondary";
}): ExcalidrawElement[];
export function makeCallout(
  x: number,
  y: number,
  width: number,
  text: string,
  type?: "info" | "warning" | "success" | "error" | "danger" | "secondary"
): ExcalidrawElement[];
export function makeCallout(
  xOrOptions: number | {
    x: number;
    y: number;
    width: number;
    text: string;
    type?: "info" | "warning" | "success" | "error" | "danger" | "secondary";
  },
  y?: number,
  width?: number,
  text?: string,
  type: "info" | "warning" | "success" | "error" | "danger" | "secondary" = "info"
): ExcalidrawElement[] {
  let finalX: number, finalY: number, finalWidth: number, finalText: string, finalType: string;
  
  if (typeof xOrOptions === 'object') {
    finalX = xOrOptions.x;
    finalY = xOrOptions.y;
    finalWidth = xOrOptions.width;
    finalText = xOrOptions.text;
    finalType = xOrOptions.type || "info";
  } else {
    finalX = xOrOptions;
    finalY = y!;
    finalWidth = width!;
    finalText = text!;
    finalType = type;
  }

  const colorMap = {
    info: { bg: COLORS.info, border: COLORS.primary },
    warning: { bg: COLORS.warning, border: COLORS.warning },
    danger: { bg: COLORS.danger, border: COLORS.danger },
    success: { bg: COLORS.success, border: COLORS.success },
    error: { bg: COLORS.danger, border: COLORS.danger },
    secondary: { bg: COLORS.secondary, border: COLORS.secondary },
  };

  const colors = colorMap[finalType as keyof typeof colorMap] || colorMap.info;
  const height = 80;

  return makeLabeledRectanglePOC({
    x: finalX,
    y: finalY,
    width: finalWidth,
    height,
    label: finalText,
    fillColor: colors.bg,
    shapeColor: colors.border,
    strokeWidth: 2,
    roundness: { type: 3 },
  });
}

// POC-style labeled shapes
export function makeLabeledShape(options: {
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  label: string;
  shapeColor?: string;
  fillColor?: string;
  textColor?: string;
  fontSize?: number;
  strokeWidth?: number;
  roundness?: any;
}): ExcalidrawElement[] {
  const {
    type,
    x,
    y,
    width = 150,
    height = 80,
    label,
    shapeColor = COLORS.BLACK,
    fillColor = "transparent",
    textColor = COLORS.BLACK,
    fontSize = 20,
    strokeWidth = 2,
    roundness = null,
  } = options;

  const shape = {
    ...makeBase(),
    type,
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    strokeColor: shapeColor,
    backgroundColor: fillColor,
    strokeWidth,
    roundness,
    containerId: null,
    children: [],
    boundElements: [] as any[],
  } as ExcalidrawElement;

  const textElement = {
    ...makeText({
      x: Math.round(x + 10),
      y: Math.round(y + height / 2 - fontSize / 2),
      text: label,
      width: Math.round(width - 20),
      fontSize,
      color: textColor,
      textAlign: "center" as const,
    }),
    containerId: shape.id,
  };

  (shape.boundElements as any[]).push({ id: textElement.id, type: "text" });

  return [shape, textElement];
}

export function makeLabeledRectanglePOC(options: {
  x: number;
  y: number;
  width?: number;
  height?: number;
  label: string;
  shapeColor?: string;
  fillColor?: string;
  textColor?: string;
  fontSize?: number;
  strokeWidth?: number;
  roundness?: any;
}): ExcalidrawElement[] {
  return makeLabeledShape({ ...options, type: "rectangle" });
}

export function makeLabeledEllipse(options: {
  x: number;
  y: number;
  width?: number;
  height?: number;
  label: string;
  shapeColor?: string;
  fillColor?: string;
  textColor?: string;
  fontSize?: number;
  strokeWidth?: number;
}): ExcalidrawElement[] {
  return makeLabeledShape({ ...options, type: "ellipse" });
}

export function makeLabeledDiamond(options: {
  x: number;
  y: number;
  width?: number;
  height?: number;
  label: string;
  shapeColor?: string;
  fillColor?: string;
  textColor?: string;
  fontSize?: number;
  strokeWidth?: number;
}): ExcalidrawElement[] {
  return makeLabeledShape({ ...options, type: "diamond" });
}

// POC-style labeled arrows
export function makeLabeledArrowPOC(options: {
  x: number;
  y: number;
  points?: number[][];
  label?: string;
  fontSize?: number;
  arrowStrokeColor?: string;
  textStrokeColor?: string;
  arrowStrokeWidth?: number;
  curved?: boolean;
  bidirectional?: boolean;
}): ExcalidrawElement[] {
  const {
    x,
    y,
    points = [[0, 0], [150, 0]],
    label,
    fontSize = 20,
    arrowStrokeColor = COLORS.BLACK,
    textStrokeColor = COLORS.BLACK,
    arrowStrokeWidth = 2,
    curved = false,
    bidirectional = false,
  } = options;

  const allX = points.map(([px]) => px);
  const allY = points.map(([, py]) => py);
  const minX = Math.min(...allX);
  const minY = Math.min(...allY);
  const maxX = Math.max(...allX);
  const maxY = Math.max(...allY);

  const relativePoints = points.map(([px, py]) => [
    Math.round(px - minX),
    Math.round(py - minY),
  ]);

  const arrow = {
    ...makeBase(),
    type: "arrow",
    x: Math.round(x + minX),
    y: Math.round(y + minY),
    width: Math.round(maxX - minX),
    height: Math.round(maxY - minY),
    points: relativePoints,
    strokeColor: arrowStrokeColor,
    strokeWidth: arrowStrokeWidth,
    startBinding: null,
    endBinding: null,
    startArrowhead: bidirectional ? "arrow" : null,
    endArrowhead: "arrow",
    boundElements: [] as any[],
    ...(curved && { roughness: 2 }),
  } as ExcalidrawElement;

  if (!label) return [arrow];

  const labelX = Math.round(x + minX + (maxX - minX) / 2 - 100);
  const labelY = Math.round(y + minY - 40);

  const textElem = {
    ...makeText({
      x: labelX,
      y: labelY,
      text: label,
      width: 200,
      fontSize,
      color: textStrokeColor,
      textAlign: "center" as const,
    }),
    containerId: arrow.id,
  };

  (arrow.boundElements as any[]).push({ id: textElem.id, type: "text" });

  return [arrow, textElem];
}

// Layout helpers
export function placeVertically(options: {
  x: number;
  y: number;
  spacing?: number;
  elements: ExcalidrawElement[];
  alignment?: "left" | "center" | "right";
}): ExcalidrawElement[] {
  const { x, y, spacing = 20, elements, alignment = "left" } = options;
  let offsetY = Math.round(y);
  
  return elements.map((el) => {
    let adjustedX = Math.round(x);
    if (alignment === "center") adjustedX = Math.round(x - (el.width || 0) / 2);
    else if (alignment === "right") adjustedX = Math.round(x - (el.width || 0));

    const newEl = { ...el, x: adjustedX, y: offsetY };
    offsetY += Math.round((el.height || 0) + spacing);
    return newEl;
  });
}

export function placeHorizontally(options: {
  x: number;
  y: number;
  spacing?: number;
  elements: ExcalidrawElement[];
  alignment?: "top" | "center" | "bottom";
}): ExcalidrawElement[] {
  const { x, y, spacing = 20, elements, alignment = "top" } = options;
  let offsetX = Math.round(x);
  
  return elements.map((el) => {
    let adjustedY = Math.round(y);
    if (alignment === "center") adjustedY = Math.round(y - (el.height || 0) / 2);
    else if (alignment === "bottom") adjustedY = Math.round(y - (el.height || 0));

    const newEl = { ...el, x: offsetX, y: adjustedY };
    offsetX += Math.round((el.width || 0) + spacing);
    return newEl;
  });
}

// Flowchart creator (POC compatible)
export function makeFlowchart(options: {
  x: number;
  y: number;
  nodes: Array<{
    id: string;
    label: string;
    color?: string;
  }>;
  connections?: Array<{
    from: string;
    to: string;
    label?: string;
  }>;
}): ExcalidrawElement[] {
  const { x, y, nodes, connections = [] } = options;
  const elements: ExcalidrawElement[] = [];
  const nodeElements: { [key: string]: ExcalidrawElement } = {};

  nodes.forEach((node, index) => {
    const nodeX = Math.round(x + (index % 3) * 200);
    const nodeY = Math.round(y + Math.floor(index / 3) * 150);
    const [shape, text] = makeLabeledRectanglePOC({
      x: nodeX,
      y: nodeY,
      width: 150,
      height: 80,
      label: node.label,
      fillColor: node.color || COLORS.light,
    });
    nodeElements[node.id] = shape;
    elements.push(shape, text);
  });

  connections.forEach(({ from, to, label }) => {
    if (nodeElements[from] && nodeElements[to]) {
      const fromCenter = {
        x: Math.round(nodeElements[from].x + nodeElements[from].width / 2),
        y: Math.round(nodeElements[from].y + nodeElements[from].height / 2),
      };
      const toCenter = {
        x: Math.round(nodeElements[to].x + nodeElements[to].width / 2),
        y: Math.round(nodeElements[to].y + nodeElements[to].height / 2),
      };

      const arrowElements = makeLabeledArrowPOC({
        x: fromCenter.x,
        y: fromCenter.y,
        points: [
          [0, 0],
          [toCenter.x - fromCenter.x, toCenter.y - fromCenter.y],
        ],
        label,
      });
      
      elements.push(...arrowElements);
    }
  });

  return elements;
}

// Aliases for POC compatibility
export { makeLabeledArrowPOC as makeLabeledArrow };
export { makeLabeledRectanglePOC as makeLabeledRectangle };
export const GRID = GRID_CONFIG;
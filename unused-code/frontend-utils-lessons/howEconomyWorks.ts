import {
  makeText,
  makeLabeledRectangle,
  makeLabeledEllipse,
  makeLabeledArrow,
  makeCallout,
  makeFlowchart,
  getCellPosition,
  getCellCenter,
  placeVertically,
  COLORS,
  FONTS,
  resetIndexCounter,
} from '../excalidraw';
import type { ExcalidrawElement } from '../excalidraw';

// POC-compatible lesson format
interface LessonSlide {
  narration: string;
  elements: ExcalidrawElement[];
}

export const makeLessonScript = (): LessonSlide[] => {
  const slides: LessonSlide[] = [];

  // === Slide 0: Title Slide ===
  {
    resetIndexCounter();
    const { x, y } = getCellCenter(0);

    const title = makeText({
      x: x - 250,
      y: y - 80,
      text: "How the Economy Works",
      fontSize: 48,
      color: COLORS.primary,
      bold: true,
      textAlign: "center",
      width: 500,
    });

    const subtitle = makeText({
      x: x - 200,
      y: y - 20,
      text: "Understanding the Flow of Money, Goods & Services",
      fontSize: 24,
      color: COLORS.secondary,
      textAlign: "center",
      width: 400,
    });

    const decorativeCircle = makeLabeledEllipse({
      x: x - 100,
      y: y + 40,
      width: 200,
      height: 100,
      label: "💰🏭🏠",
      fillColor: COLORS.light,
      shapeColor: COLORS.primary,
      fontSize: 32,
    });

    slides.push({
      narration: "Welcome to our lesson on how the economy works! Today we'll explore the fascinating world of economic systems, understanding how money, goods, and services flow between different parts of society.",
      elements: [title, subtitle, ...decorativeCircle],
    });
  }

  // === Slide 1: What is an Economy? ===
  {
    resetIndexCounter();
    const { x, y } = getCellPosition(1);

    const mainTitle = makeText({
      x: x + 50,
      y: y + 20,
      text: "What is an Economy?",
      fontSize: 36,
      color: COLORS.primary,
      bold: true,
    });

    const definition = makeCallout({
      x: x + 50,
      y: y + 80,
      width: 700,
      text: "An economy is a system where people produce, distribute, and consume goods and services",
      type: "info",
    });

    const keyComponents = placeVertically({
      x: x + 50,
      y: y + 200,
      spacing: 40,
      elements: [
        makeText({
          x: 0,
          y: 0,
          text: "🏭 Production: Making goods and providing services",
          fontSize: 24,
          width: 600,
        }),
        makeText({
          x: 0,
          y: 0,
          text: "🚚 Distribution: Moving goods from producers to consumers",
          fontSize: 24,
          width: 600,
        }),
        makeText({
          x: 0,
          y: 0,
          text: "🛒 Consumption: People buying and using goods and services",
          fontSize: 24,
          width: 600,
        }),
      ],
    });

    slides.push({
      narration: "An economy is essentially a system where people work together to create, share, and use the things we need. It involves three main activities: production where we make goods and services, distribution where we move these items to where they're needed, and consumption where people actually use them.",
      elements: [mainTitle, ...definition, ...keyComponents],
    });
  }

  // === Slide 2: The Main Players ===
  {
    resetIndexCounter();
    const { x, y } = getCellPosition(2);

    const title = makeText({
      x: x + 50,
      y: y + 20,
      text: "The Main Economic Players",
      fontSize: 36,
      color: COLORS.primary,
      bold: true,
    });

    const householdsBox = makeLabeledRectangle({
      x: x + 50,
      y: y + 100,
      width: 300,
      height: 120,
      label: "🏠 Households\n(Families & Individuals)",
      fillColor: COLORS.success,
      shapeColor: COLORS.dark,
      fontSize: 20,
    });

    const businessesBox = makeLabeledRectangle({
      x: x + 400,
      y: y + 100,
      width: 300,
      height: 120,
      label: "🏢 Businesses\n(Companies & Firms)",
      fillColor: COLORS.warning,
      shapeColor: COLORS.dark,
      fontSize: 20,
    });

    const governmentBox = makeLabeledRectangle({
      x: x + 50,
      y: y + 280,
      width: 300,
      height: 120,
      label: "🏛️ Government\n(Public Sector)",
      fillColor: COLORS.info,
      shapeColor: COLORS.dark,
      fontSize: 20,
    });

    const foreignBox = makeLabeledRectangle({
      x: x + 400,
      y: y + 280,
      width: 300,
      height: 120,
      label: "🌍 Foreign Sector\n(Other Countries)",
      fillColor: COLORS.secondary,
      shapeColor: COLORS.dark,
      fontSize: 20,
    });

    slides.push({
      narration: "Every economy has four main players. Households are families and individuals who consume goods and provide labor. Businesses are companies that produce goods and services. The government provides public services and regulates the economy. And the foreign sector represents trade with other countries.",
      elements: [
        title,
        ...householdsBox,
        ...businessesBox,
        ...governmentBox,
        ...foreignBox,
      ],
    });
  }

  // === Slide 3: The Circular Flow Model ===
  {
    resetIndexCounter();
    const { x, y } = getCellPosition(3);

    const title = makeText({
      x: x + 50,
      y: y + 20,
      text: "The Circular Flow of the Economy",
      fontSize: 36,
      color: COLORS.primary,
      bold: true,
    });

    // Create households and firms
    const householdsElements = makeLabeledEllipse({
      x: x + 100,
      y: y + 200,
      width: 180,
      height: 120,
      label: "🏠\nHouseholds",
      fillColor: COLORS.success,
      shapeColor: COLORS.dark,
      fontSize: 18,
    });

    const firmsElements = makeLabeledEllipse({
      x: x + 500,
      y: y + 200,
      width: 180,
      height: 120,
      label: "🏢\nFirms",
      fillColor: COLORS.warning,
      shapeColor: COLORS.dark,
      fontSize: 18,
    });

    // Create arrows for goods and services flow
    const goodsArrowElements = makeLabeledArrow({
      x: x + 280,
      y: y + 150,
      points: [
        [0, 0],
        [220, 0],
      ],
      label: "Goods & Services →",
      arrowStrokeColor: COLORS.danger,
      textStrokeColor: COLORS.danger,
      arrowStrokeWidth: 3,
      fontSize: 18,
    });

    // Create arrows for money flow
    const moneyArrowElements = makeLabeledArrow({
      x: x + 500,
      y: y + 350,
      points: [
        [0, 0],
        [-220, 0],
      ],
      label: "← Money (Payments)",
      arrowStrokeColor: COLORS.primary,
      textStrokeColor: COLORS.primary,
      arrowStrokeWidth: 3,
      fontSize: 18,
    });

    const explanation = makeText({
      x: x + 50,
      y: y + 420,
      text: "Money flows in one direction, goods and services flow in the opposite direction",
      fontSize: 20,
      color: COLORS.secondary,
      italic: true,
      width: 600,
    });

    slides.push({
      narration: "This is the circular flow model, one of the most important concepts in economics. Households provide labor and resources to firms, and in return receive money as wages and profits. Firms use this labor to produce goods and services, which flow back to households. The money and goods flow in opposite directions, creating a continuous cycle.",
      elements: [
        title,
        ...householdsElements,
        ...firmsElements,
        ...goodsArrowElements,
        ...moneyArrowElements,
        explanation,
      ],
    });
  }

  // === Slide 4: Real World Example ===
  {
    resetIndexCounter();
    const { x, y } = getCellPosition(4);

    const title = makeText({
      x: x + 50,
      y: y + 20,
      text: "Real World Example: Coffee Shop",
      fontSize: 36,
      color: COLORS.primary,
      bold: true,
    });

    // Create flowchart for coffee shop example
    const flowchartElements = makeFlowchart({
      x: x + 50,
      y: y + 100,
      nodes: [
        {
          id: "worker",
          label: "👨‍💼 Worker\nprovides labor",
          color: COLORS.success,
        },
        {
          id: "coffeeshop",
          label: "☕ Coffee Shop\nhires worker",
          color: COLORS.warning,
        },
        {
          id: "customer",
          label: "👤 Customer\nbuys coffee",
          color: COLORS.info,
        },
      ],
      connections: [
        { from: "worker", to: "coffeeshop", label: "Labor" },
        { from: "coffeeshop", to: "worker", label: "Wages" },
        { from: "coffeeshop", to: "customer", label: "Coffee" },
        { from: "customer", to: "coffeeshop", label: "Money" },
      ],
    });

    const explanation = makeCallout({
      x: x + 50,
      y: y + 350,
      width: 700,
      text: "The worker earns money and can now buy coffee (and other things) - the cycle continues!",
      type: "success",
    });

    slides.push({
      narration: "Let's see this in action with a simple coffee shop. A worker provides their labor to the coffee shop and receives wages in return. The coffee shop uses this labor to make coffee, which they sell to customers for money. Now here's the beautiful part - that worker can use their wages to buy coffee, and the cycle continues! This is how the economy keeps flowing.",
      elements: [title, ...flowchartElements, ...explanation],
    });
  }

  return slides;
};
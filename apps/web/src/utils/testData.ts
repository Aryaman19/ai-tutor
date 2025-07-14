import { makeText, makeRectangle, makeLabeledArrow, COLORS, getCellPosition } from './excalidraw';
import type { LessonStep } from './excalidraw';

// Sample lesson data for testing Excalidraw integration
export function generateSampleLesson(): LessonStep[] {
  return [
    {
      step_number: 1,
      title: "Introduction to Economics",
      explanation: "Economics is the study of how societies use scarce resources to produce valuable commodities and distribute them among different people.",
      narration: "Welcome to our lesson on economics! Let's start by understanding what economics really means. Think of economics as the study of choices - how we decide what to make, how to make it, and who gets what.",
      elements: [
        makeText(100, 100, "Economics", {
          fontSize: 32,
          strokeColor: COLORS.PRIMARY,
          textAlign: "center"
        }),
        makeText(100, 150, "The study of choices and resources", {
          fontSize: 16,
          strokeColor: COLORS.SECONDARY
        })
      ]
    },
    {
      step_number: 2,
      title: "Supply and Demand",
      explanation: "Supply and demand is the fundamental economic principle that describes the relationship between the availability of a good and the desire for that good.",
      narration: "Now let's explore the most important concept in economics: supply and demand. Imagine you're at a farmer's market - this is where supply meets demand!",
      elements: [
        makeRectangle(200, 200, 120, 60, {
          backgroundColor: COLORS.LIGHT_GRAY,
          strokeColor: COLORS.BLUE
        }),
        makeText(210, 220, "Supply", {
          fontSize: 18,
          strokeColor: COLORS.BLUE
        }),
        makeRectangle(400, 200, 120, 60, {
          backgroundColor: COLORS.LIGHT_GRAY,
          strokeColor: COLORS.GREEN
        }),
        makeText(410, 220, "Demand", {
          fontSize: 18,
          strokeColor: COLORS.GREEN
        }),
        ...makeLabeledArrow(320, 230, 400, 230, "affects", {
          strokeColor: COLORS.SECONDARY
        })
      ]
    },
    {
      step_number: 3,
      title: "Market Equilibrium",
      explanation: "Market equilibrium occurs when supply equals demand, resulting in a stable price where both buyers and sellers are satisfied.",
      narration: "When supply and demand meet in the middle, we get what economists call equilibrium. It's like finding the perfect balance on a see-saw!",
      elements: [
        makeRectangle(300, 300, 100, 50, {
          backgroundColor: COLORS.SUCCESS,
          strokeColor: COLORS.PRIMARY
        }),
        makeText(310, 315, "Equilibrium", {
          fontSize: 16,
          strokeColor: COLORS.BLACK
        }),
        makeText(250, 380, "Perfect Balance!", {
          fontSize: 20,
          strokeColor: COLORS.SUCCESS
        })
      ]
    },
    {
      step_number: 4,
      title: "Price Changes",
      explanation: "When supply or demand changes, prices adjust to restore equilibrium. High demand with low supply increases prices, while high supply with low demand decreases prices.",
      narration: "But what happens when things change? If everyone suddenly wants ice cream on a hot day, but there's not enough to go around, what do you think happens to the price?",
      elements: [
        makeText(150, 450, "High Demand + Low Supply = Higher Prices", {
          fontSize: 14,
          strokeColor: COLORS.RED
        }),
        makeText(150, 480, "Low Demand + High Supply = Lower Prices", {
          fontSize: 14,
          strokeColor: COLORS.BLUE
        })
      ]
    },
    {
      step_number: 5,
      title: "Real World Application",
      explanation: "These economic principles apply everywhere - from your local grocery store to global markets. Understanding them helps you make better decisions as both a consumer and citizen.",
      narration: "And that's economics in action! These principles work everywhere - when you buy your morning coffee, when companies decide what to produce, even when governments make policy decisions. You're now equipped with the fundamental tools to understand how our economy works!",
      elements: [
        makeText(200, 550, "Economics is everywhere!", {
          fontSize: 24,
          strokeColor: COLORS.PRIMARY,
          textAlign: "center"
        }),
        makeText(150, 600, "✓ Shopping decisions", {
          fontSize: 16,
          strokeColor: COLORS.SECONDARY
        }),
        makeText(150, 630, "✓ Business strategies", {
          fontSize: 16,
          strokeColor: COLORS.SECONDARY
        }),
        makeText(150, 660, "✓ Government policies", {
          fontSize: 16,
          strokeColor: COLORS.SECONDARY
        })
      ]
    }
  ];
}
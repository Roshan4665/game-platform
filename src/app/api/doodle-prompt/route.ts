import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";

const CATEGORIES = [
  "an animal doing something funny",
  "a food item with a personality",
  "a household object with emotions",
  "a vehicle in a silly situation",
  "a weather phenomenon as a character",
  "a musical instrument with legs",
  "a piece of clothing that's alive",
  "a plant doing something unexpected",
  "a space object with a face",
  "a sea creature on land",
  "a bug with a job",
  "a fruit playing sports",
  "a tool with feelings",
  "a dessert as a superhero",
  "a bird in a costume",
];

export async function POST(req: NextRequest) {
  try {
    let previousPrompts: string[] = [];
    try {
      const body = await req.json();
      previousPrompts = body.previousPrompts || [];
    } catch {
      // no body is fine
    }

    // Pick a random category for variety
    const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    const seed = Math.floor(Math.random() * 10000);

    const avoidClause = previousPrompts.length > 0
      ? `Do NOT use any of these (already used): ${previousPrompts.join(", ")}.`
      : "";

    const { text } = await generateText({
      model: google("gemma-3-27b-it"),
      prompt: `Generate ONE simple, fun thing to draw. Category hint: ${category}. It must be easy to doodle in under 60 seconds. Keep it to 2-3 words max. Be creative and unique (seed: ${seed}). ${avoidClause} Output ONLY the thing to draw, nothing else.`,
    });

    return NextResponse.json({ prompt: text.trim() });
  } catch (error) {
    console.error("Prompt generation error:", error);
    return NextResponse.json({ error: "Failed to generate prompt" }, { status: 500 });
  }
}

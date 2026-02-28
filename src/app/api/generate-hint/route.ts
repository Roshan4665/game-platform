import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { word, existingHints } = await req.json();

    const hintsContext =
      existingHints?.length > 0
        ? `Previous hints already given (do NOT repeat these): ${existingHints.join(", ")}.`
        : "";

    const { text } = await generateText({
      model: google("gemma-3-27b-it"),
      prompt: `You are a hint generator for a word guessing game. The secret word is "${word}". ${hintsContext} Give exactly ONE short, clever hint (one sentence max) that helps guess the word without saying it directly. Do not include the word itself or any obvious giveaway. Just output the hint, nothing else.`,
    });

    return NextResponse.json({ hint: text.trim() });
  } catch (error) {
    console.error("Hint generation error:", error);
    return NextResponse.json({ error: "Failed to generate hint" }, { status: 500 });
  }
}

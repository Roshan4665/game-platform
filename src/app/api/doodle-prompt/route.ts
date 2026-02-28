import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    let previousPrompts: string[] = [];
    try {
      const body = await req.json();
      previousPrompts = body.previousPrompts || [];
    } catch {
      // no body is fine
    }

    const avoidClause = previousPrompts.length > 0
      ? `Do NOT use any of these (already used): ${previousPrompts.join(", ")}.`
      : "";

    const { text } = await generateText({
      model: google("gemma-3-27b-it"),
      prompt: `Generate ONE simple, fun thing to draw in a casual drawing game between friends. It must be easy to doodle in under 60 seconds — think simple objects or animals with a small twist. Examples: "happy sun", "angry cloud", "cat with hat", "dancing banana", "sleepy moon", "robot dog". Keep it to 2-3 words max. Be creative. ${avoidClause} Output ONLY the thing to draw, nothing else.`,
    });

    return NextResponse.json({ prompt: text.trim() });
  } catch (error) {
    console.error("Prompt generation error:", error);
    return NextResponse.json({ error: "Failed to generate prompt" }, { status: 500 });
  }
}

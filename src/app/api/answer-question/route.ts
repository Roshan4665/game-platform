import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { word, question } = await req.json();

    const { text } = await generateText({
      model: google("gemma-3-27b-it"),
      prompt: `You are playing a Yes/No guessing game. The secret word is "${word}". The player asked: "${question}". Answer ONLY "yes" or "no" — nothing else. Be accurate and honest.`,
    });

    const answer = text.trim().toLowerCase().startsWith("yes") ? "yes" : "no";
    return NextResponse.json({ answer });
  } catch (error) {
    console.error("Answer generation error:", error);
    return NextResponse.json({ error: "Failed to generate answer" }, { status: 500 });
  }
}

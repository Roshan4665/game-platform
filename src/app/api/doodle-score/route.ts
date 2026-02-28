import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { prompt, drawings, isFinal } = await req.json();

    const playerEntries = Object.entries(drawings) as [string, { name: string; imageData: string }][];

    if (playerEntries.length < 2) {
      return NextResponse.json({ error: "Need 2 drawings to compare" }, { status: 400 });
    }

    const [idA, playerA] = playerEntries[0];
    const [idB, playerB] = playerEntries[1];

    const toDataUrl = (d: string) => d.startsWith("data:") ? d : `data:image/png;base64,${d}`;

    // Different prompts for midway vs final
    const jsonInstruction = isFinal
      ? `This is the FINAL scoring. Score each drawing 0-10 based on accuracy to the prompt and comparative quality. Also write a single "verdict" sentence comparing both drawings.
Respond in EXACTLY this JSON format, nothing else:
{"playerA": {"score": <0-10>}, "playerB": {"score": <0-10>}, "verdict": "<one sentence comparing both drawings and explaining who did better and why>"}`
      : `This is a MIDWAY check (players are still drawing). Score each drawing 0-10 so far, and give each player a short suggestion on how to improve their drawing in the remaining time.
Respond in EXACTLY this JSON format, nothing else:
{"playerA": {"score": <0-10>, "suggestion": "<short improvement tip>"}, "playerB": {"score": <0-10>, "suggestion": "<short improvement tip>"}}`;

    const { text } = await generateText({
      model: google("gemma-3-27b-it"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are judging a drawing competition. The prompt was: "${prompt}".

Player A is "${playerA.name}". Player B is "${playerB.name}".

Here is Player A's drawing:`,
            },
            { type: "image", image: toDataUrl(playerA.imageData) },
            { type: "text", text: "Here is Player B's drawing:" },
            { type: "image", image: toDataUrl(playerB.imageData) },
            { type: "text", text: jsonInstruction },
          ],
        },
      ],
    });

    let parsed;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch?.[0] || text);
    } catch {
      parsed = isFinal
        ? { playerA: { score: 5 }, playerB: { score: 5 }, verdict: "Both gave it a good shot!" }
        : { playerA: { score: 5, suggestion: "Keep going!" }, playerB: { score: 5, suggestion: "Keep going!" } };
    }

    const clamp = (n: number) => Math.min(10, Math.max(0, Math.round(n ?? 5)));

    if (isFinal) {
      return NextResponse.json({
        scores: {
          [idA]: { score: clamp(parsed.playerA?.score) },
          [idB]: { score: clamp(parsed.playerB?.score) },
        },
        verdict: parsed.verdict || "Both gave it a good shot!",
      });
    }

    return NextResponse.json({
      scores: {
        [idA]: { score: clamp(parsed.playerA?.score), suggestion: parsed.playerA?.suggestion || "Keep going!" },
        [idB]: { score: clamp(parsed.playerB?.score), suggestion: parsed.playerB?.suggestion || "Keep going!" },
      },
    });
  } catch (error) {
    console.error("Doodle scoring error:", error);
    return NextResponse.json({ error: "Failed to score drawings" }, { status: 500 });
  }
}

"use client";

import { useRef, useEffect, useState, useCallback } from "react";

interface Props {
  onSave: (imageData: string) => void;
  disabled?: boolean;
  saveInterval?: number; // ms between auto-saves
}

const EXPORT_SIZE = 896; // Match Gemma 3 vision encoder

export default function DrawingCanvas({ onSave, disabled = false, saveInterval = 5000 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(4);
  const [brushColor, setBrushColor] = useState("#000000");
  const [canvasSize, setCanvasSize] = useState(400);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const hasDrawnRef = useRef(false);

  // Responsive 1:1 canvas sizing
  useEffect(() => {
    const updateSize = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth;
      const maxSize = Math.min(containerWidth, window.innerHeight * 0.55);
      const size = Math.floor(maxSize);
      setCanvasSize(size);
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Initialize canvas with white background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [canvasSize]);

  // Get position from mouse/touch event, normalized to canvas internal coords
  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ("touches" in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const drawLine = useCallback((from: { x: number; y: number }, to: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }, [brushColor, brushSize]);

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    setIsDrawing(true);
    const pos = getPos(e);
    lastPointRef.current = pos;
    hasDrawnRef.current = true;
  }, [disabled, getPos]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || disabled) return;
    e.preventDefault();
    const pos = getPos(e);
    if (lastPointRef.current) {
      drawLine(lastPointRef.current, pos);
    }
    lastPointRef.current = pos;
  }, [isDrawing, disabled, getPos, drawLine]);

  const endDraw = useCallback(() => {
    setIsDrawing(false);
    lastPointRef.current = null;
  }, []);

  // Export at 896x896 for Gemma 3
  const exportCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return "";
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = EXPORT_SIZE;
    exportCanvas.height = EXPORT_SIZE;
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return "";
    // White background
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);
    // Draw scaled
    ctx.drawImage(canvas, 0, 0, EXPORT_SIZE, EXPORT_SIZE);
    return exportCanvas.toDataURL("image/png");
  }, []);

  // Auto-save at interval
  useEffect(() => {
    if (disabled) return;
    const interval = setInterval(() => {
      if (hasDrawnRef.current) {
        const data = exportCanvas();
        if (data) onSave(data);
      }
    }, saveInterval);
    return () => clearInterval(interval);
  }, [disabled, exportCanvas, onSave, saveInterval]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    hasDrawnRef.current = false;
  };

  const colors = ["#000000", "#EF4444", "#3B82F6", "#22C55E", "#EAB308", "#A855F7", "#F97316", "#EC4899"];

  return (
    <div ref={containerRef} className="w-full flex flex-col items-center gap-3">
      <canvas
        ref={canvasRef}
        width={canvasSize}
        height={canvasSize}
        className="border-2 border-gray-700 rounded-lg cursor-crosshair touch-none bg-white"
        style={{ width: canvasSize, height: canvasSize, maxWidth: "100%" }}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />

      {!disabled && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {/* Colors */}
          <div className="flex gap-1">
            {colors.map((c) => (
              <button
                key={c}
                onClick={() => setBrushColor(c)}
                className={`w-7 h-7 rounded-full border-2 transition-transform ${
                  brushColor === c ? "border-white scale-110" : "border-gray-600"
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
              />
            ))}
            {/* Eraser */}
            <button
              onClick={() => setBrushColor("#FFFFFF")}
              className={`w-7 h-7 rounded-full border-2 bg-white transition-transform ${
                brushColor === "#FFFFFF" ? "border-purple-400 scale-110" : "border-gray-600"
              }`}
              aria-label="Eraser"
            >
              <span className="text-xs">⌫</span>
            </button>
          </div>

          {/* Brush size */}
          <input
            type="range"
            min={1}
            max={20}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-20"
            aria-label="Brush size"
          />

          <button
            onClick={clearCanvas}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

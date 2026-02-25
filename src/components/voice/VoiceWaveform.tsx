import { useEffect, useRef } from 'react';

interface VoiceWaveformProps {
  analyser: AnalyserNode | null;
  isActive: boolean;
}

export function VoiceWaveform({ analyser, isActive }: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser || !isActive) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const barCount = 32;
    const barGap = 2;

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      const barWidth = (width - barGap * (barCount - 1)) / barCount;
      const step = Math.floor(bufferLength / barCount);

      for (let i = 0; i < barCount; i++) {
        const value = dataArray[i * step] / 255;
        const barHeight = Math.max(3, value * height * 0.9);

        const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
        gradient.addColorStop(0, '#4ade80');
        gradient.addColorStop(1, '#16a34a');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(
          i * (barWidth + barGap),
          height - barHeight,
          barWidth,
          barHeight,
          2
        );
        ctx.fill();
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [analyser, isActive]);

  if (!isActive) {
    return (
      <div className="flex items-center justify-center gap-1 h-10">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="w-1 bg-gray-300 rounded-full"
            style={{ height: 8 + Math.random() * 12 }}
          />
        ))}
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={240}
      height={40}
      className="w-full h-10"
    />
  );
}

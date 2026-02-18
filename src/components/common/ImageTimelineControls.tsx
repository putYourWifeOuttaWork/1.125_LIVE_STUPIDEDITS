import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Rewind,
  FastForward,
} from 'lucide-react';
import { PLAYBACK_SPEEDS } from '../../hooks/useImageAutoPlay';

interface ImageTimelineControlsProps {
  totalImages: number;
  currentIndex: number;
  isPlaying: boolean;
  speedIndex: number;
  onSpeedChange: (index: number) => void;
  onTogglePlayPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSkipToStart: () => void;
  onSkipToEnd: () => void;
  onSliderChange: (index: number) => void;
  timestamps?: string[];
  className?: string;
}

const formatTimestamp = (ts: string) => {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ', ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
};

export default function ImageTimelineControls({
  totalImages,
  currentIndex,
  isPlaying,
  speedIndex,
  onSpeedChange,
  onTogglePlayPause,
  onPrevious,
  onNext,
  onSkipToStart,
  onSkipToEnd,
  onSliderChange,
  timestamps,
  className = '',
}: ImageTimelineControlsProps) {
  const sliderPercent =
    totalImages > 1 ? (currentIndex / (totalImages - 1)) * 100 : 0;

  const handleSliderInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSliderChange(parseInt(e.target.value, 10));
  };

  return (
    <div className={`bg-gray-50 border border-gray-200 rounded-lg ${className}`}>
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 rounded-full">
            <Play className="w-3 h-3 text-blue-600" />
            <span className="text-[11px] font-semibold text-blue-700">Timeline</span>
          </div>
          <div className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{currentIndex + 1}</span>
            <span className="text-gray-400 mx-1">of</span>
            <span className="font-semibold text-gray-900">{totalImages}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-[11px] text-gray-500">Speed:</label>
          <select
            value={speedIndex}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            className="text-[11px] border border-gray-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            {PLAYBACK_SPEEDS.map((opt, i) => (
              <option key={opt.label} value={i}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="px-3 py-1.5">
        <input
          type="range"
          min="0"
          max={Math.max(0, totalImages - 1)}
          value={currentIndex}
          onChange={handleSliderInput}
          className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${sliderPercent}%, #e5e7eb ${sliderPercent}%, #e5e7eb 100%)`,
          }}
        />
        {timestamps && timestamps.length > 1 && (
          <div className="flex justify-between mt-0.5 text-[9px] text-gray-400">
            <span>{formatTimestamp(timestamps[0])}</span>
            {timestamps.length > 2 && (
              <span>{formatTimestamp(timestamps[Math.floor(timestamps.length / 2)])}</span>
            )}
            <span>{formatTimestamp(timestamps[timestamps.length - 1])}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-1 pb-2.5">
        <button
          onClick={onSkipToStart}
          disabled={currentIndex === 0}
          className="p-1.5 rounded-md text-gray-600 hover:bg-gray-200 disabled:text-gray-300 disabled:hover:bg-transparent transition-colors"
          title="Skip to start"
        >
          <Rewind className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onPrevious}
          disabled={currentIndex === 0}
          className="p-1.5 rounded-md text-gray-600 hover:bg-gray-200 disabled:text-gray-300 disabled:hover:bg-transparent transition-colors"
          title="Previous image"
        >
          <SkipBack className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onTogglePlayPause}
          className="p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" />
          )}
        </button>
        <button
          onClick={onNext}
          disabled={currentIndex >= totalImages - 1}
          className="p-1.5 rounded-md text-gray-600 hover:bg-gray-200 disabled:text-gray-300 disabled:hover:bg-transparent transition-colors"
          title="Next image"
        >
          <SkipForward className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onSkipToEnd}
          disabled={currentIndex >= totalImages - 1}
          className="p-1.5 rounded-md text-gray-600 hover:bg-gray-200 disabled:text-gray-300 disabled:hover:bg-transparent transition-colors"
          title="Skip to end"
        >
          <FastForward className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

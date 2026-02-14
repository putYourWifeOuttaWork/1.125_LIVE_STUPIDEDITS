import { useState, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Rewind,
  FastForward,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import Button from '../common/Button';
import type { ReportSnapshot } from '../../types/analytics';

interface SnapshotTimelinePlayerProps {
  snapshots: ReportSnapshot[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  transitionDuration: number;
  className?: string;
}

const SPEED_OPTIONS = [
  { label: '0.5x', durationMs: 4000 },
  { label: '1x', durationMs: 2500 },
  { label: '1.5x', durationMs: 1500 },
  { label: '2x', durationMs: 800 },
];

export default function SnapshotTimelinePlayer({
  snapshots,
  currentIndex,
  onIndexChange,
  onClose,
  transitionDuration,
  className = '',
}: SnapshotTimelinePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(1);
  const total = snapshots.length;

  const effectiveSpeed = SPEED_OPTIONS[speedIndex].durationMs;

  useEffect(() => {
    if (!isPlaying) return;

    const timer = setTimeout(() => {
      if (currentIndex >= total - 1) {
        setIsPlaying(false);
        return;
      }
      onIndexChange(currentIndex + 1);
    }, effectiveSpeed + transitionDuration);

    return () => clearTimeout(timer);
  }, [isPlaying, currentIndex, total, effectiveSpeed, transitionDuration, onIndexChange]);

  const handlePlayPause = useCallback(() => {
    if (currentIndex >= total - 1) {
      onIndexChange(0);
    }
    setIsPlaying((prev) => !prev);
  }, [currentIndex, total, onIndexChange]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onIndexChange(parseInt(e.target.value, 10));
    setIsPlaying(false);
  };

  const handlePrevious = () => {
    onIndexChange(Math.max(0, currentIndex - 1));
    setIsPlaying(false);
  };

  const handleNext = () => {
    onIndexChange(Math.min(total - 1, currentIndex + 1));
    setIsPlaying(false);
  };

  const handleSkipStart = () => {
    onIndexChange(0);
    setIsPlaying(false);
  };

  const handleSkipEnd = () => {
    onIndexChange(total - 1);
    setIsPlaying(false);
  };

  const currentSnapshot = snapshots[currentIndex];

  const formatTimestamp = (ts: string) => {
    try {
      return format(new Date(ts), 'MMM d, yyyy h:mm a');
    } catch {
      return 'Unknown';
    }
  };

  const sliderPercent =
    total > 1 ? (currentIndex / (total - 1)) * 100 : 0;

  return (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-sm ${className}`}>
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 rounded-full">
            <Play className="w-3 h-3 text-blue-600" />
            <span className="text-xs font-semibold text-blue-700">Timeline Playback</span>
          </div>
          <div className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{currentIndex + 1}</span>
            <span className="text-gray-400 mx-1">of</span>
            <span className="font-semibold text-gray-900">{total}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">Speed:</label>
            <select
              value={speedIndex}
              onChange={(e) => setSpeedIndex(Number(e.target.value))}
              className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {SPEED_OPTIONS.map((opt, i) => (
                <option key={opt.label} value={i}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Exit playback"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {currentSnapshot && (
        <div className="px-4 pb-1">
          <p className="text-xs text-gray-500 truncate">
            {currentSnapshot.snapshot_name}
            <span className="mx-1.5 text-gray-300">|</span>
            {formatTimestamp(currentSnapshot.created_at)}
          </p>
        </div>
      )}

      <div className="px-4 py-2">
        <input
          type="range"
          min="0"
          max={Math.max(0, total - 1)}
          value={currentIndex}
          onChange={handleSliderChange}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${sliderPercent}%, #e5e7eb ${sliderPercent}%, #e5e7eb 100%)`,
          }}
        />
        <div className="flex justify-between mt-0.5 text-[10px] text-gray-400">
          {total > 0 && (
            <span>
              {formatTimestamp(snapshots[0].created_at)}
            </span>
          )}
          {total > 2 && (
            <span>
              {formatTimestamp(snapshots[Math.floor(total / 2)].created_at)}
            </span>
          )}
          {total > 1 && (
            <span>
              {formatTimestamp(snapshots[total - 1].created_at)}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-1.5 pb-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSkipStart}
          disabled={currentIndex === 0}
          className="!p-2"
          title="Skip to start"
        >
          <Rewind className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrevious}
          disabled={currentIndex === 0}
          className="!p-2"
          title="Previous snapshot"
        >
          <SkipBack className="w-4 h-4" />
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handlePlayPause}
          className="!px-5"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" />
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleNext}
          disabled={currentIndex >= total - 1}
          className="!p-2"
          title="Next snapshot"
        >
          <SkipForward className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSkipEnd}
          disabled={currentIndex >= total - 1}
          className="!p-2"
          title="Skip to end"
        >
          <FastForward className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

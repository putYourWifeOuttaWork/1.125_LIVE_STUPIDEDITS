import { useState, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Rewind, FastForward } from 'lucide-react';
import Button from '../common/Button';
import { format } from 'date-fns';

interface TimelineControllerProps {
  totalWakes: number;
  currentWake: number;
  onWakeChange: (wakeNumber: number) => void;
  wakeTimestamps?: string[]; // Array of ISO timestamps for each wake
  autoPlaySpeed?: number; // milliseconds between frames (default 2000)
  className?: string;
}

export function TimelineController({
  totalWakes,
  currentWake,
  onWakeChange,
  wakeTimestamps = [],
  autoPlaySpeed = 2000,
  className = '',
}: TimelineControllerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(autoPlaySpeed);

  // Auto-play logic
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      if (currentWake >= totalWakes) {
        setIsPlaying(false);
        return;
      }
      onWakeChange(currentWake + 1);
    }, playbackSpeed);

    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, totalWakes, currentWake, onWakeChange]);

  const handlePlayPause = () => {
    if (currentWake >= totalWakes) {
      // If at the end, restart from beginning
      onWakeChange(1);
    }
    setIsPlaying(!isPlaying);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newWake = parseInt(e.target.value, 10);
    onWakeChange(newWake);
    setIsPlaying(false);
  };

  const handlePrevious = () => {
    onWakeChange(Math.max(1, currentWake - 1));
    setIsPlaying(false);
  };

  const handleNext = () => {
    onWakeChange(Math.min(totalWakes, currentWake + 1));
    setIsPlaying(false);
  };

  const handleSkipToStart = () => {
    onWakeChange(1);
    setIsPlaying(false);
  };

  const handleSkipToEnd = () => {
    onWakeChange(totalWakes);
    setIsPlaying(false);
  };

  // Ensure currentWake is a valid number
  const validCurrentWake = Number.isFinite(currentWake) ? currentWake : 1;

  // Get timestamp for current wake
  const currentTimestamp = wakeTimestamps[validCurrentWake - 1];

  // Format the timestamp
  const formatWakeTime = (timestamp: string) => {
    try {
      return format(new Date(timestamp), 'MMM d, yyyy h:mm a');
    } catch {
      return 'Unknown time';
    }
  };

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-3 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">
            Wake #{validCurrentWake} of {totalWakes}
          </h3>
          {currentTimestamp && (
            <p className="text-xs text-gray-500 mt-1">
              {formatWakeTime(currentTimestamp)}
            </p>
          )}
        </div>

        {/* Speed control */}
        <div className="flex items-center gap-2">
          <label htmlFor="speed" className="text-xs text-gray-600">
            Speed:
          </label>
          <select
            id="speed"
            value={playbackSpeed}
            onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
            className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={500}>2x</option>
            <option value={1000}>1.5x</option>
            <option value={2000}>1x</option>
            <option value={4000}>0.5x</option>
          </select>
        </div>
      </div>

      {/* Timeline slider */}
      <div className="mb-2">
        <input
          type="range"
          min="1"
          max={totalWakes}
          value={validCurrentWake}
          onChange={handleSliderChange}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          style={{
            background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((validCurrentWake - 1) / (totalWakes - 1)) * 100}%, #e5e7eb ${((validCurrentWake - 1) / (totalWakes - 1)) * 100}%, #e5e7eb 100%)`,
          }}
        />

        {/* Wake markers */}
        <div className="flex justify-between mt-1 px-1">
          {[1, Math.floor(totalWakes / 2), totalWakes]
            .filter((wake, idx, arr) => arr.indexOf(wake) === idx)
            .map((wake, idx) => (
              <span
                key={`wake-${wake}-${idx}`}
                className={`text-xs ${idx === 1 ? 'text-gray-500' : 'text-gray-400'}`}
              >
                #{wake}
              </span>
            ))}
        </div>
      </div>

      {/* Playback controls */}
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSkipToStart}
          disabled={currentWake === 1}
          className="!p-2"
          title="Skip to start"
        >
          <Rewind className="w-4 h-4" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handlePrevious}
          disabled={currentWake === 1}
          className="!p-2"
          title="Previous wake"
        >
          <SkipBack className="w-4 h-4" />
        </Button>

        <Button
          variant="primary"
          size="sm"
          onClick={handlePlayPause}
          className="!px-4"
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
          disabled={currentWake === totalWakes}
          className="!p-2"
          title="Next wake"
        >
          <SkipForward className="w-4 h-4" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleSkipToEnd}
          disabled={currentWake === totalWakes}
          className="!p-2"
          title="Skip to end"
        >
          <FastForward className="w-4 h-4" />
        </Button>
      </div>

      {/* Info text */}
      <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500">
        <p>
          Use the slider or playback controls to navigate through device wake
          cycles and observe spatial MGI progression over time.
        </p>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Rewind, FastForward, Radio } from 'lucide-react';
import Button from '../common/Button';
import { format } from 'date-fns';

interface TimelineControllerProps {
  totalWakes: number;
  currentWake: number;
  onWakeChange: (wakeNumber: number) => void;
  wakeTimestamps?: string[];
  autoPlaySpeed?: number;
  className?: string;
  isLive?: boolean;
  onExitLive?: () => void;
  onReturnToLive?: () => void;
  canGoLive?: boolean;
}

export function TimelineController({
  totalWakes,
  currentWake,
  onWakeChange,
  wakeTimestamps = [],
  autoPlaySpeed = 2000,
  className = '',
  isLive = false,
  onExitLive,
  onReturnToLive,
  canGoLive = false,
}: TimelineControllerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(autoPlaySpeed);

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
      onWakeChange(1);
    }
    setIsPlaying(!isPlaying);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newWake = parseInt(e.target.value, 10);
    onWakeChange(newWake);
    setIsPlaying(false);
    if (isLive && onExitLive) {
      onExitLive();
    }
  };

  const handlePrevious = () => {
    onWakeChange(Math.max(1, currentWake - 1));
    setIsPlaying(false);
    if (isLive && onExitLive) {
      onExitLive();
    }
  };

  const handleNext = () => {
    onWakeChange(Math.min(totalWakes, currentWake + 1));
    setIsPlaying(false);
    if (isLive && onExitLive) {
      onExitLive();
    }
  };

  const handleSkipToStart = () => {
    onWakeChange(1);
    setIsPlaying(false);
    if (isLive && onExitLive) {
      onExitLive();
    }
  };

  const handleSkipToEnd = () => {
    onWakeChange(totalWakes);
    setIsPlaying(false);
  };

  const validCurrentWake = Number.isFinite(currentWake) ? currentWake : 1;
  const currentTimestamp = wakeTimestamps[validCurrentWake - 1];

  const formatWakeTime = (timestamp: string) => {
    try {
      return format(new Date(timestamp), 'MMM d, yyyy h:mm a');
    } catch {
      return 'Unknown time';
    }
  };

  if (isLive) {
    const latestTimestamp = wakeTimestamps[wakeTimestamps.length - 1];

    return (
      <div className={`bg-white rounded-lg border border-green-200 p-3 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
              </span>
              <span className="text-sm font-semibold text-green-700">LIVE</span>
            </div>
            <div className="h-4 w-px bg-gray-300" />
            <div>
              <span className="text-sm text-gray-700">
                Wake #{totalWakes} of {totalWakes}
              </span>
              {latestTimestamp && (
                <span className="text-xs text-gray-500 ml-2">
                  {formatWakeTime(latestTimestamp)}
                </span>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (onExitLive) onExitLive();
            }}
            className="text-xs"
          >
            <Rewind className="w-3 h-3 mr-1" />
            Review Timeline
          </Button>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          Showing latest snapshot data. Refreshing every 60 seconds.
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-3 ${className}`}>
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

        <div className="flex items-center gap-2">
          {canGoLive && onReturnToLive && (
            <Button
              variant="primary"
              size="sm"
              onClick={onReturnToLive}
              className="text-xs !py-1 !px-2 bg-green-600 hover:bg-green-700"
            >
              <Radio className="w-3 h-3 mr-1" />
              Return to Live
            </Button>
          )}
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

      <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500">
        <p>
          Use the slider or playback controls to navigate through device wake
          cycles and observe spatial MGI progression over time.
        </p>
      </div>
    </div>
  );
}

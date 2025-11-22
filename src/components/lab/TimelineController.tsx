import { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, ChevronsLeft, ChevronsRight } from 'lucide-react';
import Button from '../common/Button';
import { format } from 'date-fns';

interface TimelineControllerProps {
  totalWakes: number;
  currentWake: number;
  onWakeChange: (wakeNumber: number) => void;
  wakeTimestamps?: string[];
  autoPlaySpeed?: number; // milliseconds between frames
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
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-play functionality
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        onWakeChange(currentWake < totalWakes ? currentWake + 1 : 1);
      }, autoPlaySpeed);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, currentWake, totalWakes, onWakeChange, autoPlaySpeed]);

  // Stop playing when reaching the end
  useEffect(() => {
    if (currentWake >= totalWakes && isPlaying) {
      setIsPlaying(false);
    }
  }, [currentWake, totalWakes, isPlaying]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handlePrevious = () => {
    if (currentWake > 1) {
      onWakeChange(currentWake - 1);
    }
  };

  const handleNext = () => {
    if (currentWake < totalWakes) {
      onWakeChange(currentWake + 1);
    }
  };

  const handleFirst = () => {
    onWakeChange(1);
  };

  const handleLast = () => {
    onWakeChange(totalWakes);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    onWakeChange(value);
    setIsPlaying(false);
  };

  const getCurrentTimestamp = () => {
    if (wakeTimestamps && wakeTimestamps[currentWake - 1]) {
      try {
        return format(new Date(wakeTimestamps[currentWake - 1]), 'MMM d, yyyy h:mm a');
      } catch {
        return '';
      }
    }
    return '';
  };

  if (totalWakes <= 1) {
    return null;
  }

  return (
    <div className={`bg-gray-50 rounded-lg p-4 ${className}`}>
      <div className="flex items-center gap-4">
        {/* Playback controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleFirst}
            disabled={currentWake === 1}
            title="First wake"
          >
            <ChevronsLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevious}
            disabled={currentWake === 1}
            title="Previous wake"
          >
            <SkipBack className="w-4 h-4" />
          </Button>
          <Button
            variant={isPlaying ? 'danger' : 'primary'}
            size="sm"
            onClick={handlePlayPause}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNext}
            disabled={currentWake === totalWakes}
            title="Next wake"
          >
            <SkipForward className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLast}
            disabled={currentWake === totalWakes}
            title="Last wake"
          >
            <ChevronsRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Timeline slider */}
        <div className="flex-1 flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
            Wake {currentWake} / {totalWakes}
          </span>
          <input
            type="range"
            min="1"
            max={totalWakes}
            value={currentWake}
            onChange={handleSliderChange}
            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          {getCurrentTimestamp() && (
            <span className="text-xs text-gray-500 whitespace-nowrap">
              {getCurrentTimestamp()}
            </span>
          )}
        </div>

        {/* Speed indicator */}
        {isPlaying && (
          <span className="text-xs text-gray-500">
            {(1000 / autoPlaySpeed).toFixed(1)}x
          </span>
        )}
      </div>

      {/* Timeline visualization */}
      <div className="mt-3 h-1 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 transition-all duration-300"
          style={{ width: `${(currentWake / totalWakes) * 100}%` }}
        />
      </div>
    </div>
  );
}

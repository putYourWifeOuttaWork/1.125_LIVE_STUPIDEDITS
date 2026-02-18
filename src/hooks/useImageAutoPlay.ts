import { useState, useEffect, useCallback, useRef } from 'react';

export const PLAYBACK_SPEEDS = [
  { label: '0.5x', durationMs: 4000 },
  { label: '1x', durationMs: 2500 },
  { label: '1.5x', durationMs: 1500 },
  { label: '2x', durationMs: 800 },
] as const;

const TRANSITION_DURATION = 400;

interface UseImageAutoPlayOptions {
  totalImages: number;
  currentIndex: number;
  onIndexChange: (index: number) => void;
  transitionDuration?: number;
}

export function useImageAutoPlay({
  totalImages,
  currentIndex,
  onIndexChange,
  transitionDuration = TRANSITION_DURATION,
}: UseImageAutoPlayOptions) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(1);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const effectiveSpeed = PLAYBACK_SPEEDS[speedIndex].durationMs;

  useEffect(() => {
    if (!isPlaying) return;

    const timer = setTimeout(() => {
      if (currentIndex >= totalImages - 1) {
        setIsPlaying(false);
        return;
      }
      setIsTransitioning(true);
      transitionTimeoutRef.current = setTimeout(() => {
        setIsTransitioning(false);
      }, transitionDuration);
      onIndexChange(currentIndex + 1);
    }, effectiveSpeed);

    return () => clearTimeout(timer);
  }, [isPlaying, currentIndex, totalImages, effectiveSpeed, onIndexChange, transitionDuration]);

  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  const play = useCallback(() => {
    if (currentIndex >= totalImages - 1) {
      onIndexChange(0);
    }
    setIsPlaying(true);
  }, [currentIndex, totalImages, onIndexChange]);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  const stopAndNavigate = useCallback((newIndex: number) => {
    setIsPlaying(false);
    onIndexChange(newIndex);
  }, [onIndexChange]);

  const skipToStart = useCallback(() => stopAndNavigate(0), [stopAndNavigate]);
  const skipToEnd = useCallback(() => stopAndNavigate(totalImages - 1), [stopAndNavigate, totalImages]);
  const previous = useCallback(() => stopAndNavigate(Math.max(0, currentIndex - 1)), [stopAndNavigate, currentIndex]);
  const next = useCallback(() => stopAndNavigate(Math.min(totalImages - 1, currentIndex + 1)), [stopAndNavigate, currentIndex, totalImages]);

  return {
    isPlaying,
    speedIndex,
    setSpeedIndex,
    isTransitioning,
    transitionDuration,
    togglePlayPause,
    play,
    pause,
    skipToStart,
    skipToEnd,
    previous,
    next,
    stopAndNavigate,
  };
}

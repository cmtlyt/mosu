export interface AnimationTrackKeyframe {
  offset: number;
  [property: string]: unknown;
}

export interface AnimationTrackOptions {
  duration: number;
  delay?: number;
  easing?: string;
  iterations?: number | 'Infinity';
  direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
  fillMode?: 'none' | 'forwards' | 'backwards' | 'both';
}

export interface AnimationTrack {
  id: string;
  target: string;
  keyframes: AnimationTrackKeyframe[];
  options: AnimationTrackOptions;
}

export interface AnimationConfig {
  version: string;
  id: string;
  name: string;
  tracks: AnimationTrack[];
}

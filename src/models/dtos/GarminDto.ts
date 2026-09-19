export interface SleepDto {
  score: number | null;
  durationMin: number | null;
  deepMin: number | null;
  lightMin: number | null;
  remMin: number | null;
  awakeMin: number | null;
  restingHr: number | null;
}

export interface HighStressWindow {
  start: number; // ms epoch
  end: number; // ms epoch
}

export interface IntradayPointDto {
  recordedDt: number;
  stressScore: number | null;
  bodyBattery: number | null;
  heartRate: number | null;
}

export interface TodayDto {
  date: string;
  sleep: SleepDto | null;
  intraday: IntradayPointDto[];
  currentStress: number | null;
  currentBodyBattery: number | null;
  highStressWindows: HighStressWindow[];
}

export interface DailySummaryDto {
  date: string;
  sleepScore: number | null;
  sleepDurationMin: number | null;
  avgStress: number | null;
  maxStress: number | null;
  highStressMinutes: number;
  minBodyBattery: number | null;
  restingHr: number | null;
}

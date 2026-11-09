/** The last weekly reading, as the rate-limit windows reported it. */
export type Reading = {
  /** Percent of the seven-day window used, 0 to 100. */
  weekUsed: number
  /** When the seven-day window resets, in epoch milliseconds. */
  weekResetsAt: number
  /** Percent of the five-hour window used, when reported. */
  fiveHourUsed?: number
  /** When the reading was taken, in epoch milliseconds. */
  measuredAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-pace': { reading: Shaped<Reading | null>; now: number }
  }
}

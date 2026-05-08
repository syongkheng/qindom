import { Message, ChannelType, EmbedBuilder } from "discord.js";
import { LoggingUtilities } from "../../../utils/logging/LoggingUtilities";

/**
 * Represents a KingShot game event with scheduling information.
 *
 * This interface defines the structure for recurring game events
 * with support for both one-time and repeating schedules.
 *
 * @interface KingshotEvent
 *
 * @example
 * // Example event structure:
 * {
 *   id: "beat_pit_1",
 *   key: "beat_pit_1",
 *   name: "Beat Pit #1",
 *   instruction: "Join rallies with correct heroes",
 *   startAtUtc: new Date("2026-01-04T15:30:00Z"),
 *   intervalMs: 172800000 // 2 days in milliseconds
 * }
 */
interface KingshotEvent {
  /** Unique identifier for the event */
  id: string;
  /** Key used for internal referencing */
  key: string;
  /** Display name shown to users */
  name: string;
  /** Detailed instructions for event participation */
  instruction: string;
  /** Initial event start time in UTC */
  startAtUtc: Date;
  /** Recurrence interval in milliseconds (undefined for one-time events) */
  intervalMs?: number;
}

/**
 * Configuration of recurring KingShot game events.
 *
 * Each event defines the schedule, name, and instructions for players.
 * Events can be one-time or recurring at regular intervals.
 *
 * @constant {KingshotEvent[]}
 *
 * @todo Consider moving to external configuration (database or JSON file)
 *       for easier updates without code deployment.
 */
const events: KingshotEvent[] = [
  {
    id: "beat_pit_1",
    key: "beat_pit_1",
    name: "Beat Pit #1",
    instruction: "Join rallies with the **correct** heroes to earn as much points as possible!",
    startAtUtc: new Date("2026-01-04T15:30:00Z"),
    intervalMs: 2 * 24 * 60 * 60 * 1000, // Every 2 days (172,800,000 ms)
  },
  {
    id: "kvk_battle_phase",
    key: "kvk_battle_phase",
    name: "KVK Battle Phase",
    instruction:
      "**Shield up** and **reinforce others** to get some points please refer to the rules for detailed windows of activities.",
    startAtUtc: new Date("2026-01-03T10:00:00Z"),
    intervalMs: 28 * 24 * 60 * 60 * 1000, // Every 28 days (2,419,200,000 ms)
  },
];

/**
 * Event Scheduling Utilities
 * @namespace EventScheduling
 */

/**
 * Calculates the next occurrence of an event based on its schedule.
 *
 * For recurring events (with intervalMs), this function calculates the next
 * occurrence after the current time. For one-time events, it returns the
 * start time if it's in the future, or null if it has already passed.
 *
 * @param {KingshotEvent} event - The event to calculate the next occurrence for
 * @param {Date} [now=new Date()] - Reference time for calculation (defaults to current time)
 * @returns {Date | null} The next occurrence date or null if no future occurrences
 *
 * @example
 * // For a recurring event starting Jan 1, recurring every 2 days:
 * // Current date: Jan 2 → Returns: Jan 3
 * // Current date: Jan 3 → Returns: Jan 5
 *
 * @example
 * // For a one-time event on Jan 1:
 * // Current date: Dec 31 → Returns: Jan 1
 * // Current date: Jan 2 → Returns: null
 */
function getNextEventOccurrence(event: KingshotEvent, now = new Date()): Date | null {
  // Handle one-time events
  if (!event.intervalMs) {
    return event.startAtUtc > now ? event.startAtUtc : null;
  }

  // If current time is before the initial start, return the initial start
  if (now < event.startAtUtc) return event.startAtUtc;

  // Calculate the number of complete cycles that have passed
  const diff = now.getTime() - event.startAtUtc.getTime();
  const cycles = Math.ceil(diff / event.intervalMs);

  // Return the next occurrence (cycles * interval from start)
  return new Date(event.startAtUtc.getTime() + cycles * event.intervalMs);
}

/**
 * Determines the next upcoming event from all configured events.
 *
 * This function evaluates all events to find which one occurs next
 * relative to the current time, considering both one-time and recurring
 * schedules.
 *
 * @param {Date} [now=new Date()] - Reference time for comparison
 * @returns {{ event: KingshotEvent, nextAt: Date } | null}
 *          The next event with its occurrence time, or null if none are upcoming
 *
 * @example
 * // With events on Jan 3 and Jan 5:
 * // Current date: Jan 2 → Returns: event on Jan 3
 * // Current date: Jan 4 → Returns: event on Jan 5
 * // Current date: Jan 6 (with no future events) → Returns: null
 */
function getNextEvent(now = new Date()): { event: KingshotEvent; nextAt: Date } | null {
  // Calculate next occurrence for each event
  const upcoming = events
    .map((event) => {
      const nextAt = getNextEventOccurrence(event, now);
      return nextAt ? { event, nextAt } : null;
    })
    .filter(Boolean) as { event: KingshotEvent; nextAt: Date }[];

  if (upcoming.length === 0) return null;

  // Sort by soonest occurrence and return the first
  return upcoming.sort((a, b) => a.nextAt.getTime() - b.nextAt.getTime())[0];
}

/**
 * Formats a future timestamp into a human-readable countdown string.
 *
 * Creates a "Xh Ym" format countdown showing hours and minutes remaining.
 * Note: Only shows hours and minutes, not days or seconds, for simplicity.
 *
 * @param {Date} target - Future date to count down to
 * @returns {string} Formatted countdown string (e.g., "12h 30m")
 *
 * @example
 * // Target: 3.5 hours from now → Returns: "3h 30m"
 * // Target: 0.25 hours (15 minutes) from now → Returns: "0h 15m"
 *
 * @note For negative durations (past dates), the output may be negative
 */
function formatCountdown(target: Date): string {
  const diff = target.getTime() - Date.now();

  // Calculate hours and minutes
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);

  return `${hours}h ${minutes}m`;
}

/**
 * Remind command for announcing upcoming KingShot game events.
 *
 * This command calculates the next scheduled event, creates an announcement
 * embed with countdown timer, and optionally pings @everyone (in production).
 *
 * @module RemindCommand
 * @type {Command}
 *
 * @example
 * // User types "!remind"
 * // Bot responds with an embed announcing the next event and @everyone mention
 * // Example output:
 * // "@everyone
 * // ⏰ Upcoming Event
 * // Beat Pit #1 is coming up!
 * // Join rallies with the correct heroes...
 * // When: January 4, 2026 3:30 PM UTC
 * // Countdown: 24h 15m"
 *
 * @see {@link getNextEvent} - For event scheduling logic
 * @see {@link formatCountdown} - For countdown formatting
 */
export const remindCommand = {
  /** Command trigger that users will type (e.g., "!remind") */
  name: "remind",

  /** Brief description shown in help commands */
  description: "Announce the next upcoming event",

  /**
   * Executes the remind command, announcing the next scheduled event.
   *
   * This function performs the following operations:
   * 1. Determines the correct mention tag based on environment
   * 2. Validates the execution context is a guild text channel
   * 3. Calculates the next upcoming event
   * 4. Creates and sends an announcement embed with @everyone mention
   *
   * @async
   * @param {Message} message - The Discord message that triggered the command
   * @returns {Promise<void>} Resolves when the announcement is sent
   *
   * @throws {Error} If message sending fails, errors are logged
   *
   * @example
   * // Production flow (NODE_ENV=prd):
   * // 1. User: !remind
   * // 2. Bot: "@everyone [embed with event details]"
   *
   * @example
   * // Development flow (NODE_ENV≠prd):
   * // 1. User: !remind
   * // 2. Bot: "everyone [embed with event details]" (no actual mention)
   *
   * @example
   * // Error scenario:
   * // 1. User: !remind
   * // 2. Bot: "❌ No upcoming events." (if no events are scheduled)
   */
  execute: async (message: Message): Promise<void> => {
    /**
     * Environment-based mention configuration:
     * - Production: Use actual @everyone mention
     * - Other environments: Use plain text "everyone" without mention functionality
     *
     * @constant {string}
     */
    const actuallyMentionEveryoneTag = process.env.NODE_ENV === "prd" ? "@everyone" : "everyone";

    // Validate command execution context - only allow in guild text channels
    if (!message.channel.isTextBased() || message.channel.type !== ChannelType.GuildText) {
      return;
    }

    // Log command execution for monitoring and audit trail
    LoggingUtilities.service.info("Fndiscord.Bot.RemindCommand", `Remind triggered by ${message.author.tag}`);
    LoggingUtilities.service.info("Fndiscord.Bot.RemindCommand", `Tag: ${actuallyMentionEveryoneTag}`);

    // Step 1: Calculate the next upcoming event
    const result = getNextEvent();

    // Handle case where no events are scheduled
    if (!result) {
      await message.channel.send("❌ No upcoming events.");
      return;
    }

    const { event, nextAt } = result;

    // Step 2: Create announcement embed
    const embed = new EmbedBuilder()
      .setTitle("⏰ Upcoming Event")
      .setColor(0xffcc00) // Yellow color for alerts/reminders
      .setDescription(`**${event.name}** is coming up!` + `\n\n${event.instruction}\n\n`)
      .addFields([
        {
          name: "🕒 When",
          // Discord timestamp format: displays as full date/time
          value: `<t:${Math.floor(nextAt.getTime() / 1000)}:F>`,
          inline: true,
        },
        {
          name: "⏳ Countdown",
          value: formatCountdown(nextAt),
          inline: true,
        },
      ])
      .setFooter({ text: `Requested by ${message.author.username}` })
      .setTimestamp(); // Current timestamp for context

    // Step 3: Send announcement with appropriate mention
    await message.channel.send({
      content: actuallyMentionEveryoneTag,
      embeds: [embed],
      allowedMentions: { parse: ["everyone"] },
    });
  },
};

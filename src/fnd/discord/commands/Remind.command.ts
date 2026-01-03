import { Message, ChannelType, EmbedBuilder } from "discord.js";
import { LoggingUtilities } from "../../../utils/LoggingUtilities";

interface KingshotEvent {
  id: string;
  key: string;
  name: string;
  instruction: string;
  startAtUtc: Date;
  intervalMs?: number;
}

const events: KingshotEvent[] = [
  {
    id: "beat_pit_1",
    key: "beat_pit_1",
    name: "Beat Pit #1",
    instruction: "Join rallies with the **correct** heroes to earn as much points as possible!",
    startAtUtc: new Date("2026-01-04T15:30:00Z"),
    intervalMs: 2 * 24 * 60 * 60 * 1000, // Every 2 days
  },
  {
    id: "kvk_battle_phase",
    key: "kvk_battle_phase",
    name: "KVK Battle Phase",
    instruction:
      "**Shield up** and **reinforce others** to get some points please refer to the rules for detailed windows of activities.",
    startAtUtc: new Date("2026-01-03T10:00:00Z"),
    intervalMs: 28 * 24 * 60 * 60 * 1000, // Every 28 days
  },
];

function getNextEventOccurrence(event: KingshotEvent, now = new Date()): Date | null {
  if (!event.intervalMs) {
    return event.startAtUtc > now ? event.startAtUtc : null;
  }

  if (now < event.startAtUtc) return event.startAtUtc;

  const diff = now.getTime() - event.startAtUtc.getTime();
  const cycles = Math.ceil(diff / event.intervalMs);

  return new Date(event.startAtUtc.getTime() + cycles * event.intervalMs);
}

function getNextEvent(now = new Date()) {
  const upcoming = events
    .map((event) => {
      const nextAt = getNextEventOccurrence(event, now);
      return nextAt ? { event, nextAt } : null;
    })
    .filter(Boolean) as { event: any; nextAt: Date }[];

  if (upcoming.length === 0) return null;

  return upcoming.sort((a, b) => a.nextAt.getTime() - b.nextAt.getTime())[0];
}

function formatCountdown(target: Date): string {
  const diff = target.getTime() - Date.now();

  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);

  return `${hours}h ${minutes}m`;
}

export const remindCommand = {
  name: "remind",
  description: "Announce the next upcoming event",
  execute: async (message: Message) => {
    const actuallyMentionEveryoneTag = process.env.NODE_ENV === "prd" ? "@everyone" : "everyone";

    
    if (!message.channel.isTextBased() || message.channel.type !== ChannelType.GuildText) return;
    
    LoggingUtilities.service.info("Fndiscord.Bot.RemindCommand", `Remind triggered by ${message.author.tag}`);
    LoggingUtilities.service.info("Fndiscord.Bot.RemindCommand", `Tag: ${actuallyMentionEveryoneTag}`);

    const result = getNextEvent();
    if (!result) {
      await message.channel.send("❌ No upcoming events.");
      return;
    }

    const { event, nextAt } = result;

    const embed = new EmbedBuilder()
      .setTitle("⏰ Upcoming Event")
      .setColor(0xffcc00)
      .setDescription(`**${event.name}** is coming up!` + `\n\n${event.instruction}\n\n`)
      .addFields([
        {
          name: "🕒 When",
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
      .setTimestamp();

    await message.channel.send({
      content: actuallyMentionEveryoneTag,
      embeds: [embed],
      allowedMentions: { parse: ["everyone"] },
    });
  },
};

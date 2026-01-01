import { Message, ChannelType, EmbedBuilder } from "discord.js";
import { LoggingUtilities } from "../../../utils/LoggingUtilities";

export const helpCommand = {
  name: "help",
  description: "Display help information",
  execute: async (message: Message, args: string[], commands?: Map<string, any>) => {
    if (!message.channel.isTextBased() || message.channel.type !== ChannelType.GuildText) return;

    LoggingUtilities.service.info(
      `Fndiscord.Bot.HelpCommand`,
      `Executing help command for ${message.author.tag} in channel ${message.channel.id}`
    );

    LoggingUtilities.service.debug(
      "Fndiscord.Bot.HelpCommand",
      `Available commands: ${Array.from(commands?.keys() || []).join(", ")}`
    );

    const embed = new EmbedBuilder()
      .setColor(0x00ff99)
      .setTitle("🤖 Bot Commands")
      .setDescription(`Hello, **${message.author.username}**! Here are the available commands:`)
      .setFooter({ text: `Requested by ${message.author.username}` })
      .setTimestamp();

    if (commands) {
      commands.forEach((cmd, name) => {
        embed.addFields({ name: `!${name}`, value: cmd.description, inline: false });
      });
    }

    await message.channel.send({ embeds: [embed] });
  },
};

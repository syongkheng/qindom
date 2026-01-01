import { Message, ChannelType, EmbedBuilder } from "discord.js";
import { LoggingUtilities } from "../../../utils/LoggingUtilities";

export const helpCommand = {
  name: "hello",
  description: "Greets the user calling the command.",
  execute: async (message: Message, args: string[], commands?: Map<string, any>) => {
    if (!message.channel.isTextBased() || message.channel.type !== ChannelType.GuildText) return;

    LoggingUtilities.service.info(
      `Fndiscord.Bot.HelloCommand`,
      `Executing hello command for ${message.author.tag} in channel ${message.channel.id}`
    );

    const embed = new EmbedBuilder()
      .setColor(0x00ff99)
      .setTitle("🤖 Hello!")
      .setDescription(`Hello, **${message.author.username}**!`)
      .setFooter({ text: `Requested by ${message.author.username}` })
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
  },
};

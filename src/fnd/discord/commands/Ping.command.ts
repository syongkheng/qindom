import { Message, ChannelType, EmbedBuilder } from "discord.js";
import axios from "axios";
import { LoggingUtilities } from "../../../utils/LoggingUtilities";

export const pingCommand = {
  name: "ping",
  description: "Check server connectivity",
  execute: async (message: Message, args: string[]) => {
    if (!message.channel.isTextBased() || message.channel.type !== ChannelType.GuildText) return;

    LoggingUtilities.service.info(
      `Fndiscord.Bot.PingCommand`,
      `Executing ping command for ${message.author.tag} in channel ${message.channel.id}`
    );

    try {
      const response = await axios.get("https://api.awense.com/connectivity");

      // Create an embed
      const embed = new EmbedBuilder()
        .setTitle("🏓 Pong!")
        .setColor(0x00ff99)
        .setDescription("Performing Connectivity Check:")
        .addFields([
          {
            name: "Response",
            value: "```json\n" + JSON.stringify(response.data, null, 2) + "\n```", // formatted JSON
          },
        ])
        .setFooter({ text: `Requested by ${message.author.username}` })
        .setTimestamp();

      await message.channel.send({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      await message.channel.send("❌ Failed to contact server.");
    }
  },
};

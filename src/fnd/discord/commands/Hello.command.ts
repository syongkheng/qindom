import { Message, ChannelType, EmbedBuilder } from "discord.js";
import { LoggingUtilities } from "../../../utils/logging/LoggingUtilities";

/**
 * Hello command for greeting users in Discord.
 *
 * This command responds with a personalized embed greeting when a user types `!hello`.
 * It demonstrates basic command structure, embed usage, and proper logging practices.
 *
 * @example
 * User: !hello
 * Bot: (Sends an embed) "Hello, Username!"
 *
 * @type {Command}
 */
export const helloCommand = {
  name: "hello",
  description: "Greets the user calling the command.",

  /**
   * Executes the hello command, sending a personalized greeting embed.
   *
   * Validates the channel type to ensure the command only runs in appropriate
   * text channels, logs the execution, and sends a formatted embed response.
   *
   * @async
   * @param {Message} message - The Discord message that triggered the command
   * @param {string[]} args - Command arguments (unused in this command)
   * @param {Map<string, Command>} [commands] - Map of all available commands
   * @returns {Promise<void>} Resolves when the greeting has been sent
   *
   * @example
   * // When user sends "!hello"
   * await execute(message, [], commands);
   */
  execute: async (message: Message, args: string[], commands?: Map<string, any>): Promise<void> => {
    // Validate channel type - only execute in guild text channels
    if (!message.channel.isTextBased() || message.channel.type !== ChannelType.GuildText) return;

    LoggingUtilities.service.info(
      `Fndiscord.Bot.HelloCommand`,
      `Executing hello command for ${message.author.tag} in channel ${message.channel.id}`
    );

    // Create and send a personalized greeting embed
    const embed = new EmbedBuilder()
      .setColor(0x00ff99) // Green-teal color
      .setTitle("🤖 Hello!")
      .setDescription(`Hello, **${message.author.username}**!`)
      .setFooter({ text: `Requested by ${message.author.username}` })
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
  },
};

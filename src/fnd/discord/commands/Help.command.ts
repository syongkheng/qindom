import { Message, ChannelType, EmbedBuilder } from "discord.js";
import { LoggingUtilities } from "../../../utils/LoggingUtilities";

/**
 * Help command that displays a list of all available bot commands.
 *
 * This command dynamically generates an embed listing all registered commands
 * with their descriptions, providing users with a quick reference for bot functionality.
 * It serves as the primary documentation interface within Discord itself.
 *
 * @module HelpCommand
 * @type {Command}
 *
 * @example
 * // User types "!help"
 * // Bot responds with an embed listing all available commands and their descriptions
 *
 * @see {@link Command} - For the command interface structure
 */
export const helpCommand = {
  /** Command trigger name that users will type (e.g., "!help") */
  name: "help",

  /** Brief description displayed in the help embed and used in command listings */
  description: "Display help information",

  /**
   * Executes the help command, generating and sending an embed with all available commands.
   *
   * This function:
   * 1. Validates the execution context is a guild text channel
   * 2. Logs command execution for monitoring
   * 3. Creates a formatted embed listing all commands dynamically
   * 4. Sends the embed to the requesting channel
   *
   * @async
   * @param {Message} message - The Discord message object that triggered the command
   * @param {string[]} args - Command arguments (unused in this implementation)
   * @param {Map<string, Command>} [commands] - Map of all registered commands
   *                            Used to dynamically generate the command list
   * @returns {Promise<void>} Resolves when the help embed has been sent
   *
   * @throws Will not throw but logs errors to the logging service
   *
   * @example
   * // Example embed output:
   * // Title: 🤖 Bot Commands
   * // Description: Hello, Username! Here are the available commands:
   * // Fields:
   * //   !help - Display help information
   * //   !hello - Greets the user calling the command.
   */
  execute: async (message: Message, args: string[], commands?: Map<string, any>): Promise<void> => {
    // Ensure command only runs in valid text channels to avoid DM/voice channel errors
    if (!message.channel.isTextBased() || message.channel.type !== ChannelType.GuildText) {
      return;
    }

    // Log command execution for monitoring and debugging
    LoggingUtilities.service.info(
      `Fndiscord.Bot.HelpCommand`,
      `Executing help command for ${message.author.tag} in channel ${message.channel.id}`
    );

    // Debug logging: Output all available command names for troubleshooting
    LoggingUtilities.service.debug(
      "Fndiscord.Bot.HelpCommand",
      `Available commands: ${Array.from(commands?.keys() || []).join(", ")}`
    );

    // Create the base embed with consistent branding and personalization
    const embed = new EmbedBuilder()
      .setColor(0x00ff99) // Consistent green-teal brand color
      .setTitle("🤖 Bot Commands")
      .setDescription(`Hello, **${message.author.username}**! Here are the available commands:`)
      .setFooter({ text: `Requested by ${message.author.username}` })
      .setTimestamp(); // Adds current time for context

    // Dynamically add each command as a field in the embed
    // This ensures the help command always reflects the current command set
    if (commands) {
      commands.forEach((cmd, name) => {
        embed.addFields({
          name: `!${name}`, // Prefix with command trigger character
          value: cmd.description || "No description provided", // Fallback for missing descriptions
          inline: false, // Stack fields vertically for readability
        });
      });
    } else {
      // Fallback message if no commands are loaded
      embed.addFields({
        name: "⚠️ No Commands Loaded",
        value: "Unable to load command list. Please contact an administrator.",
        inline: false,
      });
    }

    // Send the completed embed to the channel
    await message.channel.send({ embeds: [embed] });
  },
};

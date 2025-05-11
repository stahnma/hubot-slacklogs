// Description:
//  Log Slack emoji reactions in jsonl format
//
// Configuration:
//    HUBOT_SLACK_REACTIONS_LOGS_FILE - absolute path to file where reactions logs should be placed
//    HUBOT_SLACK_LOGS_FILE - fallback log file if reactions log file is not set
//    HUBOT_SLACK_TOKEN - needed to use slack API for user lookups, etc
//
// Author: stahnma
//
// Category: workflow
const fs = require('fs');
const path = require('path');
const { WebClient } = require('@slack/web-api');

// Config
const reactionsLogFilePath =
  process.env.HUBOT_SLACK_REACTIONS_LOGS_FILE ||
  process.env.HUBOT_SLACK_LOGS_FILE;
const slackToken = process.env.HUBOT_SLACK_TOKEN;

let logStream = null;
if (reactionsLogFilePath) {
  try {
    const dir = path.dirname(reactionsLogFilePath);
    fs.mkdirSync(dir, {
      recursive: true,
    });
    logStream = fs.createWriteStream(reactionsLogFilePath, {
      flags: 'a',
    });
    console.log(
      `[hubot-reactions-logger] Logging to file: ${reactionsLogFilePath}`
    );
  } catch (err) {
    console.error(
      `[hubot-reactions-logger] Failed to set up log file: ${err.message}`
    );
  }
}

const slackClient = slackToken ? new WebClient(slackToken) : null;

module.exports = (robot) => {
  if (robot.adapterName !== 'slack') {
    robot.logger.info(
      `[hubot-reactions-logger] Adapter is '${robot.adapterName}', skipping Slack-specific logging.`
    );
    return;
  }

  robot.logger.info('[hubot-reactions-logger] Reaction logging enabled');

  // Listen for reactions using robot.react
  robot.react((res) => {
    handleReaction(res.message);
  });

  // Function to handle reaction logging
  async function handleReaction(reaction) {
    try {
      // Handle both Hubot ReactionMessage and raw Slack API formats
      let userId, item, emoji, reactionType;

      if (reaction.user && typeof reaction.user === 'object' && reaction.user.id) {
        // Hubot ReactionMessage format
        userId = reaction.user.id;
        item = reaction.item;
        emoji = reaction.reaction;
        reactionType = reaction.type; // 'added' or 'removed'
      } else if (typeof reaction.user === 'string') {
        // Raw Slack API format
        userId = reaction.user;
        item = reaction.item;
        emoji = reaction.reaction;
        reactionType = 'added'; // Default for raw format
      } else {
        robot.logger.error('[hubot-reactions-logger] Unknown reaction format:', reaction);
        return;
      }

      const timestamp = new Date().toISOString();

      let userName = null;
      if (slackClient && userId) {
        try {
          const userInfo = await slackClient.users.info({
            user: userId,
          });
          userName = userInfo.user?.name || null;
        } catch (err) {
          robot.logger.error(
            `[hubot-reactions-logger] Failed to fetch user info for ${userId}: ${err.message}`
          );
        }
      }

      const reactionLog = {
        user: userName,
        userId: userId,
        emoji: emoji,
        reactionType: reactionType,
        itemType: item.type,
        itemChannel: item.channel || null,
        itemTimestamp: item.ts || null,
        timestamp: timestamp,
      };

      const line = JSON.stringify(reactionLog);

      if (logStream) {
        logStream.write(line + '\n');
      } else {
        // Log to Hubot's logger if no file is configured
        robot.logger.info(`[hubot-reactions-logger] ${line}`);
      }
    } catch (err) {
      robot.logger.error(
        '[hubot-reactions-logger] Error while logging reaction:',
        err
      );
    }
  }
};

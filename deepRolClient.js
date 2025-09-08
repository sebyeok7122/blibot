const { SlashCommandBuilder } = require('discord.js');

module.exports = [
  new SlashCommandBuilder()
    .setName('딥롤방연결')
    .setDescription('내전 matchId에 딥롤 방 코드(roomCode) 연결')
    .addStringOption(option =>
      option.setName('matchid')
        .setDescription('내전 matchId')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('roomcode')
        .setDescription('딥롤 방 코드')
        .setRequired(true))
];

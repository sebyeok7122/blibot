const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const token = process.env.BLIBOT_TOKEN;
const clientId = '1392425978265075772'; // 블리봇 client ID
const guildId = '1309877071308394506'; // 롤블리 서버 ID

const commands = [
  new SlashCommandBuilder()
    .setName('팀워크상성')
    .setDescription('두 유저의 팀워크 승률을 확인해요 😉')
    .addUserOption(option =>
      option.setName('유저1')
        .setDescription('첫 번째 유저')
        .setRequired(true))
    .addUserOption(option =>
      option.setName('유저2')
        .setDescription('두 번째 유저')
        .setRequired(true)),
  // 🔜 여기에 다른 명령어도 .addUserOption 등으로 추가 가능
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('🔁 슬래시 명령어 등록 중...');

    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands },
    );

    console.log('✅ 슬래시 명령어 등록 완료!');
  } catch (error) {
    console.error('❌ 슬래시 명령어 등록 실패:', error);
  }
})();

// ✅ 환경 변수 불러오기
require('dotenv').config();
const RIOT_API_KEY = process.env.RIOT_API_KEY;

// ✅ 모듈 불러오기
const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder,
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// ✅ 디스코드 클라이언트 설정
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers
  ],
});

// ✅ 환경 변수 및 기본 경로
const token = process.env.BLIBOT_TOKEN;
const clientId = '1392425978265075772';
const guildId = '1309877071308394506';
const logChannelId = '1392867376990519306';

const attendancePath = path.join(__dirname, 'attendance.json');
const accountPath = path.join(__dirname, 'accounts.json');
const matchHistoryPath = path.join(__dirname, 'matchHistory.json');

// ✅ JSON 함수
function loadAccounts() {
  if (fs.existsSync(accountPath)) {
    return JSON.parse(fs.readFileSync(accountPath, 'utf8'));
  } else {
    return {};
  }
}
function saveAccounts(accounts) {
  fs.writeFileSync(accountPath, JSON.stringify(accounts, null, 2));
}

// ✅ 슬래시 명령어 등록
const commands = [
  new SlashCommandBuilder()
    .setName('계정등록')
    .setDescription('메인 계정을 등록합니다.')
    .addStringOption(option =>
      option.setName('라이엇닉네임')
        .setDescription('라이엇 닉네임#태그')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('부캐등록')
    .setDescription('부캐를 메인 계정과 연결합니다.')
    .addStringOption(option =>
      option.setName('부캐닉네임')
        .setDescription('부캐 닉네임')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('메인닉네임')
        .setDescription('메인 계정 닉네임')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('닉네임검사')
    .setDescription('라이엇 닉네임이 존재하는지 확인합니다')
    .addStringOption(option =>
      option.setName('닉네임')
        .setDescription('라이엇 닉네임#태그 입력 (예: 새 벽#반딧불이)')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('내전')
    .setDescription('내전을 모집합니다.')
    .addStringOption(option =>
      option.setName('시간')
        .setDescription('내전 시작 시간')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('전적')
    .setDescription('해당 계정 전적을 확인합니다.')
    .addStringOption(option =>
      option.setName('계정명')
        .setDescription('등록된 계정명')
        .setRequired(true)
    ),
  new SlashCommandBuilder().setName('최근10판').setDescription('최근 10판 내전 전적을 확인합니다.'),
  new SlashCommandBuilder().setName('모스트픽10').setDescription('모스트 챔피언 TOP10을 확인합니다.'),
  new SlashCommandBuilder()
    .setName('내전판수')
    .setDescription('내전 경기 수 TOP30을 확인합니다.'),
  new SlashCommandBuilder()
    .setName('내전랭킹')
    .setDescription('내전 랭킹 TOP30을 확인합니다.'),
  new SlashCommandBuilder()
    .setName('내전리셋')
    .setDescription('특정 유저 전적 초기화')
    .addUserOption(option =>
      option.setName('유저')
        .setDescription('초기화할 유저')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('내전데이터리셋')
    .setDescription('모든 내전 기록 초기화'),
  new SlashCommandBuilder()
    .setName('팀워크상성')
    .setDescription('두 유저의 팀워크 상성을 확인합니다.')
    .addUserOption(option =>
      option.setName('유저1').setDescription('첫번째 유저').setRequired(true)
    )
    .addUserOption(option =>
      option.setName('유저2').setDescription('두번째 유저').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('맞라인상성')
    .setDescription('두 유저의 맞라인 상성을 확인합니다.')
    .addUserOption(option =>
      option.setName('유저1').setDescription('첫번째 유저').setRequired(true)
    )
    .addUserOption(option =>
      option.setName('유저2').setDescription('두번째 유저').setRequired(true)
    ),
];

const rest = new REST({ version: '10' }).setToken(token);
(async () => {
  try {
    console.log('📦 블리봇 슬래시 명령어 등록 중...');
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands.map(c => c.toJSON()),
    });
    console.log('✅ 슬래시 명령어 등록 완료!');
  } catch (err) {
    console.error('❌ 명령어 등록 중 오류:', err);
  }
})();

// ✅ 통합 이벤트 핸들러 (슬래시 명령어 처리)
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, user, member } = interaction;
  const userId = user.id;
  const tag = user.tag;

  // (생략된 기존 계정등록, 부캐등록, 닉네임검사 등 그대로 유지)

  // ✅ 내전
  if (commandName === '내전') {
    const startTime = options.getString('시간');
    participants = [];

    const joinBtn = new ButtonBuilder().setCustomId('join_game').setLabel('✅ 참여').setStyle(ButtonStyle.Success);
    const leaveBtn = new ButtonBuilder().setCustomId('leave_game').setLabel('❌ 취소').setStyle(ButtonStyle.Danger);
    const row = new ActionRowBuilder().addComponents(joinBtn, leaveBtn);

    // 메시지 전송 후 객체 저장
    const replyMsg = await interaction.reply({
      content: `**[𝙡𝙤𝙡𝙫𝙚𝙡𝙮] 내전이 시작되었어요**\n🕒 시작: ${startTime}\n\n참여자:\n(없음)`,
      components: [row],
      fetchReply: true
    });

    // 40분 후 막판/대기 버튼 추가
    setTimeout(async () => {
      try {
        const lateButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('last_call')
            .setLabel('🔥 막판')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('wait')
            .setLabel('⏳ 대기')
            .setStyle(ButtonStyle.Secondary)
        );

        await replyMsg.edit({
          content: replyMsg.content + '\n\n🕒 내전이 곧 시작됩니다! 막판/대기 상태를 선택해주세요.',
          components: [row, lateButtons]
        });
      } catch (err) {
        console.error('막판/대기 버튼 추가 오류:', err);
      }
    }, 1000 * 60 * 40); // 40분 후 실행
  }

  // (나머지 전적, 최근10판, 모스트픽10, 내전판수, 내전랭킹, 리셋, 상성 명령어들은 그대로 유지)
});

// ✅ 버튼 핸들러 (참여/취소/내전취소 등)
let participants = [];
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  const { customId, user, message } = interaction;

  if (customId === 'join_game') {
    if (!participants.includes(user.id)) participants.push(user.id);
    const names = participants.map(id => `<@${id}>`).join('\n');
    return interaction.update({ content: `내전참여자:\n${names}`, components: message.components });
  }
  if (customId === 'leave_game') {
    participants = participants.filter(id => id !== user.id);
    const names = participants.length ? participants.map(id => `<@${id}>`).join('\n') : '(없음)';
    return interaction.update({ content: `내전참여자:\n${names}`, components: message.components });
  }
  if (customId === 'cancel_match') {
    const host = message.interaction?.user?.id;
    if (user.id !== host) return interaction.reply({ content: '⚠️ 진행자만 취소할 수 있어요 ⚠️', ephemeral: true });
    await message.delete().catch(console.error);
    return interaction.reply({ content: ' 📋 내전 모집이 취소되었습니다 📋 ' });
  }
  if (customId === 'last_call') {
    return interaction.reply({ content: '🔥 막판으로 표시되었습니다!', ephemeral: true });
  }
  if (customId === 'wait') {
    return interaction.reply({ content: '⏳ 대기로 표시되었습니다!', ephemeral: true });
  }
});

// ✅ MMR 갱신 함수
async function updateMMR(userId, result) {
  let accounts = loadAccounts();
  if (!accounts[userId]) return;
  let u = accounts[userId];
  u.gamesPlayed = (u.gamesPlayed || 0) + 1;
  if (result === '승') {
    u.wins++;
    u.streak = u.streak >= 0 ? u.streak + 1 : 1;
  } else {
    u.losses++;
    u.streak = u.streak <= 0 ? u.streak - 1 : -1;
  }
  let change = 20;
  if (Math.abs(u.streak) >= 3) change += Math.abs(u.streak) - 2;
  if (u.gamesPlayed <= 10) {
    if (result === '승') u.mmr += (change + 10);
    else u.mmr -= Math.floor(change / 2);
  } else {
    if (result === '승') u.mmr += change;
    else u.mmr -= change;
  }
  if (u.mmr < 0) u.mmr = 0;
  saveAccounts(accounts);
}

client.login(token);

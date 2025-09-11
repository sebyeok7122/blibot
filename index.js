// ✅ 환경 변수 불러오기
require('dotenv').config();
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

// ✅ 클라이언트 생성
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
});

// ✅ 환경 변수 및 기본 경로
const token = process.env.BLIBOT_TOKEN;
const clientId = '1392425978265075772';
const guildIds = ["1309877071308394506", "686518979292037142"];

const accountPath = path.join(__dirname, 'accounts.json');

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

// ✅ deeplol_links.json 유틸
const fsP = require('fs/promises');
const LINKS_PATH = path.join(__dirname, 'deeplol_links.json');

async function readJSONSafe(file, fallback = {}) {
  try {
    const raw = await fsP.readFile(file, 'utf8');
    return JSON.parse(raw || '{}');
  } catch {
    return fallback;
  }
}
async function writeJSONSafe(file, obj) {
  const tmp = file + '.tmp';
  await fsP.writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
  await fsP.rename(tmp, file);
}

// ✅ 명령어 정의
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
  .setName('내전')
  .setDescription('내전을 모집합니다.')
  .addStringOption(option =>
    option.setName('시간')
      .setDescription('내전 시작 시간')
      .setRequired(true)
  ),
new SlashCommandBuilder()
  .setName('계정삭제')
  .setDescription('내 계정 데이터를 삭제합니다.'),

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
      .setRequired(true)
  ),

new SlashCommandBuilder()
  .setName('칼바람내전')
  .setDescription('칼바람 내전을 모집합니다.')
  .addStringOption(option =>
    option.setName('시간')
      .setDescription('내전 시작 시간')
      .setRequired(true)
  ), 

];



// ✅ 명령어 등록
const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log("🛰️ 슬래시 명령어 등록 시작...");
    for (const gId of guildIds) {
      await rest.put(
        Routes.applicationGuildCommands(clientId, gId),
        { body: commands.map(c => c.toJSON()) }
      );
      console.log(`✅ ${gId} 서버에 명령어 등록 완료!`);
    }
  } catch (error) {
    console.error('❌ 명령어 등록 오류:', error);
  }
})();

// ✅ 전역 상태: 내전 참가 관리
const roomState = new Map(); // messageId -> { members: string[], last: Set, wait: Set }

// ✅ 메시지 렌더링 함수
function renderContent(base, state) {
  const { members, last, wait } = state;
  const asList = ids => (ids.length ? ids.map(id => `<@${id}>`).join('\n') : '(없음)');
  const membersText = asList(members);
  const lastText = asList([...last]);
  const waitText = asList([...wait]);

  const head = base.split('\n\n참여자:')[0];
  return (
    `${head}\n\n` +
    `참여자:\n${membersText}\n\n` +
    `❌ 막판:\n${lastText}\n\n` +
    `⭕ 대기:\n${waitText}`
  );
}

// ✅ interactionCreate 처리
client.on('interactionCreate', async (interaction) => {
  // 🎯 슬래시 명령어
  if (interaction.isChatInputCommand()) {
    const { commandName, options, user } = interaction;
    const userId = user.id;

    // /계정등록
if (commandName === '계정등록') {
  const riotNick = options.getString('라이엇닉네임');
  let accounts = loadAccounts();

  if (!accounts[userId]) {
    accounts[userId] = {
      main: riotNick,
      alts: [],
      wins: 0,
      losses: 0,
      mmr: 1000,
      streak: 0,
      gamesPlayed: 0,
    };
    saveAccounts(accounts);
    return interaction.reply(`✅ <@${userId}> 님의 메인 계정이 **${riotNick}** 으로 등록되었습니다!`);
  } else {
    return interaction.reply(`⚠️ 이미 메인 계정을 등록하셨네요 ! 현재 등록된 계정: **${accounts[userId].main}**`);
  }
}

// /계정삭제
if (commandName === '계정삭제') {
  let accounts = loadAccounts();
  if (accounts[userId]) {
    delete accounts[userId];
    saveAccounts(accounts);
    return interaction.reply(`🗑️ <@${userId}> 님의 계정 데이터가 삭제되었어요! 다시 /계정등록 해주세요 🌼`);
  } else {
    return interaction.reply(`❌ 등록된 계정이 없습니다.`);
  }
}

    // /부캐등록
    if (commandName === '부캐등록') {
      const subNick = options.getString('부캐닉네임');
      const mainNick = options.getString('메인닉네임');
      let accounts = loadAccounts();

      if (!accounts[userId]) {
        return interaction.reply(`❌ 먼저 /계정등록 으로 메인 계정을 등록해야 합니다.`);
      }

      if (accounts[userId].main !== mainNick) {
        return interaction.reply(`⚠️ 입력한 메인 닉네임이 등록된 계정과 일치하지 않습니다.\n현재 메인: **${accounts[userId].main}**`);
      }

      if (!accounts[userId].alts.includes(subNick)) {
        accounts[userId].alts.push(subNick);
        saveAccounts(accounts);
        return interaction.reply(`✅ 부캐 **${subNick}** 가 메인 계정 **${mainNick}** 과 연결되었습니다!`);
      } else {
        return interaction.reply(`⚠️ 이미 등록된 부캐입니다: **${subNick}**`);
      }
    }

// /내전
if (commandName === '내전') {
  const startTime = options.getString('시간');

  const joinBtn = new ButtonBuilder()
    .setCustomId('join_game')
    .setLabel('✅ 참여')
    .setStyle(ButtonStyle.Success);

  const leaveBtn = new ButtonBuilder()
    .setCustomId('leave_game')
    .setLabel('❌ 취소')
    .setStyle(ButtonStyle.Danger);
const row = new ActionRowBuilder().addComponents(joinBtn, leaveBtn);

// 라인 선택
const laneSelect = new StringSelectMenuBuilder()
  .setCustomId('select_lane')
  .setPlaceholder('주라인 / 부라인 선택')
  .setMinValues(1)
  .setMaxValues(2)
  .addOptions(
    { label: '탑', value: 'top' },
    { label: '정글', value: 'jungle' },
    { label: '미드', value: 'mid' },
    { label: '원딜', value: 'adc' },
    { label: '서폿', value: 'support' }
  );

// 티어 선택
const tierSelect = new StringSelectMenuBuilder()
  .setCustomId('select_tier')
  .setPlaceholder('최고 티어 선택')
  .addOptions(['I','B','S','G','P','E','D','M','GM','C'].map(t => ({ label: t, value: t })));

const replyMsg = await interaction.reply({
  content: `**[𝙡𝙤𝙡𝙫𝙚𝙡𝙮] 내전이 시작되었어요**\n🕒 시작: ${startTime}\n\n참여자:\n(없음)`,
  components: [
    row,
    new ActionRowBuilder().addComponents(laneSelect),
    new ActionRowBuilder().addComponents(tierSelect)
  ],
  fetchReply: true
});

// roomState에 라인/티어도 포함
roomState.set(replyMsg.id, { members: [], lanes: {}, tiers: {}, last: new Set(), wait: new Set() });

  // 40분 후 막판/대기 버튼 추가
  setTimeout(async () => {
    try {
      const lateButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('last_call').setLabel('🔥 막판').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('wait').setLabel('⏳ 대기').setStyle(ButtonStyle.Secondary)
      );

      await replyMsg.edit({
        content: replyMsg.content + '\n\n 🔥 내전이 곧 시작됩니다! 막판/대기 상태를 선택해주세요.',
        components: [row, lateButtons]
      });
    } catch (err) {
      console.error('막판/대기 버튼 추가 오류:', err);
    }
  }, 1000 * 60 * 40);
}

// /칼바람내전
if (commandName === '칼바람내전') {
  const startTime = options.getString('시간');

  const joinBtn = new ButtonBuilder()
    .setCustomId('join_game')
    .setLabel('✅ 참여')
    .setStyle(ButtonStyle.Success);

  const leaveBtn = new ButtonBuilder()
    .setCustomId('leave_game')
    .setLabel('❌ 취소')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(joinBtn, leaveBtn);

  const replyMsg = await interaction.reply({
    content: `**[칼바람] 내전이 시작되었어요**\n🕒 시작: ${startTime}\n\n참여자:\n(없음)`,
    components: [row],
    fetchReply: true
  });

  roomState.set(replyMsg.id, { members: [], last: new Set(), wait: new Set() });

  // 40분 후 막판/대기 버튼 추가
  setTimeout(async () => {
    try {
      const lateButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('last_call').setLabel('🔥 막판').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('wait').setLabel('⏳ 대기').setStyle(ButtonStyle.Secondary)
      );

      await replyMsg.edit({
        content: replyMsg.content + '\n\n 🔥 내전이 곧 시작됩니다! 막판/대기 상태를 선택해주세요.',
        components: [row, lateButtons]
      });
    } catch (err) {
      console.error('막판/대기 버튼 추가 오류:', err);
    }
  }, 1000 * 60 * 40);
}

 if (interaction.isStringSelectMenu()) {
  const { customId, values, user, message } = interaction;
  const key = message.id;
  if (!roomState.has(key)) return;
  const state = roomState.get(key);

  if (customId === 'select_lane') {
    state.lanes[user.id] = values; // 주/부 라인 저장
    return interaction.reply({ content: `✅ ${values.join(', ')} 선택 완료!`, ephemeral: true });
  }

  if (customId === 'select_tier') {
    state.tiers[user.id] = values[0];
    return interaction.reply({ content: `✅ 티어 선택: ${values[0]}`, ephemeral: true });
  }
}

 if (customId === 'join_game') {
  if (!state.members.includes(user.id)) state.members.push(user.id);
  saveRooms();  // ✅ 참여 누를 때 바로 저장
  return updateMessage();
}

 if (customId === 'leave_game') {
  state.members = state.members.filter(id => id !== user.id);
  state.last.delete(user.id);
  state.wait.delete(user.id);
  saveRooms();  // ✅ 취소할 때도 저장
  return updateMessage();
}

  if (commandName === '딥롤방연결') {
    const matchId = options.getString('matchid', true);
    const roomCode = options.getString('roomcode', true);

    try {
      const map = await readJSONSafe(LINKS_PATH, {});
      map[matchId] = { roomCode, updatedAt: Date.now() };
      await writeJSONSafe(LINKS_PATH, map);

      return interaction.reply({
        content: `🔗 matchId **${matchId}** ↔ roomCode **${roomCode}** 연결 완료!`,
        ephemeral: true
      });
    } catch (e) {
      console.error('딥롤방연결 오류:', e);
      return interaction.reply({
        content: '❌ 연결 중 오류가 발생했어요.',
        ephemeral: true
      });
    }
  }
}   // ✅ 여기서 isChatInputCommand 닫기


  // 🎯 버튼 핸들러 처리
  if (interaction.isButton()) {
    const { customId, user, message } = interaction;
    const key = message.id;

    if (!roomState.has(key)) {
      roomState.set(key, { members: [], last: new Set(), wait: new Set() });
    }
    const state = roomState.get(key);

    const updateMessage = () => interaction.update({
      content: renderContent(message.content, state),
      components: message.components
    });

    if (customId === 'join_game') {
      if (!state.members.includes(user.id)) state.members.push(user.id);
      return updateMessage();
    }

    if (customId === 'leave_game') {
      state.members = state.members.filter(id => id !== user.id);
      state.last.delete(user.id);
      state.wait.delete(user.id);
      return updateMessage();
    }

    if (customId === 'last_call') {
      state.last.add(user.id);
      state.wait.delete(user.id);
      return updateMessage();
    }

    if (customId === 'wait') {
      state.wait.add(user.id);
      state.last.delete(user.id);
      return updateMessage();
    }

    if (customId === 'cancel_match') {
      const hostId = message.interaction?.user?.id;
      if (user.id !== hostId) {
        return interaction.reply({ content: '⚠️ 진행자만 취소할 수 있어요 ⚠️', ephemeral: true });
      }
      roomState.delete(key);
      await message.delete().catch(() => {});
      return interaction.reply({ content: ' 📋 내전 모집이 취소되었습니다 📋 ' });
    }
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

// ✅ 로그인
client.login(token);


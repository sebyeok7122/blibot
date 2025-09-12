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
  ButtonStyle,
  StringSelectMenuBuilder
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
const ROOMS_PATH = path.join(__dirname, 'rooms.json');

// ✅ 전역 상태
const roomState = new Map();

// ✅ JSON 저장/복원 함수
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

function saveRooms() {
  const obj = {};
  for (const [key, value] of roomState.entries()) {
    obj[key] = {
      members: value.members,
      lanes: value.lanes,
      tiers: value.tiers,
      last: [...value.last],
      wait: [...value.wait]
    };
  }
  fs.writeFileSync(ROOMS_PATH, JSON.stringify(obj, null, 2));
}
function loadRooms() {
  if (fs.existsSync(ROOMS_PATH)) {
    try {
      const raw = fs.readFileSync(ROOMS_PATH, 'utf8');
      const obj = JSON.parse(raw || '{}');
      for (const [key, value] of Object.entries(obj)) {
        roomState.set(key, {
          members: value.members,
          lanes: value.lanes || {},
          tiers: value.tiers || {},
          last: new Set(value.last),
          wait: new Set(value.wait)
        });
      }
      console.log("✅ roomState 복원 완료:", roomState.size);
    } catch (err) {
      console.error("❌ rooms.json 파싱 실패 → 초기화:", err.message);
      fs.writeFileSync(ROOMS_PATH, '{}');
    }
  }
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
    .setName('내전')
    .setDescription('내전을 모집합니다.')
    .addStringOption(option =>
      option.setName('시간')
        .setDescription('내전 시작 시간')
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

// ✅ 메시지 렌더링 함수
function renderContent(base, state) {
  const { members, lanes, tiers, last, wait } = state;

  const laneMap = {
    top: '탑',
    jungle: '정글',
    mid: '미드',
    adc: '원딜',
    support: '서폿'
  };

  const asList = ids => {
    return ids.length
      ? ids.map(id => {
          const lane = lanes?.[id]?.map(v => laneMap[v] || v).join('/') || '';
          const tier = tiers?.[id] || '';
          const extra = (lane || tier) ? ` (${lane} ${tier})` : '';
          return `<@${id}>${extra}`;
        }).join('\n')
      : '(없음)';
  };

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

// ✅ interaction 핸들러
client.on('interactionCreate', async (interaction) => {
  const { commandName, options, user } = interaction;
  const userId = user?.id;

  // -------------------
  // 1) 명령어 처리
  // -------------------
  if (interaction.isChatInputCommand()) {
    // /계정등록
    if (commandName === '계정등록') {
      const riotNick = options.getString('라이엇닉네임');
      let accounts = loadAccounts();
      if (!accounts[userId]) {
        accounts[userId] = { main: riotNick, alts: [], wins: 0, losses: 0, mmr: 1000, streak: 0, gamesPlayed: 0 };
        saveAccounts(accounts);
        return interaction.reply(`✅ <@${userId}> 님의 메인 계정이 **${riotNick}** 으로 등록되었습니다!`);
      } else {
        return interaction.reply(`⚠️ 이미 등록됨! 현재 메인: **${accounts[userId].main}**`);
      }
    }

    // /부캐등록
    if (commandName === '부캐등록') {
      const subNick = options.getString('부캐닉네임');
      const mainNick = options.getString('메인닉네임');
      let accounts = loadAccounts();
      if (!accounts[userId]) return interaction.reply(`❌ 먼저 /계정등록 해주세요.`);
      if (accounts[userId].main !== mainNick) return interaction.reply(`⚠️ 입력한 메인 닉네임 불일치! 현재: **${accounts[userId].main}**`);
      if (!accounts[userId].alts.includes(subNick)) {
        accounts[userId].alts.push(subNick);
        saveAccounts(accounts);
        return interaction.reply(`✅ 부캐 **${subNick}** 가 메인 **${mainNick}** 과 연결되었습니다!`);
      } else {
        return interaction.reply(`⚠️ 이미 등록된 부캐입니다: **${subNick}**`);
      }
    }

    // /계정삭제
    if (commandName === '계정삭제') {
      let accounts = loadAccounts();
      if (accounts[userId]) {
        delete accounts[userId];
        saveAccounts(accounts);
        return interaction.reply(`🗑️ <@${userId}> 계정 데이터 삭제됨!`);
      } else {
        return interaction.reply(`❌ 등록된 계정 없음.`);
      }
    }

    // /딥롤방연결
    if (commandName === '딥롤방연결') {
      const matchId = options.getString('matchid', true);
      const roomCode = options.getString('roomcode', true);
      try {
        const map = fs.existsSync(LINKS_PATH) ? JSON.parse(fs.readFileSync(LINKS_PATH, 'utf8')) : {};
        map[matchId] = { roomCode, updatedAt: Date.now() };
        fs.writeFileSync(LINKS_PATH, JSON.stringify(map, null, 2));
        return interaction.reply({ content: `🔗 matchId **${matchId}** ↔ roomCode **${roomCode}** 연결 완료!`, ephemeral: true });
      } catch (e) {
        console.error('딥롤방연결 오류:', e);
        return interaction.reply({ content: '❌ 연결 중 오류 발생', ephemeral: true });
      }
    }

    // /내전
    if (commandName === '내전') {
      const startTime = options.getString('시간');
      const joinBtn = new ButtonBuilder().setCustomId('join_game').setLabel('✅ 참여').setStyle(ButtonStyle.Success);
      const leaveBtn = new ButtonBuilder().setCustomId('leave_game').setLabel('❌ 취소').setStyle(ButtonStyle.Danger);
      const row = new ActionRowBuilder().addComponents(joinBtn, leaveBtn);

      const mainLaneSelect = new StringSelectMenuBuilder()
        .setCustomId('select_main_lane')
        .setPlaceholder('주라인 선택')
        .setMinValues(1)
        .setMaxValues(5)
        .addOptions(
          { label: '탑', value: 'top' },
          { label: '정글', value: 'jungle' },
          { label: '미드', value: 'mid' },
          { label: '원딜', value: 'adc' },
          { label: '서폿', value: 'support' }
        );

      const subLaneSelect = new StringSelectMenuBuilder()
        .setCustomId('select_sub_lane')
        .setPlaceholder('부라인 선택')
        .setMinValues(1)
        .setMaxValues(5)
        .addOptions(
          { label: '탑', value: 'top' },
          { label: '정글', value: 'jungle' },
          { label: '미드', value: 'mid' },
          { label: '원딜', value: 'adc' },
          { label: '서폿', value: 'support' }
        );

      const tierSelect = new StringSelectMenuBuilder()
        .setCustomId('select_tier')
        .setPlaceholder('최고 티어 선택')
        .addOptions(['I','B','S','G','P','E','D','M','GM','C'].map(t => ({ label: t, value: t })));

      const replyMsg = await interaction.reply({
        content: `**[𝙡𝙤𝙡𝙫𝙚𝙡𝙮] 내전이 시작되었어요**\n🕒 시작: ${startTime}\n\n참여자:\n(없음)`,
        components: [row, new ActionRowBuilder().addComponents(mainLaneSelect), new ActionRowBuilder().addComponents(subLaneSelect), new ActionRowBuilder().addComponents(tierSelect)],
        fetchReply: true
      });

      roomState.set(replyMsg.id, { members: [], lanes: {}, tiers: {}, last: new Set(), wait: new Set() });
      saveRooms();
    }

    // /칼바람내전
    if (commandName === '칼바람내전') {
      const startTime = options.getString('시간');
      const joinBtn = new ButtonBuilder().setCustomId('join_game').setLabel('✅ 참여').setStyle(ButtonStyle.Success);
      const leaveBtn = new ButtonBuilder().setCustomId('leave_game').setLabel('❌ 취소').setStyle(ButtonStyle.Danger);
      const row = new ActionRowBuilder().addComponents(joinBtn, leaveBtn);

      const replyMsg = await interaction.reply({
        content: `**[칼바람] 내전이 시작되었어요**\n🕒 시작: ${startTime}\n\n참여자:\n(없음)`,
        components: [row],
        fetchReply: true
      });

      roomState.set(replyMsg.id, { members: [], last: new Set(), wait: new Set() });
      saveRooms();
    }
  }

  // -------------------
  // 2) 버튼 핸들러
  // -------------------
  if (interaction.isButton()) {
    const { customId, user, message } = interaction;
    const key = message.id;
    if (!roomState.has(key)) roomState.set(key, { members: [], lanes: {}, tiers: {}, last: new Set(), wait: new Set() });
    const state = roomState.get(key);

    const updateMessage = () => interaction.update({ content: renderContent(message.content, state), components: message.components });

    if (customId === 'join_game') {
      if (!state.members.includes(user.id)) state.members.push(user.id);
      saveRooms(); return updateMessage();
    }
    if (customId === 'leave_game') {
      state.members = state.members.filter(id => id !== user.id);
      state.last.delete(user.id); state.wait.delete(user.id);
      saveRooms(); return updateMessage();
    }
    if (customId === 'last_call') { state.last.add(user.id); state.wait.delete(user.id); saveRooms(); return updateMessage(); }
    if (customId === 'wait') { state.wait.add(user.id); state.last.delete(user.id); saveRooms(); return updateMessage(); }
    if (customId === 'cancel_match') {
      const hostId = message.interaction?.user?.id;
      if (user.id !== hostId) return interaction.reply({ content: '⚠️ 진행자만 취소 가능', ephemeral: true });
      roomState.delete(key); await message.delete().catch(() => {}); saveRooms();
      return interaction.reply({ content: ' 📋 내전 모집이 취소되었습니다 📋 ' });
    }
  }

// -------------------
// 3) 선택 메뉴 핸들러
// -------------------
if (interaction.isStringSelectMenu()) {
  const { customId, values, user, message } = interaction;
  const key = message.id;
  if (!roomState.has(key)) return;
  const state = roomState.get(key);

  // 영어 → 한글 매핑
  const laneMap = {
    top: '탑',
    jungle: '정글',
    mid: '미드',
    adc: '원딜',
    support: '서폿'
  };

  // 주/부 라인 선택
  if (customId === 'select_main_lane' || customId === 'select_sub_lane') {
    const lanesKr = values.map(v => laneMap[v] || v);
    state.lanes[user.id] = lanesKr;
    saveRooms();

    // components는 제거해서 초기화 방지
    return interaction.update({
      content: renderContent(message.content, state)
    });
  }

  // 티어 선택
  if (customId === 'select_tier') {
    state.tiers[user.id] = values[0];
    saveRooms();

    // components는 제거해서 초기화 방지
    return interaction.update({
      content: renderContent(message.content, state)
    });
  }
}

// ✅ 클라이언트 실행
client.once('ready', () => {
  loadRooms();
  setInterval(saveRooms, 60 * 1000);
  console.log(`🤖 로그인 완료: ${client.user.tag}`);
});
client.login(token);

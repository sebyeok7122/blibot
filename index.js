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

// ✅ 전역 상태: 내전 참가 관리
const roomState = new Map(); // messageId -> { members, lanes, tiers, last, wait }

// ✅ rooms.json 저장/복원
const ROOMS_PATH = path.join(__dirname, 'rooms.json');
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
    const obj = JSON.parse(fs.readFileSync(ROOMS_PATH, 'utf8'));
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
  }
}

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

// ✅ 명령어 정의
const commands = [
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
    )
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

// ✅ 이벤트 핸들러
client.on('interactionCreate', async (interaction) => {
  // -------------------
  // 1) 명령어 핸들러
  // -------------------
  if (interaction.isChatInputCommand()) {
    const { commandName, options } = interaction;

    if (commandName === '내전' || commandName === '칼바람내전') {
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

      // 주/부 라인, 티어 선택
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
        content: commandName === '내전'
          ? `**[𝙡𝙤𝙡𝙫𝙚𝙡𝙮] 내전이 시작되었어요**\n🕒 시작: ${startTime}\n\n참여자:\n(없음)`
          : `**[칼바람] 내전이 시작되었어요**\n🕒 시작: ${startTime}\n\n참여자:\n(없음)`,
        components: [
          row,
          new ActionRowBuilder().addComponents(mainLaneSelect),
          new ActionRowBuilder().addComponents(subLaneSelect),
          new ActionRowBuilder().addComponents(tierSelect)
        ],
        fetchReply: true
      });

      roomState.set(replyMsg.id, { members: [], lanes: {}, tiers: {}, last: new Set(), wait: new Set() });
      saveRooms();
    }
  }

  // -------------------
  // 2) 버튼 핸들러
  // -------------------
  if (interaction.isButton()) {
    const { customId, user, message } = interaction;
    const key = message.id;

    if (!roomState.has(key)) {
      roomState.set(key, { members: [], lanes: {}, tiers: {}, last: new Set(), wait: new Set() });
    }
    const state = roomState.get(key);

    const updateMessage = () => {
      saveRooms();
      return interaction.update({
        content: renderContent(message.content, state),
        components: message.components
      });
    };

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
      roomState.delete(key);
      await message.delete().catch(() => {});
      saveRooms();
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

    if (customId === 'select_main_lane' || customId === 'select_sub_lane') {
      state.lanes[user.id] = values; // 영어 저장
      saveRooms();
      return interaction.update({
        content: renderContent(message.content, state),
        components: message.components
      });
    }

    if (customId === 'select_tier') {
      state.tiers[user.id] = values[0];
      saveRooms();
      return interaction.update({
        content: renderContent(message.content, state),
        components: message.components
      });
    }
  }
});

// ✅ 로그인
client.once('ready', () => {
  loadRooms();
  setInterval(saveRooms, 60 * 1000);
  console.log(`🤖 로그인 완료: ${client.user.tag}`);
});
client.login(token);

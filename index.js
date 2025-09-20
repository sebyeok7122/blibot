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
const fsP = require('fs/promises');
const backupRooms = require('./backupRooms');

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
const LINKS_PATH = path.join(__dirname, 'deeplol_links.json');
const ROOMS_PATH = path.join(__dirname, 'rooms.json');

// ✅ JSON 유틸
function loadAccounts() {
  if (fs.existsSync(accountPath)) {
    return JSON.parse(fs.readFileSync(accountPath, 'utf8'));
  } else return {};
}
function saveAccounts(accounts) {
  fs.writeFileSync(accountPath, JSON.stringify(accounts, null, 2));
}
async function readJSONSafe(file, fallback = {}) {
  try {
    const raw = await fsP.readFile(file, 'utf8');
    return JSON.parse(raw || '{}');
  } catch { return fallback; }
}
async function writeJSONSafe(file, obj) {
  const tmp = file + '.tmp';
  await fsP.writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
  await fsP.rename(tmp, file);
}

// ✅ roomState 저장/복원
const roomState = new Map();
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
    } catch (e) {
      console.error("❌ rooms.json 파싱 오류:", e.message);
    }
  }
}

// ✅ 명령어 정의
const commands = [
  new SlashCommandBuilder()
    .setName('계정등록')
    .setDescription('메인 계정을 등록합니다.')
    .addStringOption(o => o.setName('라이엇닉네임').setDescription('라이엇 닉네임#태그').setRequired(true)),

  new SlashCommandBuilder()
    .setName('부캐등록')
    .setDescription('부캐를 메인 계정과 연결합니다.')
    .addStringOption(o => o.setName('부캐닉네임').setDescription('부캐 닉네임').setRequired(true))
    .addStringOption(o => o.setName('메인닉네임').setDescription('메인 계정 닉네임').setRequired(true)),

  new SlashCommandBuilder()
    .setName('내전')
    .setDescription('내전을 모집합니다.')
    .addStringOption(o => o.setName('시간').setDescription('내전 시작 시간').setRequired(true)),

  new SlashCommandBuilder()
    .setName('칼바람내전')
    .setDescription('칼바람 내전을 모집합니다.')
    .addStringOption(o => o.setName('시간').setDescription('내전 시작 시간').setRequired(true)),

  new SlashCommandBuilder()
    .setName('계정삭제')
    .setDescription('내 계정 데이터를 삭제합니다.'),

  new SlashCommandBuilder()
    .setName('딥롤방연결')
    .setDescription('내전 matchId에 딥롤 방 코드(roomCode) 연결')
    .addStringOption(o => o.setName('matchid').setDescription('내전 matchId').setRequired(true))
    .addStringOption(o => o.setName('roomcode').setDescription('딥롤 방 코드').setRequired(true)),

  new SlashCommandBuilder()
    .setName('내전시간변경')
    .setDescription('현재 내전 시간을 수정합니다 (운영진/관리자/도우미 전용)')
    .addStringOption(o =>
      o.setName('시간')
        .setDescription('내전 시작 시간을 수정할 새로운 시간')
        .setRequired(true)
    ),
];

// ✅ 메시지 렌더링 함수
function renderContent(base, state) {
  const { members, lanes, tiers, last, wait } = state;
  const laneMap = { top: '탑', jungle: '정글', mid: '미드', adc: '원딜', support: '서폿' };

  // 참여자 목록
  const membersText = members.length
    ? members.map((id, i) => {
        const laneInfo = lanes?.[id] || { main: null, sub: null };
        const mainLane = laneInfo.main ? laneMap[laneInfo.main] : '없음';
        const subLane  = laneInfo.sub ? laneMap[laneInfo.sub]   : '없음';
        const tier     = tiers?.[id] || '없음';

        return `${i + 1}. <@${id}> (주: ${mainLane} / 부: ${subLane} / 티어: ${tier}) ${isLast}`;
      }).join('\n')
    : '(없음)';

  // ✅ 멘트 추가
  let extraNote = '';
  if (members.length % 10 === 0 && members.length > 0) {
    extraNote = '\n\n🍀 내전 인원 10명 넘어갈시 인원 10의 배수만큼 동시 진행됩니다 나머지는 내전 시작 이후 대기자로 넘어가게 됩니다 ! 🍀';
  }

  const lastText = last?.size ? [...last].map(id => `<@${id}>`).join(', ') : '(없음)';
  const waitText = wait?.size ? [...wait].map(id => `<@${id}>`).join(', ') : '(없음)';

  const head = base.split('\n\n참여자:')[0];

   return (
     `${head}\n\n` +
     `참여자:\n${membersText}${extraNote}\n\n` +
     `❌ 막판:\n${lastText}`
  );
}

client.on('interactionCreate', async (interaction) => {
  // -------------------
  // 1) 슬래시 명령어
  // -------------------
  if (interaction.isChatInputCommand()) {
    const { commandName, options, user } = interaction;
    const userId = user.id;

    // 계정등록
    if (commandName === '계정등록') {
      const riotNick = options.getString('라이엇닉네임');
      let accounts = loadAccounts();
      if (!accounts[userId]) {
        accounts[userId] = { main: riotNick, alts: [], wins: 0, losses: 0, mmr: 1000, streak: 0, gamesPlayed: 0 };
        saveAccounts(accounts);
        return interaction.reply(`✅ <@${userId}> 님의 메인 계정이 **${riotNick}** 으로 등록되었습니다!`);
      } else return interaction.reply(`⚠️ 이미 등록됨! 현재: **${accounts[userId].main}**`);
    }

    // 계정삭제
    if (commandName === '계정삭제') {
      let accounts = loadAccounts();
      if (accounts[userId]) {
        delete accounts[userId];
        saveAccounts(accounts);
        return interaction.reply(`🗑️ <@${userId}> 님의 계정 데이터가 삭제되었어요!`);
      } else return interaction.reply(`❌ 등록된 계정이 없습니다.`);
    }

    // 부캐등록
    if (commandName === '부캐등록') {
      const subNick = options.getString('부캐닉네임');
      const mainNick = options.getString('메인닉네임');
      let accounts = loadAccounts();
      if (!accounts[userId]) return interaction.reply(`❌ 먼저 /계정등록 하세요.`);
      if (accounts[userId].main !== mainNick) return interaction.reply(`⚠️ 메인 닉네임 다름. 현재: **${accounts[userId].main}**`);
      if (!accounts[userId].alts.includes(subNick)) {
        accounts[userId].alts.push(subNick); saveAccounts(accounts);
        return interaction.reply(`✅ 부캐 **${subNick}** 연결 완료!`);
      } else return interaction.reply(`⚠️ 이미 등록된 부캐: **${subNick}**`);
    }
   
// 내전 시간 변경 ✅
if (commandName === '내전시간변경') {
  const allowedRoles = ['1411424227457892412', '689438958140260361', '1415895023102197830'];

  // 권한 체크
  if (!interaction.member.roles.cache.some(r => allowedRoles.includes(r.id))) {
    return interaction.reply({
      content: '내전 시간은 운영진 또는 도우미에게 부탁해주세요 🛎',
      ephemeral: true
    });
  }

  // 권한 통과 ✅
  const newTime = options.getString('시간');

  // 현재 채널에서 내전 모집 메시지 찾기
  const channel = interaction.channel;
  const messages = await channel.messages.fetch({ limit: 20 }); // 최근 20개만 확인
  const recruitMsg = messages.find(m =>
    m.author.id === interaction.client.user.id &&
    m.content.includes('내전이 시작되었어요')
  );

  if (recruitMsg) {
    // 본문에서 "🕒 시작: ..." 부분 교체
    const updated = recruitMsg.content.replace(/🕒 시작: .*/, `🕒 시작: ${newTime}`);

    await recruitMsg.edit({ content: updated });
    await interaction.reply(`✅ 내전 시작 시간이 **${newTime}**(으)로 수정되었습니다!`);
  } else {
    await interaction.reply({
      content: '⚠️ 수정할 내전 메시지를 찾을 수 없어요.',
      ephemeral: true
    });
  }
}

// 내전 & 칼바람내전
if (commandName === '내전' || commandName === '칼바람내전') {
  // ✅ 관리자 + 도우미 권한 체크
  const allowedRoles = [
    '689438958140260361', // 관리자 역할 ID
    '1415895023102197830' // 도우미 역할 ID
  ];

  if (!interaction.member.roles.cache.some(r => allowedRoles.includes(r.id))) {
    return interaction.reply({
      content: '🤍 내전 모집은 관리자 혹은 도우미에게 문의주세요 🤍',
      ephemeral: true
    });
  }

  const startTime = options.getString('시간');
  const isAram = commandName === '칼바람내전';

  const joinBtn = new ButtonBuilder()
    .setCustomId('join_game')
    .setLabel('✅ 내전참여')
    .setStyle(ButtonStyle.Success);

  const leaveBtn = new ButtonBuilder()
    .setCustomId('leave_game')
    .setLabel('❎ 내전취소')
    .setStyle(ButtonStyle.Danger);

  const lastBtn = new ButtonBuilder()
    .setCustomId('last_call')
    .setLabel('⛔ 막판')
    .setStyle(ButtonStyle.Primary);

  // ✅ 버튼: 참여 / 취소 / 막판
  const row = new ActionRowBuilder().addComponents(joinBtn, leaveBtn, lastBtn);

  const mainLaneSelect = new StringSelectMenuBuilder()
    .setCustomId('select_main_lane')
    .setPlaceholder('주라인 선택')
    .setMinValues(1).setMaxValues(5)
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
    .setMinValues(1).setMaxValues(5)
    .addOptions(
      { label: '탑', value: 'top' },
      { label: '정글', value: 'jungle' },
      { label: '미드', value: 'mid' },
      { label: '원딜', value: 'adc' },
      { label: '서폿', value: 'support' }
    );

const tierSelect = new StringSelectMenuBuilder()
  .setCustomId('select_tier')
  .setPlaceholder('14~15 최고티어')
  .addOptions(
    [
      { label: '아이언', value: 'I' },
      { label: '브론즈', value: 'B' },
      { label: '실버', value: 'S' },
      { label: '골드', value: 'G' },
      { label: '플래티넘', value: 'P' },
      { label: '에메랄드', value: 'E' },
      { label: '다이아', value: 'D' },
      { label: '마스터', value: 'M' },
      { label: '그마', value: 'GM' },
      { label: '챌린저', value: 'C' },
      { label: '14~15 최고티어', value: 'T1415' } // ✅ 추가
    ]
  );

  const replyMsg = await interaction.reply({
    content: `**[${isAram ? '칼바람' : '𝙡𝙤𝙡𝙫𝙚𝙡𝙮'}] 내전이 시작되었어요**\n🕒 시작: ${startTime}\n\n참여자:\n(없음)`,
    components: [
      row,
      new ActionRowBuilder().addComponents(mainLaneSelect),
      new ActionRowBuilder().addComponents(subLaneSelect),
      new ActionRowBuilder().addComponents(tierSelect)
    ],
    fetchReply: true
  });

  roomState.set(replyMsg.id, { members: [], lanes: {}, tiers: {}, last: new Set(), wait: new Set() });

  // ✅ 40분 뒤 알림 & 막판 버튼 강조
  setTimeout(async () => {
    try {
      await replyMsg.edit({
        content: replyMsg.content + '\n\n🔥 내전이 곧 시작됩니다! 마지막 참여 여부(막판)를 선택해주세요.',
        components: [
          ...replyMsg.components,
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('last_call')
              .setLabel('⛔ 막판')
              .setStyle(ButtonStyle.Primary)
          )
        ]
      });
    } catch (err) {
      console.error('막판 버튼 추가 오류:', err);
    }
  }, 1000 * 60 * 40); // 40분 뒤 실행
}

    // 딥롤방연결
    if (commandName === '딥롤방연결') {
      const matchId = options.getString('matchid', true);
      const roomCode = options.getString('roomcode', true);
      try {
        const map = await readJSONSafe(LINKS_PATH, {});
        map[matchId] = { roomCode, updatedAt: Date.now() };
        await writeJSONSafe(LINKS_PATH, map);
        return interaction.reply({ content: `🔗 matchId **${matchId}** ↔ roomCode **${roomCode}** 연결 완료!`, ephemeral: true });
      } catch (e) {
        console.error('딥롤방연결 오류:', e);
        return interaction.reply({ content: '❌ 연결 중 오류 발생.', ephemeral: true });
      }
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

  // 참여자 목록을 다시 렌더링하는 함수
  const renderMembers = () => {
    const memberList = state.members
      .map((id, i) => `${i + 1}. <@${id}>`)
      .join('\n');

    let extraNote = '';
    if (state.members.length % 10 === 0 && state.members.length > 0) {
      extraNote = '\n\n🍀 내전 인원 10명 넘어갈시 인원 10의 배수만큼 동시 진행됩니다 나머지는 내전 시작 이후 대기자로 넘어가게 됩니다 ! 🍀';
    }

    return `참여자:\n${memberList}${extraNote}`;
  };

  const updateMessage = () => 
    interaction.update({ 
      content: renderContent(message.content, state), 
      components: message.components 
    });

  if (customId === 'join_game') { 
    if (!state.members.includes(user.id)) state.members.push(user.id); 
    saveRooms(); 
    backupRooms(state); // ✅ 참여 시 백업
    return updateMessage(); 
  }

  if (customId === 'leave_game') { 
    state.members = state.members.filter(id => id !== user.id); 
    state.last.delete(user.id); 
    state.wait.delete(user.id); 
    saveRooms(); 
    backupRooms(state); // ✅ 취소 시 백업
    return updateMessage(); 
  }

  if (customId === 'last_call') { 
    state.last.add(user.id); 
    state.wait.delete(user.id); 
    saveRooms(); 
    backupRooms(state); // ✅ 막판 버튼 시 백업
    return updateMessage(); 
  }

  if (customId === 'cancel_match') {
    const hostId = message.interaction?.user?.id;
    if (user.id !== hostId) 
      return interaction.reply({ content: '⚠️ 진행자만 취소할 수 있어요 ⚠️', ephemeral: true });
    roomState.delete(key); 
    await message.delete().catch(() => {}); 
    saveRooms(); 
    backupRooms(state); // ✅ 모집 취소 시 백업
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

  const laneMap = {
    top: '탑',
    jungle: '정글',
    mid: '미드',
    adc: '원딜',
    support: '서폿'
  };

  // ✅ 티어 옵션 (항상 동일하게 사용)
  const tierOptions = [
    { label: '아이언', value: 'I' },
    { label: '브론즈', value: 'B' },
    { label: '실버', value: 'S' },
    { label: '골드', value: 'G' },
    { label: '플래티넘', value: 'P' },
    { label: '에메랄드', value: 'E' },
    { label: '다이아', value: 'D' },
    { label: '마스터', value: 'M' },
    { label: '그마', value: 'GM' },
    { label: '챌린저', value: 'C' },
    { label: '14~15 최고티어', value: 'T1415' }
  ];

  // -------------------
  // 주/부 라인 선택
  // -------------------
  if (customId === 'select_main_lane' || customId === 'select_sub_lane') {
    state.lanes[user.id] = state.lanes[user.id] || { main: null, sub: null };
    if (customId === 'select_main_lane') {
      state.lanes[user.id].main = values[0];
    } else {
      state.lanes[user.id].sub = values[0];
    }
    saveRooms();

    return interaction.update({
      content: renderContent(message.content, state),
      components: [
        // 버튼 유지
        ...message.components.filter(r => r.components.some(c => c.data?.style)),
        // 주 라인
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('select_main_lane')
            .setPlaceholder('주 라인을 선택하세요')
            .addOptions(
              Object.entries(laneMap).map(([val, label]) => ({
                label,
                value: val,
                default: state.lanes[user.id]?.main === val
              }))
            )
        ),
        // 부 라인
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('select_sub_lane')
            .setPlaceholder('부 라인을 선택하세요')
            .addOptions(
              Object.entries(laneMap).map(([val, label]) => ({
                label,
                value: val,
                default: state.lanes[user.id]?.sub === val
              }))
            )
        ),
        // ✅ 티어 박스도 항상 유지
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('select_tier')
            .setPlaceholder('14~15 최고티어')
            .addOptions(
              tierOptions.map(opt => ({
                label: opt.label,
                value: opt.value,
                default: state.tiers[user.id] === opt.value
              }))
            )
        )
      ]
    });
  }

  // -------------------
  // ⚡ 티어 선택 처리
  // -------------------
  if (customId === 'select_tier') {
    state.tiers[user.id] = values[0];
    saveRooms();

    return interaction.update({
      content: renderContent(message.content, state),
      components: [
        // 버튼 유지
        ...message.components.filter(r => r.components.some(c => c.data?.style)),
        // 라인 선택 유지
        ...message.components.filter(r =>
          r.components.some(c => c.data?.custom_id === 'select_main_lane' || c.data?.custom_id === 'select_sub_lane')
        ),
        // ✅ 티어 선택 갱신
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('select_tier')
            .setPlaceholder('14~15 최고티어')
            .addOptions(
              tierOptions.map(opt => ({
                label: opt.label,
                value: opt.value,
                default: state.tiers[user.id] === opt.value
              }))
            )
        )
      ]
    });
  }
}
}); // ← interactionCreate 닫기 (이거 추가!)


// 로그인
client.login(token);
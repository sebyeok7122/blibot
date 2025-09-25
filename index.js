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
      wait: [...value.wait],
      startTime: value.startTime,
      isAram: value.isAram,
      joinedAt: value.joinedAt
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
          members: value.members || [],
          lanes: value.lanes || {},
          tiers: value.tiers || {},
          last: new Set(value.last || []),
          wait: new Set(value.wait || []),
          startTime: value.startTime,
          isAram: value.isAram,
          joinedAt: value.joinedAt || {}
        });
      }
      console.log("✅ roomState 복원 완료:", roomState.size);
    } catch (e) {
      console.error("❌ rooms.json 파싱 오류:", e.message);
    }
  }
}
loadRooms();

// ✅ 명령어 정의 (원래 있던 명령어에 /막판자삭제 추가)
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

  // 추가: /막판자삭제
  new SlashCommandBuilder()
    .setName('막판자삭제')
    .setDescription('막판 명단에서 특정 유저를 삭제합니다 (운영진/도우미만 가능)')
    .addUserOption(o => o.setName('유저').setDescription('삭제할 유저').setRequired(true)),
];

// ✅ 시간 포맷 (한국 기준)
function formatKST(date) {
  return new Date(date).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    minute: "numeric",
    hour12: true
  });
}

function renderEmbed(state, startTime, isAram) {
  const { members, lanes, tiers, last, joinedAt, wait } = state;
  const laneMap = { top: '탑', jungle: '정글', mid: '미드', adc: '원딜', support: '서폿' };

  let membersText = (members || []).slice(0, 40).map((m, i) => {
    const userId = typeof m === "string" ? m : m.id;
    const laneInfo = lanes?.[userId] || { main: null, sub: [] };
    const mainLane = laneInfo.main ? laneMap[laneInfo.main] : '없음';
    const subLane  = laneInfo.sub?.length ? laneInfo.sub.map(v => laneMap[v]).join(', ') : '없음';
    const tier     = tiers?.[userId] || '없음';
    const timeText = joinedAt?.[userId] ? formatKST(joinedAt[userId]) : '';

    return `${i + 1}. <@${userId}> (주: ${mainLane} / 부: ${subLane} / 티어: ${tier}) ${timeText}`;
  }).join('\n') || "(없음)";

  // 대기자 표시 (11~20 등)
  const waitText = (wait && wait.size) ? [...wait].map((id, idx) => `${members.length + idx + 1}. <@${id}>`).join('\n') : '(없음)';

  if ((members || []).length > 40) {
    membersText += `\n\n⚠️ 참여자 수가 40명을 초과하여 **더이상 참여하실 수 없습니다.**\n새 시트를 이용해 주세요.`;
  }

  const lastText = last?.size ? [...last].map(id => `<@${id}>`).join(', ') : '(없음)';

  const fields = [{ name: "❌ 막판", value: lastText, inline: false }];
  if (wait && wait.size) fields.push({ name: "⏳ 대기자", value: waitText, inline: false });

  return {
    color: 0x5865F2,
    title: `📋 [${isAram ? "칼바람" : "𝙡𝙤𝙡𝙫𝙚𝙡𝙮"}] 내전이 시작되었어요`,
    description: `🕒 시작: ${startTime || "미정"}\n\n참여자:\n${membersText}`,
    fields,
    timestamp: new Date()
  };
}

module.exports = renderEmbed;

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
        (m.embeds?.[0]?.title || '').includes('내전이 시작되었어요')
      );

      if (recruitMsg) {
        // embed 갱신 방식으로 교체
        const key = recruitMsg.id;
        if (!roomState.has(key)) {
          return interaction.reply({ content: '⚠️ 상태를 찾을 수 없어요.', ephemeral: true });
        }
        const state = roomState.get(key);
        state.startTime = newTime;
        saveRooms();
        await recruitMsg.edit({ embeds: [renderEmbed(state, state.startTime, state.isAram)] });
        await interaction.reply(`✅ 내전 시작 시간이 **${newTime}**(으)로 수정되었습니다!`);
      } else {
        await interaction.reply({
          content: '⚠️ 수정할 내전 메시지를 찾을 수 없어요.',
          ephemeral: true
        });
      }
    }

    // -------------------
    // /내전 & /칼바람내전
    // -------------------
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

      // ✅ 버튼 정의 (4가지)
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
        .setLabel('⛔ 내전막판')
        .setStyle(ButtonStyle.Primary);

      const waitBtn = new ButtonBuilder()
        .setCustomId('wait_game')
        .setLabel('⏳ 내전대기')
        .setStyle(ButtonStyle.Secondary);

      // 버튼 묶음
      const row = new ActionRowBuilder().addComponents(joinBtn, leaveBtn, lastBtn, waitBtn);

      // ✅ embed 사용 (버튼만 부착)
      const replyMsg = await interaction.reply({
        embeds: [
          renderEmbed(
            {
              members: [],
              lanes: {},
              tiers: {},
              last: new Set(),
              wait: new Set(),
              joinedAt: {}
            },
            startTime,
            isAram
          )
        ],
        components: [row],
        fetchReply: true
      });

      // 방 상태 저장
      roomState.set(replyMsg.id, { 
        members: [], 
        lanes: {}, 
        tiers: {}, 
        last: new Set(), 
        wait: new Set(),
        startTime,   // ✅ 시작 시간 저장
        isAram,      // ✅ 칼바람 여부 저장
        joinedAt: {} // ✅ 참여 시간 기록용
      });
      saveRooms();
    }

    // -------------------
    // /딥롤방연결
    // -------------------
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

    // -------------------
    // /막판자삭제
    // -------------------
    if (commandName === '막판자삭제') {
      const allowedRoles = ['689438958140260361', '1415895023102197830'];
      if (!interaction.member.roles.cache.some(r => allowedRoles.includes(r.id))) {
        return interaction.reply({ content: '⚠️ 권한이 없습니다.', ephemeral: true });
      }

      const target = options.getUser('유저');
      if (!target) return interaction.reply({ content: '❌ 유저를 지정해주세요.', ephemeral: true });

      // 현재 채널의 최신 내전 메시지 탐색
      const messages = await interaction.channel.messages.fetch({ limit: 30 });
      const recruitMsg = messages.find(m => m.author.id === interaction.client.user.id && roomState.has(m.id));
      if (!recruitMsg) return interaction.reply({ content: '⚠️ 내전 방을 찾을 수 없습니다.', ephemeral: true });

      const state = roomState.get(recruitMsg.id);
      if (state.last.has(target.id)) {
        state.last.delete(target.id);
        saveRooms();
        backupRooms(state);
        await recruitMsg.edit({ embeds: [renderEmbed(state, state.startTime, state.isAram)] });
        return interaction.reply(`✅ <@${target.id}> 님을 막판 명단에서 삭제했습니다.`);
      } else {
        return interaction.reply({ content: '⚠️ 해당 유저는 막판 명단에 없습니다.', ephemeral: true });
      }
    }
  }

  // -------------------
  // 2) 버튼 핸들러 (4가지 버튼)
  // -------------------
  if (interaction.isButton()) {
    const { customId, user, message } = interaction;
    const key = message.id;

    if (!roomState.has(key)) {
      roomState.set(key, { members: [], lanes: {}, tiers: {}, last: new Set(), wait: new Set(), joinedAt: {} });
    }
    const state = roomState.get(key);

    // 공용 임베드 갱신 함수
    const updateMessage = () =>
      interaction.update({ 
        embeds: [renderEmbed(state, state.startTime, state.isAram)],
        components: message.components
      });

    // ✅ 내전참여
    if (customId === 'join_game') {
      if (state.members.includes(user.id) || state.wait.has(user.id)) {
        return interaction.reply({ content: '⚠️ 이미 신청하셨습니다.', ephemeral: true });
      }

      // 최대 40 제한 (참여 + 대기)
      if (state.members.length + state.wait.size >= 40) {
        return interaction.reply({ content: '❌ 인원 40명 초과, 더 이상 참여할 수 없습니다.', ephemeral: true });
      }

      // 10명 단위 로직: 1~10 참여, 11~20 대기 → 대기 10명 되면 일괄 승급
      if (state.members.length > 0 && state.members.length % 10 === 0) {
        // 현재 파티가 정확히 10,20,30명 차 있는 시점 → 대기로 보냄
        state.wait.add(user.id);
        // 대기 10명 꽉 찼다면 일괄 승급
        if (state.wait.size === 10) {
          const toPromote = Array.from(state.wait).slice(0, 10);
          toPromote.forEach(uid => {
            state.members.push(uid);
            state.wait.delete(uid);
          });
        }
      } else {
        // 아직 해당 10단위가 안 찼으면 참여자에 추가
        state.members.push(user.id);
      }

      state.joinedAt[user.id] = Date.now();
      saveRooms();
      backupRooms(state);

      // ✅ 개인 전용 셀렉트 메뉴 (ephemeral)
      const mainLaneSelect = new StringSelectMenuBuilder()
        .setCustomId(`lane_${user.id}`)
        .setPlaceholder('주라인 선택')
        .addOptions(
          { label: '탑', value: 'top' },
          { label: '정글', value: 'jungle' },
          { label: '미드', value: 'mid' },
          { label: '원딜', value: 'adc' },
          { label: '서폿', value: 'support' }
        );

      const subLaneSelect = new StringSelectMenuBuilder()
        .setCustomId(`sublane_${user.id}`)
        .setPlaceholder('부라인 선택')
        .addOptions(
          { label: '없음', value: 'none' },
          { label: '탑', value: 'top' },
          { label: '정글', value: 'jungle' },
          { label: '미드', value: 'mid' },
          { label: '원딜', value: 'adc' },
          { label: '서폿', value: 'support' }
        );

      const tierSelect = new StringSelectMenuBuilder()
        .setCustomId(`tier_${user.id}`)
        .setPlaceholder('티어 선택')
        .addOptions(
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
        );

      // 공용 임베드는 동시에 갱신
      await message.edit({ embeds: [renderEmbed(state, state.startTime, state.isAram)], components: message.components });

      return interaction.reply({
        content: '🥨 개인 내전 설정창입니다. 선택한 내용은 다른 사람에게 보이지 않습니다.🥨',
        ephemeral: true,
        components: [
          new ActionRowBuilder().addComponents(mainLaneSelect),
          new ActionRowBuilder().addComponents(subLaneSelect),
          new ActionRowBuilder().addComponents(tierSelect)
        ]
      });
    }

    // ❎ 내전취소
    if (customId === 'leave_game') {
      const wasMember = state.members.includes(user.id);
      state.members = state.members.filter(m => m !== user.id);
      state.wait.delete(user.id);
      state.last.delete(user.id);

      // 빈자리 생겼고 대기자가 있다면 1명 승급
      if (wasMember && state.wait.size > 0) {
        const next = state.wait.values().next().value;
        state.wait.delete(next);
        state.members.push(next);
      }

      saveRooms();
      backupRooms(state);
      return updateMessage();
    }

    // ⛔ 내전막판
    if (customId === 'last_call') {
      state.last.add(user.id);

      // 막판은 참여 자리도 비움
      const wasMember = state.members.includes(user.id);
      state.members = state.members.filter(m => m !== user.id);

      // 빈자리 → 대기자 자동 승급
      if (wasMember && state.wait.size > 0) {
        const next = state.wait.values().next().value;
        state.wait.delete(next);
        state.members.push(next);
      }

      saveRooms();
      backupRooms(state);
      return updateMessage();
    }

    // ⏳ 내전대기
    if (customId === 'wait_game') {
      if (state.members.includes(user.id) || state.wait.has(user.id)) {
        return interaction.reply({ content: '⚠️ 이미 신청하셨습니다.', ephemeral: true });
      }
      if (state.members.length + state.wait.size >= 40) {
        return interaction.reply({ content: '❌ 인원 40명 초과, 더 이상 참여할 수 없습니다.', ephemeral: true });
      }

      state.wait.add(user.id);

      // 대기 10명 → 일괄 승급
      if (state.wait.size === 10) {
        const toPromote = Array.from(state.wait).slice(0, 10);
        toPromote.forEach(uid => {
          state.members.push(uid);
          state.wait.delete(uid);
        });
      }

      saveRooms();
      backupRooms(state);
      return updateMessage();
    }
  }

  // -------------------
// 3) 선택 메뉴 핸들러 (ephemeral 개인 메뉴)
// -------------------
if (interaction.isStringSelectMenu()) {
  const { customId, values, user } = interaction;

  // customId 형식: lane_<userId> | sublane_<userId> | tier_<userId>
  const [type, ownerId] = customId.split('_');
  if (ownerId !== user.id) {
    return interaction.reply({
      content: '❌ 이 메뉴는 당신 전용입니다.',
      ephemeral: true
    });
  }

  // 현재 채널의 최신 내전 메시지 상태 찾기
  const messages = await interaction.channel.messages.fetch({ limit: 30 });
  const recruitMsg = messages.find(
    m => m.author.id === interaction.client.user.id && roomState.has(m.id)
  );
  if (!recruitMsg) {
    return interaction.reply({
      content: '⚠️ 내전 방을 찾을 수 없습니다.',
      ephemeral: true
    });
  }

  const key = recruitMsg.id;
  const state = roomState.get(key);

  // 기본 구조 보장
  state.lanes[user.id] = state.lanes[user.id] || { main: null, sub: [] };

  if (type === 'lane') {
    state.lanes[user.id].main = values[0];
  } else if (type === 'sublane') {
    // 'none' 선택 시 빈 배열
    state.lanes[user.id].sub = values[0] === 'none' ? [] : values;
  } else if (type === 'tier') {
    state.tiers[user.id] = values[0];
  }

  saveRooms();
  backupRooms(state);

  // ✅ 선택 반영만 하고, UI는 그대로 유지
  await interaction.deferUpdate();
 }
} // ← isStringSelectMenu 블럭 닫기 + interactionCreate 전체 닫기

// 로그인
client.login(token);
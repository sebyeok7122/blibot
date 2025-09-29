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

// ✅ 라인 옵션
const laneOptions = [
  { label: '탑', value: 'top' },
  { label: '정글', value: 'jungle' },
  { label: '미드', value: 'mid' },
  { label: '원딜', value: 'adc' },
  { label: '서폿', value: 'support' },
  { label: '없음', value: '없음' },
];

// ✅ 티어 옵션
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
  { label: '14~15최고티어', value: 'T1415' },
  { label: '없음', value: '없음' },
];

// ✅ 공용 티어 라벨 (로그/버튼 핸들러, 선택 핸들러 공용)
const TIER_LABELS = {
  I:'아이언', B:'브론즈', S:'실버', G:'골드',
  P:'플래티넘', E:'에메랄드', D:'다이아', M:'마스터',
  GM:'그마', C:'챌린저', T1415:'14~15최고티어'
};

// ✅ fetch 추가
const fetch = require('node-fetch');

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

// 🔑 Riot API Key 불러오기
const riotKey = process.env.RIOT_API_KEY;

const accountPath = path.join(__dirname, 'accounts.json');
const LINKS_PATH = path.join(__dirname, 'deeplol_links.json');
const ROOMS_PATH = path.join(__dirname, 'rooms.json');

// ✅ JSON 유틸
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

// ✅ accounts.json 유틸
function loadAccounts() {
  if (fs.existsSync(accountPath)) {
    try {
      const raw = fs.readFileSync(accountPath, 'utf8');
      return JSON.parse(raw || '{}');
    } catch (e) {
      console.error("❌ accounts.json 파싱 오류:", e);
      return {};
    }
  }
  return {};
}

function saveAccounts(accounts) {
  try {
    fs.writeFileSync(accountPath, JSON.stringify(accounts, null, 2), 'utf8');
  } catch (e) {
    console.error("❌ accounts.json 저장 오류:", e);
  }
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
      if (!Object.keys(obj).length) {
        console.warn("⚠️ rooms.json이 비어있음. 새 상태 초기화.");
        return;
      }
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

// ✅ 시간 포맷 (한국 기준)
function formatKST(date) {
  return new Date(date).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    minute: "numeric",
    hour12: true
  });
}

// ✅ Embed 렌더링 함수
function renderEmbed(state, startTime, isAram) {
  const { members, lanes, tiers, last, joinedAt, wait } = state;

  // 라인 매핑
  const laneMap = { 
    top: '탑', 
    jungle: '정글', 
    mid: '미드', 
    adc: '원딜', 
    support: '서폿' 
  };

  // 티어 매핑
  const tierMap = { 
    I: '아이언', B: '브론즈', S: '실버', G: '골드',
    P: '플래티넘', E: '에메랄드', D: '다이아', M: '마스터',
    GM: '그마', C: '챌린저', T1415: '14~15최고티어'
  };

  // 참여자 출력
  let membersText = (members || []).slice(0, 40).map((id, i) => {
    const laneInfo = lanes?.[id] || { main: null, sub: [] };
    const mainLane = laneInfo.main ? laneMap[laneInfo.main] : '없음';
    const subLane  = laneInfo.sub?.length ? laneInfo.sub.map(v => laneMap[v]).join(', ') : '없음';
    const tier     = tierMap[tiers?.[id]] || '없음';
    const timeText = joinedAt?.[id] ? formatKST(joinedAt[id]) : '';
    return `${i + 1}. <@${id}> (주: ${mainLane} / 부: ${subLane} / 티어: ${tier}) ${timeText}`;
  }).join('\n') || "(없음)";

  // 대기자 표시
  const waitText = (wait && wait.size) 
    ? [...wait].map((id, idx) => `${members.length + idx + 1}. <@${id}>`).join('\n') 
    : '(없음)';

  // 막판 표시
  const lastText = last?.size
    ? [...last].map((id, idx) => `${idx + 1}. <@${id}>`).join('\n')
    : '(없음)';

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
    .setName('계정삭제')
    .setDescription('내 계정 데이터를 삭제합니다.'),

  new SlashCommandBuilder()
    .setName('내전')
    .setDescription('내전을 모집합니다.')
    .addStringOption(o => o.setName('시간').setDescription('내전 시작 시간').setRequired(true)),

  new SlashCommandBuilder()
    .setName('칼바람내전')
    .setDescription('칼바람 내전을 모집합니다.')
    .addStringOption(o => o.setName('시간').setDescription('내전 시작 시간').setRequired(true)),

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

  new SlashCommandBuilder()
    .setName('막판자삭제')
    .setDescription('막판 명단에서 특정 유저를 삭제합니다 (운영진/도우미만 가능)')
    .addUserOption(o => o.setName('유저').setDescription('삭제할 유저').setRequired(true)),

  new SlashCommandBuilder()
    .setName('참여자삭제')
    .setDescription('참여자/대기자 명단에서 특정 유저를 삭제합니다 (운영진/도우미만 가능)')
    .addUserOption(o => o.setName('유저').setDescription('삭제할 유저').setRequired(true)),
];

// ✅ 슬래시 명령어 등록
const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log("📢 슬래시 명령어 등록 시작...");
    for (const guildId of guildIds) {
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );
      console.log(`✅ ${guildId} 서버에 명령어 등록 완료!`);
    }
  } catch (error) {
    console.error("❌ 명령어 등록 실패:", error);
  }
})();

client.on('interactionCreate', async (interaction) => {
  
// -------------------
  // 1) 슬래시 명령어 처리
  // -------------------
  if (interaction.isChatInputCommand()) {
    const { commandName, options, user } = interaction;
    const userId = user.id;

// ✅ 계정등록 (강화 버전)
if (commandName === '계정등록') {
  const userId = interaction.user.id;
  const riotKey = process.env.RIOT_API_KEY;

  // 옵션명 예외 대응 (등록명이 영어일 수 있음)
  const rawInput =
    options.getString('라이엇닉네임') ??
    options.getString('riotnick') ??
    options.getString('riot_id');

  // ▶ 파서: 다양한 입력을 정상화
  function parseRiotId(input) {
    if (!input) return { error: "❌ 닉네임을 입력해주세요. (예: 새벽#반딧불이 또는 새벽#KR1)" };

    // 제로폭/전각해시/여러 공백 정리
    let s = String(input)
      .replace(/\u200B/g, '')         // zero-width 제거
      .replace(/＃/g, '#')            // 전각 → 반각
      .replace(/[\s\u00A0]+/g, ' ')   // 공백 정규화
      .trim();

    // -, @ 를 # 로 허용
    s = s.replace(/[@\-]/g, '#');

    // # 없으면 끝 토큰이 2~5자 영숫자면 태그로 간주
    if (!s.includes('#')) {
      const m = s.match(/^(.*?)[\s_]*([a-zA-Z0-9]{2,5})$/);
      if (m) s = `${m[1].trim()}#${m[2]}`;
    }

    const idx = s.indexOf('#');
    if (idx === -1) return { error: "❌ 닉네임 형식이 올바르지 않습니다. (예: 새벽#반딧불이 또는 새벽#KR1)" };

    const gameName = s.slice(0, idx).trim();
    const tagLine  = s.slice(idx + 1).trim().toUpperCase();

    if (gameName.length < 3 || gameName.length > 16)
      return { error: "❌ 소환사명은 3~16자여야 합니다." };

    // 허용 문자(한글/영문/숫자/기본 구두점)
    if (!/^[\p{L}\p{N} ._'-]{3,16}$/u.test(gameName))
      return { error: "❌ 소환사명에 허용되지 않는 문자가 포함되어 있습니다." };

    if (!/^[A-Z0-9]{2,5}$/.test(tagLine))
      return { error: "❌ 태그는 영문/숫자 2~5자여야 합니다." };

    return { gameName, tagLine };
  }

  const parsed = parseRiotId(rawInput);
  if (parsed.error) {
    return interaction.reply({ content: parsed.error, ephemeral: true });
  }
  const { gameName, tagLine } = parsed;

  // 디버그 로그(배포 중엔 꺼도 됨)
  console.log(`[계정등록] raw="${rawInput}" -> gameName="${gameName}", tagLine="${tagLine}"`);

  try {
    const url = `https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
    const response = await fetch(url, { headers: { 'X-Riot-Token': riotKey } });

    if (response.status === 404) {
      return interaction.reply({ content: "❌ 존재하지 않는 라이엇 계정입니다.", ephemeral: true });
    }
    if (!response.ok) {
      return interaction.reply({ content: `❌ Riot API 오류: ${response.status}`, ephemeral: true });
    }

    const data = await response.json();
    const officialName = `${data.gameName}#${data.tagLine}`;

    let accounts = loadAccounts();
    if (!accounts[userId]) {
      accounts[userId] = {
        riotName: officialName,
        puuid: data.puuid,
        mmr: 1000,
        wins: 0,
        losses: 0,
        streak: 0,
        gamesPlayed: 0,
        userTag: interaction.user.tag,
        type: "main"
      };
      saveAccounts(accounts);
      return interaction.reply({ content: `✅ <@${userId}> 메인 계정이 **${officialName}** 으로 등록되었습니다!`, ephemeral: true });
    } else {
      return interaction.reply({ content: `⚠️ 이미 등록된 계정: **${accounts[userId].riotName}**`, ephemeral: true });
    }
  } catch (err) {
    console.error("계정등록 오류:", err);
    return interaction.reply({ content: "❌ 계정 등록 중 오류가 발생했습니다.", ephemeral: true });
   }
 }


    // ✅ 계정삭제
    if (commandName === '계정삭제') {
      let accounts = loadAccounts();
      if (accounts[userId]) {
        delete accounts[userId];
        saveAccounts(accounts);
        return interaction.reply(`🗑️ 계정 삭제 완료`);
      } else return interaction.reply(`❌ 등록된 계정이 없습니다.`);
    }

    // ✅ 부캐등록
    if (commandName === '부캐등록') {
      const subNick = options.getString('부캐닉네임');
      const mainNick = options.getString('메인닉네임');
      let accounts = loadAccounts();
      if (!accounts[userId]) return interaction.reply(`❌ 먼저 /계정등록 하세요.`);
      if (accounts[userId].riotName !== mainNick) return interaction.reply(`⚠️ 메인 닉네임이 다릅니다.`);
      if (!accounts[userId].alts) accounts[userId].alts = [];
      if (!accounts[userId].alts.includes(subNick)) {
        accounts[userId].alts.push(subNick);
        saveAccounts(accounts);
        return interaction.reply(`✅ 부캐 **${subNick}** 연결 완료!`);
      } else return interaction.reply(`⚠️ 이미 등록된 부캐`);
    }

    // ✅ 내전/칼바람 내전 모집
    if (commandName === '내전' || commandName === '칼바람내전') {
      const allowedRoles = ['689438958140260361', '1415895023102197830'];
      if (!interaction.member.roles.cache.some(r => allowedRoles.includes(r.id))) {
        return interaction.reply({ content: '🤍 내전 모집은 관리자/도우미 문의', ephemeral: true });
      }

      const startTime = options.getString('시간');
      const isAram = commandName === '칼바람내전';

      const joinBtn = new ButtonBuilder().setCustomId('join_game').setLabel('✅ 내전참여').setStyle(ButtonStyle.Success);
      const leaveBtn = new ButtonBuilder().setCustomId('leave_game').setLabel('❎ 내전취소').setStyle(ButtonStyle.Danger);
      const lastBtn = new ButtonBuilder().setCustomId('last_call').setLabel('⛔ 내전막판').setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(joinBtn, leaveBtn, lastBtn);

      await interaction.deferReply();
      const replyMsg = await interaction.followUp({
        embeds: [renderEmbed({ members: [], lanes: {}, tiers: {}, last: new Set(), wait: new Set(), joinedAt: {} }, startTime, isAram)],
        components: [row]
      });

      roomState.set(replyMsg.id, { members: [], lanes: {}, tiers: {}, last: new Set(), wait: new Set(), startTime, isAram, joinedAt: {} });
      saveRooms();
      return;
    }
  }
}

// -------------------
// 2) 버튼 핸들러
// -------------------
if (interaction.isButton()) {
  const { customId, user, message } = interaction;
  const key = message.id;
  if (!roomState.has(key))
    roomState.set(key, { members: [], lanes: {}, tiers: {}, last: new Set(), wait: new Set(), joinedAt: {} });
  const state = roomState.get(key);

  const updateMessage = () =>
    message.edit({
      embeds: [renderEmbed(state, state.startTime, state.isAram)],
      components: message.components,
    });

  // ✅ 내전참여 (개인 설정창 열기)
  if (customId === 'join_game') {
    const mainLaneSelect = new StringSelectMenuBuilder()
      .setCustomId(`lane_${user.id}`)
      .setPlaceholder('주라인 선택')
      .addOptions(
        { label: '탑', value: 'top', default: state.lanes[user.id]?.main === 'top' },
        { label: '정글', value: 'jungle', default: state.lanes[user.id]?.main === 'jungle' },
        { label: '미드', value: 'mid', default: state.lanes[user.id]?.main === 'mid' },
        { label: '원딜', value: 'adc', default: state.lanes[user.id]?.main === 'adc' },
        { label: '서폿', value: 'support', default: state.lanes[user.id]?.main === 'support' }
      );

    const subLaneSelect = new StringSelectMenuBuilder()
      .setCustomId(`sublane_${user.id}`)
      .setPlaceholder('부라인 선택 (여러 개 가능)')
      .setMinValues(1)
      .setMaxValues(5)
      .addOptions(
        { label: '없음', value: 'none', default: (state.lanes[user.id]?.sub?.length ?? 0) === 0 },
        { label: '탑', value: 'top', default: state.lanes[user.id]?.sub?.includes('top') },
        { label: '정글', value: 'jungle', default: state.lanes[user.id]?.sub?.includes('jungle') },
        { label: '미드', value: 'mid', default: state.lanes[user.id]?.sub?.includes('mid') },
        { label: '원딜', value: 'adc', default: state.lanes[user.id]?.sub?.includes('adc') },
        { label: '서폿', value: 'support', default: state.lanes[user.id]?.sub?.includes('support') }
      );

    const tierSelect = new StringSelectMenuBuilder()
      .setCustomId(`tier_${user.id}`)
      .setPlaceholder('티어 선택')
      .addOptions(
        { label: '아이언', value: 'I', default: state.tiers[user.id] === 'I' },
        { label: '브론즈', value: 'B', default: state.tiers[user.id] === 'B' },
        { label: '실버', value: 'S', default: state.tiers[user.id] === 'S' },
        { label: '골드', value: 'G', default: state.tiers[user.id] === 'G' },
        { label: '플래티넘', value: 'P', default: state.tiers[user.id] === 'P' },
        { label: '에메랄드', value: 'E', default: state.tiers[user.id] === 'E' },
        { label: '다이아', value: 'D', default: state.tiers[user.id] === 'D' },
        { label: '마스터', value: 'M', default: state.tiers[user.id] === 'M' },
        { label: '그마', value: 'GM', default: state.tiers[user.id] === 'GM' },
        { label: '챌린저', value: 'C', default: state.tiers[user.id] === 'C' },
        { label: '14~15최고티어', value: 'T1415', default: state.tiers[user.id] === 'T1415' }
      );

    await interaction.reply({
      content: '🥨 개인 내전 설정창입니다. 선택한 내용은 다른 사람에게 보이지 않습니다. 🥨',
      ephemeral: true,
      components: [
        new ActionRowBuilder().addComponents(mainLaneSelect),
        new ActionRowBuilder().addComponents(subLaneSelect),
        new ActionRowBuilder().addComponents(tierSelect),
      ],
    });
    return;
  }

  if (customId === 'leave_game') {
    state.members = state.members.filter((m) => m !== user.id);
    state.wait.delete(user.id);
    state.last.delete(user.id);
    saveRooms();
    backupRooms(state);
    return updateMessage();
  }

  if (customId === 'last_call') {
    if (state.members.includes(user.id)) {
      state.last.add(user.id);
      state.members = state.members.filter((m) => m !== user.id);
      saveRooms();
      backupRooms(state);
      return updateMessage();
    }
  }
}
// -------------------
// 3) 선택 메뉴 핸들러 (확인 버튼 없이 즉시 반영)
// -------------------
if (interaction.isStringSelectMenu()) {
  const { customId, values, user } = interaction;
  const [type, ownerId] = customId.split('_');
  if (ownerId !== user.id) {
    return interaction.reply({ content: '❌ 이 메뉴는 당신 전용입니다.', ephemeral: true });
  }

  const messages = await interaction.channel.messages.fetch({ limit: 30 });
  const recruitMsg = messages.find(m => m.author.id === interaction.client.user.id && roomState.has(m.id));
  if (!recruitMsg) return interaction.reply({ content: '⚠️ 내전 방을 찾을 수 없습니다.', ephemeral: true });

  const key = recruitMsg.id;
  const state = roomState.get(key);
  state.lanes[user.id] = state.lanes[user.id] || { main: null, sub: [] };

  if (type === 'lane') state.lanes[user.id].main = values[0];
  else if (type === 'sublane') state.lanes[user.id].sub = values.filter(v => v !== 'none');
  else if (type === 'tier') state.tiers[user.id] = values[0];

  saveRooms();
  backupRooms(state);

  const mainLane = state.lanes[user.id]?.main;
  const subLanes = state.lanes[user.id]?.sub || [];
  const tierVal  = state.tiers[user.id];

  // ✅ 조건 충족하면 참여 처리
  if (mainLane && subLanes.length > 0 && tierVal &&
      !state.members.includes(user.id) && !state.wait.has(user.id)) {
    
    // 🔹 40명 초과 → 참여 불가
    if (state.members.length >= 40) {
      return interaction.reply({
        content: '❌ 인원 40명 초과, 더 이상 참여할 수 없습니다.',
        ephemeral: true
      });
    }

    // 🔹 10명 단위 자동 분리
    if (state.members.length % 10 === 0 && state.members.length !== 0) {
      state.wait.add(user.id);
      console.log(`⚠️ ${user.tag} → 대기열로 이동 (10명 단위 분리)`);
    } else {
      state.members.push(user.id);
      console.log(`✅ ${user.tag} → 참여자 명단 추가`);
    }

    // 🔹 대기자 10명 쌓이면 → 단체 승급
    if (state.wait.size >= 10) {
      const promoteBatch = [...state.wait].slice(0, 10);
      promoteBatch.forEach(uid => {
        state.wait.delete(uid);
        state.members.push(uid);
      });
      console.log(`🔼 대기자 10명 단체 승급됨: ${promoteBatch.map(id => `<@${id}>`).join(', ')}`);
    }

    state.joinedAt[user.id] = Date.now();
    saveRooms();
    backupRooms(state);
  }

  await recruitMsg.edit({ embeds: [renderEmbed(state, state.startTime, state.isAram)] });
  console.log(`✅ ${user.tag} 참여 확정 → 주:${mainLane}, 부:${subLanes.join(',')} 티어:${tierVal}`);

  // ✅ 선택 반영만 하고, UI는 그대로 유지
  await interaction.deferUpdate();
}

}); // ← interactionCreate 닫기

// 로그인
client.login(token);
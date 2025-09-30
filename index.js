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
const backupRooms = require('./backupRooms'); // 쓰고 있으면 유지, 아니면 지워도 됨
const { roomState, saveRooms, loadRooms, ROOMS_PATH } = require('./rooms');
console.log('📁 ROOMS_PATH =', ROOMS_PATH);

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

// ✅ 봇 로그인 전에 상태 복원
loadRooms();

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
  const uid = user.id;

 // -------------------
// 1) 계정등록 (강화 버전)
// -------------------
if (commandName === '계정등록') {
  const uid = interaction.user.id;                     // ← 추가!
  const riotKey = (process.env.RIOT_API_KEY || '').trim();

  // 옵션명 예외 대응 (등록명이 영어일 수 있음)
  const rawInput =
    options.getString('라이엇닉네임') ??
    options.getString('riotnick') ??
    options.getString('riot_id');

  // ▶ 파서: 다양한 입력을 정상화
  function parseRiotId(input) {
    if (!input) return { error: "❌ 닉네임을 입력해주세요. (예: 새벽#반딧불이 또는 새벽#KR1)" };

    let s = String(input)
      .replace(/\u200B/g, '')
      .replace(/＃/g, '#')
      .replace(/[\s\u00A0]+/g, ' ')
      .trim();

    s = s.replace(/[@\-]/g, '#');

    if (!s.includes('#')) {
      const m = s.match(/^(.*?)[\s_]*([a-zA-Z0-9]{2,5})$/);
      if (m) s = `${m[1].trim()}#${m[2]}`;
    }

    const idx = s.indexOf('#');
    if (idx === -1) return { error: "❌ 닉네임 형식이 올바르지 않습니다. (예: 새벽#반딧불이 또는 새벽#KR1)" };

    const gameName = s.slice(0, idx).trim();
    const tagLine  = s.slice(idx + 1).trim();

    if (gameName.length < 2 || gameName.length > 16)
      return { error: `❌ 소환사명은 2~16자여야 합니다. (입력된 길이: ${gameName.length})` };

    if (!/^[\p{L}\p{N} ._'-]{2,16}$/u.test(gameName))
      return { error: "❌ 소환사명에 허용되지 않는 문자가 포함되어 있습니다." };

    if (!/^[\p{L}\p{N}]{2,5}$/u.test(tagLine)) {
      return { error: "❌ 태그는 2~5자의 한글/영문/숫자여야 합니다." };
    }

    return { gameName, tagLine };
  } // parseRiotId end

  const parsed = parseRiotId(rawInput);
  if (parsed.error) {
    return interaction.reply({ content: parsed.error, ephemeral: true });
  }

  const { gameName: parsedGameName, tagLine: parsedTagLine } = parsed;
  console.log(`[계정등록] raw="${rawInput}" -> gameName="${parsedGameName}", tagLine="${parsedTagLine}"`);

  try {
    const url = `https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(parsedGameName)}/${encodeURIComponent(parsedTagLine)}`;
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
    if (!accounts[uid]) {
      accounts[uid] = {
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

      // ✅ 사용자에겐 개인 안내
      await interaction.reply({
        content: `✅ 메인 계정이 **${officialName}** 으로 등록되었습니다!`,
        ephemeral: true
      });

      // ✅ 채널엔 공개 공지
      await interaction.followUp({
        content: `✅ <@${uid}> 님이 메인 계정을 **${officialName}** 으로 등록했습니다!`
      });

      return; // 종료
    } else {
      return interaction.reply({ content: `⚠️ 이미 등록된 계정: **${accounts[uid].riotName}**`, ephemeral: true });
    }
  } catch (err) {
    console.error("계정등록 오류:", err);
    return interaction.reply({ content: "❌ 계정 등록 중 오류가 발생했습니다.", ephemeral: true });
  }
}

  // -------------------
  // 2) 계정삭제
  // -------------------
  if (commandName === '계정삭제') {
    let accounts = loadAccounts();
    if (accounts[uid]) {
      delete accounts[uid];
      saveAccounts(accounts);
      return interaction.reply({ content: '🗑️ 계정 삭제 완료' });
    } else {
      return interaction.reply({ content: '❌ 등록된 계정이 없습니다.' });
    }
  }

  // -------------------
  // 3) 부캐등록
  // -------------------
  if (commandName === '부캐등록') {
    const subNick = options.getString('부캐닉네임');
    const mainNick = options.getString('메인닉네임');
    let accounts = loadAccounts();
    if (!accounts[uid]) return interaction.reply({ content: '❌ 먼저 /계정등록 하세요.' });
    if (accounts[uid].riotName !== mainNick) return interaction.reply({ content: '⚠️ 메인 닉네임이 다릅니다.' });
    if (!accounts[uid].alts) accounts[uid].alts = [];
    if (!accounts[uid].alts.includes(subNick)) {
      accounts[uid].alts.push(subNick);
      saveAccounts(accounts);
      return interaction.reply({ content: `✅ 부캐 **${subNick}** 연결 완료!` });
    } else {
      return interaction.reply({ content: '⚠️ 이미 등록된 부캐' });
    }
  }
// -------------------
// 4) 내전 / 칼바람내전 모집
// -------------------
if (commandName === '내전' || commandName === '칼바람내전') {
  const allowedRoles = ['689438958140260361', '1415895023102197830'];
  if (!interaction.member.roles.cache.some(r => allowedRoles.includes(r.id))) {
    return interaction.reply({ content: '🤍 내전 모집은 관리자/도우미 문의', ephemeral: true });
  }

  const startTime = options.getString('시간');
  const isAram = commandName === '칼바람내전';

  await interaction.deferReply();

  // 1) 우선 임베드만 보내서 message.id 확보
  const replyMsg = await interaction.followUp({
    embeds: [renderEmbed({ members: [], lanes: {}, tiers: {}, last: new Set(), wait: new Set(), joinedAt: {} }, startTime, isAram)],
    components: []
  });

  const roomId = replyMsg.id;

  // 2) roomId를 customId에 포함한 버튼들 생성
  const joinBtn  = new ButtonBuilder().setCustomId(`join:${roomId}`).setLabel('✅ 내전참여').setStyle(ButtonStyle.Success);
  const leaveBtn = new ButtonBuilder().setCustomId(`leave:${roomId}`).setLabel('❎ 내전취소').setStyle(ButtonStyle.Danger);
  const lastBtn  = new ButtonBuilder().setCustomId(`last:${roomId}`).setLabel('⛔ 내전막판').setStyle(ButtonStyle.Primary);
  const row = new ActionRowBuilder().addComponents(joinBtn, leaveBtn, lastBtn);

  // 3) 버튼 부착
  await replyMsg.edit({ components: [row] });

  // 4) 메시지ID -> 방 상태 저장 (+ channelId 추가)
  roomState.set(roomId, {
    members: [],
    lanes: {},
    tiers: {},
    last: new Set(),
    wait: new Set(),
    startTime,
    isAram,
    joinedAt: {},
    channelId: replyMsg.channel.id, // ✅ 원본 채널 추적용
  });
  saveRooms();
  return;
 }
} // ← ★ isChatInputCommand 닫기: 마지막은 이거 하나면 끝!

// -------------------
// 2) 버튼 핸들러 (roomId+uid 안전판)
// -------------------
if (interaction.isButton()) {
  const i = interaction;
  const { customId } = i;

  // action:roomId (신규) 또는 레거시 지원
  let action, roomId;
  if (customId.includes(':')) {
    [action, roomId] = customId.split(':');   // e.g. "join:123..."
  } else {
    const legacy = { join_game: 'join', leave_game: 'leave', last_call: 'last', settings: 'settings' };
    action = legacy[customId];
    roomId = i.message.id;
    if (!action) {
      return i.reply({ content: '알 수 없는 요청입니다.', ephemeral: true });
    }
  }

  // 상태 없으면 초기화(+ channelId 저장) 후 즉시 저장
  if (!roomState.has(roomId)) {
    roomState.set(roomId, {
      members: [],
      lanes: {},
      tiers: {},
      last: new Set(),
      wait: new Set(),
      joinedAt: {},
      startTime: undefined,
      isAram: false,
      channelId: i.message.channelId,  // ✅ 추가
    });
    saveRooms(); // ✅ 초기화 직후 저장
  }
  const state = roomState.get(roomId);

  // 버튼행 생성기 (roomId 포함, 2줄 레이아웃)
  const buildRows = (rid) => {
    const r1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`join:${rid}`).setLabel('✅ 내전참여').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`leave:${rid}`).setLabel('❎ 내전취소').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`last:${rid}`).setLabel('⛔ 내전막판').setStyle(ButtonStyle.Primary),
    );
    const r2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`settings:${rid}`).setLabel('⚙️ 설정/변경').setStyle(ButtonStyle.Secondary),
    );
    return [r1, r2];
  };

  // 공용 업데이트 함수(항상 roomId 포함 버튼으로 재구성)
  const updateMessage = () => i.update({
    embeds: [renderEmbed(state, state.startTime, state.isAram)],
    components: buildRows(roomId),
  });

  // 공통: 개인 설정 패널 열기 (참가자/대기자 모두 허용)
  const openSettingsPanel = async (rid, uid) => {
    const mainLaneSelect = new StringSelectMenuBuilder()
      .setCustomId(`lane:${rid}:${uid}`)
      .setPlaceholder('주라인 선택')
      .addOptions(
        { label: '탑',    value: 'top',     default: state.lanes[uid]?.main === 'top' },
        { label: '정글',  value: 'jungle',  default: state.lanes[uid]?.main === 'jungle' },
        { label: '미드',  value: 'mid',     default: state.lanes[uid]?.main === 'mid' },
        { label: '원딜',  value: 'adc',     default: state.lanes[uid]?.main === 'adc' },
        { label: '서폿',  value: 'support', default: state.lanes[uid]?.main === 'support' },
      );

    const subLaneSelect = new StringSelectMenuBuilder()
      .setCustomId(`sublane:${rid}:${uid}`)
      .setPlaceholder('부라인 선택 (여러 개 가능)')
      .setMinValues(1)
      .setMaxValues(5)
      .addOptions(
        { label: '없음',  value: 'none',    default: (state.lanes[uid]?.sub?.length ?? 0) === 0 },
        { label: '탑',    value: 'top',     default: state.lanes[uid]?.sub?.includes('top') },
        { label: '정글',  value: 'jungle',  default: state.lanes[uid]?.sub?.includes('jungle') },
        { label: '미드',  value: 'mid',     default: state.lanes[uid]?.sub?.includes('mid') },
        { label: '원딜',  value: 'adc',     default: state.lanes[uid]?.sub?.includes('adc') },
        { label: '서폿',  value: 'support', default: state.lanes[uid]?.sub?.includes('support') },
      );

    const tierSelect = new StringSelectMenuBuilder()
      .setCustomId(`tier:${rid}:${uid}`)
      .setPlaceholder('티어 선택')
      .addOptions(
        { label: '아이언', value: 'I',  default: state.tiers[uid] === 'I' },
        { label: '브론즈', value: 'B',  default: state.tiers[uid] === 'B' },
        { label: '실버',   value: 'S',  default: state.tiers[uid] === 'S' },
        { label: '골드',   value: 'G',  default: state.tiers[uid] === 'G' },
        { label: '플래티넘', value: 'P', default: state.tiers[uid] === 'P' },
        { label: '에메랄드', value: 'E', default: state.tiers[uid] === 'E' },
        { label: '다이아', value: 'D',  default: state.tiers[uid] === 'D' },
        { label: '마스터', value: 'M',  default: state.tiers[uid] === 'M' },
        { label: '그마',   value: 'GM', default: state.tiers[uid] === 'GM' },
        { label: '챌린저', value: 'C',  default: state.tiers[uid] === 'C' },
        { label: '14~15최고티어', value: 'T1415', default: state.tiers[uid] === 'T1415' },
      );

    await i.reply({
      content: '🥨 개인 내전 설정창입니다. (대기자도 미리 설정 가능)',
      ephemeral: true,
      components: [
        new ActionRowBuilder().addComponents(mainLaneSelect),
        new ActionRowBuilder().addComponents(subLaneSelect),
        new ActionRowBuilder().addComponents(tierSelect),
      ],
    });
  };

  // --- 액션 처리 ---
  if (action === 'settings') {
    await openSettingsPanel(roomId, i.user.id); // 대기자/참가자 모두 허용
    return;
  }

  if (action === 'join') {
    // 설정 패널 열고, 목록에는 추가(대기자는 추가 안 하려면 아래 4줄 삭제)
    await openSettingsPanel(roomId, i.user.id);
    if (!state.members.includes(i.user.id)) {
      state.members.push(i.user.id);
      state.joinedAt[i.user.id] = Date.now();
      roomState.set(roomId, state);
      saveRooms();
    }
    // 필요하면 공개 메시지도 갱신
    // return updateMessage();
    return;
  }

  if (action === 'leave') {
    const uid = i.user.id;
    state.members = state.members.filter((m) => m !== uid);
    state.wait.delete(uid);
    state.last.delete(uid);
    delete state.joinedAt[uid];
    roomState.set(roomId, state);
    saveRooms();
    return updateMessage();
  }

  if (action === 'last') {
    const uid = i.user.id;
    if (!state.members.includes(uid)) {
      return i.reply({ content: '참여자만 막판 설정이 가능합니다.', ephemeral: true });
    }
    state.last.add(uid);
    state.members = state.members.filter((m) => m !== uid);
    delete state.joinedAt[uid];
    roomState.set(roomId, state);
    saveRooms();
    return updateMessage();
  }

  return i.reply({ content: '알 수 없는 요청입니다.', ephemeral: true });
}

// -------------------
// 3) 선택 메뉴 핸들러 (roomId/uid 기반, 대기자/참가자 공통)
// -------------------
if (interaction.isStringSelectMenu()) {
  const i = interaction;

  // 1) customId 파싱: 신규 "kind:roomId:userId" → 레거시 "kind_userId" 순
  let kind, roomId, ownerId;
  if (i.customId.includes(':')) {
    [kind, roomId, ownerId] = i.customId.split(':'); // e.g. "lane:1234567890:99887766"
  } else {
    const [legacyKind, legacyOwner] = i.customId.split('_');
    kind = legacyKind;
    ownerId = legacyOwner;

    // 레거시: 최근 메시지에서 방 추정 (가능하면 점차 제거 권장)
    const messages = await i.channel.messages.fetch({ limit: 30 });
    const recruitMsg = messages.find(m => m.author.id === i.client.user.id && roomState.has(m.id));
    if (!recruitMsg) return i.reply({ content: '⚠️ 내전 방을 찾을 수 없습니다.', ephemeral: true });
    roomId = recruitMsg.id;
  }

  // 2) 본인 전용 보호
  if (ownerId !== i.user.id) {
    return i.reply({ content: '❌ 이 메뉴는 당신 전용입니다.', ephemeral: true });
  }

  // 3) 방 상태 로드
  const state = roomState.get(roomId);
  if (!state) {
    return i.reply({ content: '⚠️ 세션이 만료되었어요. 새로 모집을 열어주세요.', ephemeral: true });
  }

  // 4) 값 반영
  const uid = i.user.id;
  state.lanes[uid] ??= { main: null, sub: [] };

  const vals = i.values;
  if (kind === 'lane') {
    state.lanes[uid].main = vals[0];
  } else if (kind === 'sublane') {
    state.lanes[uid].sub = vals.includes('none') ? [] : vals;
  } else if (kind === 'tier') {
    state.tiers[uid] = vals[0];
  } else {
    return i.reply({ content: '알 수 없는 선택 항목입니다.', ephemeral: true });
  }

  // 5) (옵션) 자동 참여/대기 로직 — 대기자도 미리 설정해두면 승급 시 그대로 사용
  const mainLane = state.lanes[uid]?.main;
  const subLanes = state.lanes[uid]?.sub ?? [];
  const tierVal  = state.tiers[uid];

  // Set 방어
  state.wait ??= new Set();
  state.last ??= new Set();
  state.members ??= state.members || [];

  // 모두 선택 완료 & 아직 명단/대기열에 없음
  if (mainLane && subLanes.length > 0 && tierVal &&
      !state.members.includes(uid) && !state.wait.has(uid)) {

    // 인원 제한(예: 40명) 초과 시 막기
    if (state.members.length >= 40) {
      return i.reply({ content: '❌ 인원 40명 초과, 더 이상 참여할 수 없습니다.', ephemeral: true });
    }

    // 10명 단위 분리 → 대기열
    if (state.members.length % 10 === 0 && state.members.length !== 0) {
      state.wait.add(uid);
      console.log(`⚠️ ${i.user.tag} → 대기열로 이동 (10명 단위 분리)`);
    } else {
      state.members.push(uid);
      console.log(`✅ ${i.user.tag} → 참여자 명단 추가`);
    }

    // 대기열 10명 쌓이면 단체 승급
    if (state.wait.size >= 10) {
      const promoteBatch = [...state.wait].slice(0, 10);
      for (const pid of promoteBatch) {
        state.wait.delete(pid);
        if (!state.members.includes(pid)) state.members.push(pid);
      }
      console.log(`🔼 대기자 10명 단체 승급됨: ${promoteBatch.map(id => `<@${id}>`).join(', ')}`);
    }

    state.joinedAt[uid] = Date.now();
  }

  // 6) 저장
  roomState.set(roomId, state);
  try { saveRooms && saveRooms(); } catch {}
  try { backupRooms && backupRooms(state); } catch {}

  // 7) 원본 모집 메시지 갱신 (roomId로 정확 타겟, 채널 보존)
  try {
    let channel = i.channel;
    if (state.channelId && (!channel || channel.id !== state.channelId)) {
      channel = await i.client.channels.fetch(state.channelId);
    }
    const msg = await channel.messages.fetch(roomId);
    await msg.edit({ embeds: [renderEmbed(state, state.startTime, state.isAram)] });
  } catch (e) {
    console.error('모집 메시지 갱신 실패:', e);
  }

  // 8) 개인 피드백
  return i.reply({ content: '✅ 설정이 저장되었습니다.', ephemeral: true });
}

}); // ← interactionCreate 닫기

// 로그인
client.login(token);
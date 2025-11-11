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

// ===== Common Helpers (place near the top) =====
async function safeAck(interaction) {
  try {
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate(); // ✅ 3초 내 즉시 ACK → 토큰 만료 방지
      }
    } else {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: 64 }); // ✅ 에페메랄 = flags:64
      }
    }
  } catch (e) {
    // 이미 응답된 경우 등은 무시
  }
}

// 에페메랄 안내 멘트 (reply/followUp 자동 분기)
async function replyEphemeral(interaction, content) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      return await interaction.reply({ content, flags: 64 });
    } else {
      return await interaction.followUp({ content, flags: 64 });
    }
  } catch (e) {
    // 최후 수단: DM 시도는 생략 (침묵 실패)
  }
}

// 상태 즉시 저장(옵션 백업 포함)
function persistNow(state) {
  try { typeof saveRooms === 'function' && saveRooms(); } catch (e) { console.error('saveRooms error:', e); }
  try { typeof backupRooms === 'function' && backupRooms(state); } catch (e) { /* optional */ }
}

// 닉네임+태그 로그
async function logMember(guild, userId, prefix) {
  try {
    const m = await guild.members.fetch(userId);
    console.log(`${prefix}: ${m.displayName} (${m.user.tag}) [${m.id}]`);
  } catch {
    console.log(`${prefix}: <@${userId}> [${userId}]`);
  }
}

// 전역 에러 보호(프로세스 크래시 방지)
process.on('unhandledRejection', (reason, p) => {
  console.error('🚨 UnhandledRejection at:', p, 'reason:', reason);
});

// ===== Recruit Message Auto-Recreate Helpers =====
async function safeFetchMessage(client, channelId, messageId) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.messages) return null;
    return await channel.messages.fetch(messageId);
  } catch (e) {
    if (e?.code === 10008 || e?.rawError?.code === 10008) {
      console.warn(`⚠️ 메시지 없음(10008): channel=${channelId}, message=${messageId}`);
      return null;
    }
    console.error('safeFetchMessage error:', e);
    return null;
  }
}

function buildComponentsWithRoomId(rid) {
  const r1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`join:${rid}`).setLabel('✅ 내전참여').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`leave:${rid}`).setLabel('❎ 내전취소').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`last:${rid}`).setLabel('⛔ 내전막판').setStyle(ButtonStyle.Primary),
  );
  const r2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`settings:${rid}`).setLabel('⚙️ 설정/변경').setStyle(ButtonStyle.Secondary),
  );
  return [r1, r2];
}

async function createRecruitMessage(client, state, channelId) {
  const channel = await client.channels.fetch(channelId);
  const embed = renderEmbed(state, state.startTime, state.isAram);
  const newMsg = await channel.send({ embeds: [embed], components: buildComponentsWithRoomId('pending') });
  try { await newMsg.pin(); } catch (_) {} // 핀 권한 없으면 조용히 무시
  return newMsg;
}

function migrateRoomId(oldId, newId) {
  if (oldId === newId) return;
  const val = roomState.get(oldId);
  if (!val) return;
  roomState.delete(oldId);
  roomState.set(newId, val);
  persistNow(val);
}

async function updateOrRecreateRecruit(i, roomId, state) {
  const channelId = state.channelId || i.channel?.id;
  if (!channelId) throw new Error('state.channelId 누락');

  // 1) 원본 안전 조회
  let msg = await safeFetchMessage(i.client, channelId, roomId);

  // 2) 없으면 재생성 → 키 마이그레이션 → 알림
  if (!msg) {
    const newMsg = await createRecruitMessage(i.client, state, channelId);
    const newId = newMsg.id;

    migrateRoomId(roomId, newId);

    await newMsg.edit({
      embeds: [renderEmbed(state, state.startTime, state.isAram)],
      components: buildComponentsWithRoomId(newId),
    });

    try { await replyEphemeral(i, '♻️ 내전 메시지를 복구했어요. 계속 진행 가능합니다!'); } catch {}
    return { msg: newMsg, roomId: newId, recreated: true };
  }

  // 3) 있으면 그대로 업데이트
  await msg.edit({
    embeds: [renderEmbed(state, state.startTime, state.isAram)],
    components: buildComponentsWithRoomId(roomId),
  });

  return { msg, roomId, recreated: false };
}

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

// ✅ 공용 티어 라벨
const TIER_LABELS = {
  I:'아이언', B:'브론즈', S:'실버', G:'골드',
  P:'플래티넘', E:'에메랄드', D:'다이아', M:'마스터',
  GM:'그마', C:'챌린저', T1415:'14~15최고티어'
};

// ✅ fetch 추가
const fetch = require('node-fetch');

// PATCH: 로그 강화 & 7시 이후 취소 채널 알림 ============================
const LANE_LABEL = { top:'탑', jungle:'정글', mid:'미드', adc:'원딜', support:'서폿' };
const prettyLane = (l) => LANE_LABEL[l] || '없음';
const prettyTier = (t) => TIER_LABELS?.[t] || '없음';

// 7시 이후 취소 채널 ID (고정값)
const LATE_CANCEL_CHANNEL_ID = '1428618829197479946';

function nowInKST() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
}
function isAfterKST(hour24) {
  return nowInKST().getHours() >= hour24;
}

// 참여 상세 콘솔 로그
async function logJoinDetail(guild, state, uid, prefix = '✅ 참여 확정') {
  try {
    const m = await guild.members.fetch(uid);
    const lane = state.lanes?.[uid] || { main:null, sub:[] };
    const main = prettyLane(lane.main);
    const sub  = (lane.sub?.length ? lane.sub.map(prettyLane).join(',') : '없음');
    const tier = prettyTier(state.tiers?.[uid]);
    console.log(`${prefix} ${m.displayName} → 주:${main}, 부:${sub}, 티어:${tier}`);
  } catch {
    const lane = state.lanes?.[uid] || { main:null, sub:[] };
    const main = prettyLane(lane.main);
    const sub  = (lane.sub?.length ? lane.sub.map(prettyLane).join(',') : '없음');
    const tier = prettyTier(state.tiers?.[uid]);
    console.log(`${prefix} <@${uid}> → 주:${main}, 부:${sub}, 티어:${tier}`);
  }
}

// 7시 이후 취소 채널 공지 (수정본)
async function notifyLateCancel(guild, state, uid) {
  if (!isAfterKST(19)) return; // 19시 미만이면 무시
  if (!LATE_CANCEL_CHANNEL_ID) return;

  const kstStr = new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const lane = state.lanes?.[uid] || { main:null, sub:[] };
  const main = prettyLane(lane.main);
  const sub  = (lane.sub?.length ? lane.sub.map(prettyLane).join(', ') : '없음');
  const tier = prettyTier(state.tiers?.[uid]);

  try {
    const ch = await guild.channels.fetch(LATE_CANCEL_CHANNEL_ID);
    if (!ch?.send) return;

    // 표시명은 '@닉네임' (문자열), 실제 멘션은 괄호 안에 넣어 핑 유지
    let userLine = `<@${uid}>`;
    try {
      const m = await guild.members.fetch(uid);
      userLine = `@${m.displayName} (<@${uid}>)`;
    } catch {
      userLine = `<@${uid}>`;
    }

    const msg =
      `⚠️ **7시 이후 내전 취소**\n` +
      `• 사용자: ${userLine}\n` +
      `• 시각: ${kstStr}\n` +
      `• 주/부/티어: ${main} / ${sub} / ${tier}`;

    await ch.send({ content: msg });
  } catch (e) {
    console.error('notifyLateCancel error:', e);
  }
}
// ====================================================================

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
    top: '탑', jungle: '정글', mid: '미드', adc: '원딜', support: '서폿' 
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
    return `${i + 1}. <@${String(id)}> (주: ${mainLane} / 부: ${subLane} / 티어: ${tier}) ${timeText}`;
  }).join('\n') || "(없음)";

  // 대기자 표시
  const waitText = (wait && wait.size) 
    ? [...wait].map((id, idx) => `${members.length + idx + 1}. <@${String(id)}>`).join('\n') 
    : '(없음)';

  // 막판 표시
  const lastText = last?.size
    ? [...last].map((id, idx) => `${idx + 1}. <@${String(id)}>`).join('\n')
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

// ✅ 클라이언트 생성 후
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
  const uid = interaction.user.id;
  const riotKey = (process.env.RIOT_API_KEY || '').trim();

  const rawInput =
    options.getString('라이엇닉네임') ??
    options.getString('riotnick') ??
    options.getString('riot_id');

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
  }

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

      await interaction.reply({
        content: `✅ 메인 계정이 **${officialName}** 으로 등록되었습니다!`,
        ephemeral: true
      });

      await interaction.followUp({
        content: `✅ <@${uid}> 님이 메인 계정을 **${officialName}** 으로 등록했습니다!`
      });

      return;
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

    // 2) 버튼 부착 (전역 헬퍼 사용)
    await replyMsg.edit({ components: buildComponentsWithRoomId(roomId) });

    // 3) 메시지ID -> 방 상태 저장 (+ channelId 추가)
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
      tierBand: {} // (유지) 티어구간 저장
    });
    persistNow(roomState.get(roomId));
    return;
  }

  // 운영/관리 명령어 실행 핸들러들

  // /내전시간변경
  if (commandName === '내전시간변경') {
    const newTime = options.getString('시간');
    const messages = await interaction.channel.messages.fetch({ limit: 50 });
    const recruitMsg = messages.find(m => m.author.id === interaction.client.user.id && roomState.has(m.id));
    if (!recruitMsg) return interaction.reply({ content: '⚠️ 활성 내전 메시지를 찾지 못했어요.', ephemeral: true });

    const rid = recruitMsg.id;
    const state = roomState.get(rid);
    state.startTime = newTime;
    roomState.set(rid, state);
    persistNow(state);
    try { await updateOrRecreateRecruit(interaction, rid, state); } catch (e) { console.error(e); }

    return interaction.reply({ content: `🕒 내전 시간 **${newTime}** 으로 변경`, ephemeral: true });
  }

  // /막판자삭제
  if (commandName === '막판자삭제') {
    const targetUser = options.getUser('유저');
    const messages = await interaction.channel.messages.fetch({ limit: 50 });
    const recruitMsg = messages.find(m => m.author.id === interaction.client.user.id && roomState.has(m.id));
    if (!recruitMsg) return interaction.reply({ content: '⚠️ 활성 내전 메시지를 찾지 못했어요.', ephemeral: true });

    const rid = recruitMsg.id;
    const state = roomState.get(rid);
    if (!state.last?.has(targetUser.id)) {
      return interaction.reply({ content: '⚠️ 막판 목록에 없는 유저', ephemeral: true });
    }
    state.last.delete(targetUser.id);
    roomState.set(rid, state);
    persistNow(state);
    try { await updateOrRecreateRecruit(interaction, rid, state); } catch (e) { console.error(e); }

    return interaction.reply({ content: `🧹 막판에서 <@${targetUser.id}> 제거`, ephemeral: true });
  }

  // /참여자삭제
  if (commandName === '참여자삭제') {
    const targetUser = options.getUser('유저');
    const messages = await interaction.channel.messages.fetch({ limit: 50 });
    const recruitMsg = messages.find(m => m.author.id === interaction.client.user.id && roomState.has(m.id));
    if (!recruitMsg) return interaction.reply({ content: '⚠️ 활성 내전 메시지를 찾지 못했어요.', ephemeral: true });

    const rid = recruitMsg.id;
    const state = roomState.get(rid);
    const before = (state.members?.length || 0) + (state.wait?.size || 0);

    state.members = (state.members || []).filter(id => id !== targetUser.id);
    state.wait?.delete?.(targetUser.id);
    state.last?.delete?.(targetUser.id);
    delete state.joinedAt?.[targetUser.id];

    roomState.set(rid, state);
    persistNow(state);
    try { await updateOrRecreateRecruit(interaction, rid, state); } catch (e) { console.error(e); }

    const after = (state.members?.length || 0) + (state.wait?.size || 0);
    return interaction.reply({ content: `🧹 <@${targetUser.id}> 삭제 (${before} → ${after})`, ephemeral: true });
  }

  // /딥롤방연결
  if (commandName === '딥롤방연결') {
    const matchId = options.getString('matchid');
    const roomCode = options.getString('roomcode');

    const links = await readJSONSafe(LINKS_PATH, {});
    links[matchId] = { roomCode, linkedAt: Date.now(), by: interaction.user.id };
    await writeJSONSafe(LINKS_PATH, links);

    return interaction.reply({ content: `🔗 연결 완료: matchId=${matchId} ↔ roomCode=${roomCode}`, ephemeral: true });
  }

} // ← isChatInputCommand 끝

// -------------------
// 2) 버튼 핸들러 (roomId+uid 안전판)
// -------------------
if (interaction.isButton()) {
  const i = interaction;
  await safeAck(i); // ✅ 항상 먼저 ACK

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
      return replyEphemeral(i, '알 수 없는 요청입니다.');
    }
  }

  // 상태 없으면 초기화(+ channelId 저장) 후 즉시 저장
  if (!roomState.has(roomId)) {
    roomState.set(roomId, {
      members: [], lanes: {}, tiers: {}, last: new Set(), wait: new Set(),
      joinedAt: {}, startTime: undefined, isAram: false,
      channelId: i.message.channelId,
      tierBand: {} // (유지) 티어구간 저장
    });
    persistNow(roomState.get(roomId)); // ✅ state 인자 넘김
  }
  const state = roomState.get(roomId);

  // 공용 업데이트 함수(자동 재생성 포함)
  const updateMessage = async () => {
    const res = await updateOrRecreateRecruit(i, roomId, state);
    roomId = res.roomId; // 재생성되면 최신 roomId로 갱신
  };

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
      .setPlaceholder('14~15최고티어')
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

    // 티어구간 셀렉트 (8 옵션: 1/2/3/4/0~299/300~599/600~799/800)
    const tierBandSelect = new StringSelectMenuBuilder()
      .setCustomId(`tierband:${rid}:${uid}`)
      .setPlaceholder('티어구간 선택')
      .setMinValues(1).setMaxValues(1)
      .addOptions(
        { label: '1',       value: '1',       default: state.tierBand?.[uid] === '1' },
        { label: '2',       value: '2',       default: state.tierBand?.[uid] === '2' },
        { label: '3',       value: '3',       default: state.tierBand?.[uid] === '3' },
        { label: '4',       value: '4',       default: state.tierBand?.[uid] === '4' },
        { label: '0~299',   value: '0-299',   default: state.tierBand?.[uid] === '0-299' },
        { label: '300~599', value: '300-599', default: state.tierBand?.[uid] === '300-599' },
        { label: '600~799', value: '600-799', default: state.tierBand?.[uid] === '600-799' },
        { label: '800',     value: '800',     default: state.tierBand?.[uid] === '800' },
      );

    await i.followUp({
      content: '🥨 개인 내전 설정창입니다. (대기자도 미리 설정 가능)',
      flags: 64,
      components: [
        new ActionRowBuilder().addComponents(mainLaneSelect),
        new ActionRowBuilder().addComponents(subLaneSelect),
        new ActionRowBuilder().addComponents(tierSelect),
        new ActionRowBuilder().addComponents(tierBandSelect),
      ],
    });
  };

  // --- 액션 처리 ---
  if (action === 'settings') {
    await openSettingsPanel(roomId, i.user.id);
    return;
  }

  if (action === 'join') {
    await openSettingsPanel(roomId, i.user.id);

    if (!state.members.includes(i.user.id)) {
      state.members.push(i.user.id);
      state.joinedAt[i.user.id] = Date.now();
      roomState.set(roomId, state);
      persistNow(state);
      await logMember(i.guild, i.user.id, '✅ 내전참여');
      // PATCH: 상세 참여 로그
      await logJoinDetail(i.guild, state, i.user.id, '✅ 참여 확정');
    }
    return;
  }

  if (action === 'leave') {
    const uid = i.user.id;
    state.members = state.members.filter((m) => m !== uid);
    state.wait.delete(uid);
    state.last.delete(uid);
    delete state.joinedAt[uid];
    roomState.set(roomId, state);
    persistNow(state);

    await logMember(i.guild, uid, '❎ 내전취소');
    // PATCH: 7시 이후 전용 채널 알림
    await notifyLateCancel(i.guild, state, uid, roomId);

    return updateMessage();
  }

  if (action === 'last') {
    const uid = i.user.id;
    if (!state.members.includes(uid)) {
      return replyEphemeral(i, '참여자만 막판 설정이 가능합니다.');
    }
    state.last.add(uid);
    state.members = state.members.filter((m) => m !== uid);
    delete state.joinedAt[uid];
    roomState.set(roomId, state);
    persistNow(state);
    await logMember(i.guild, uid, '⛔ 막판선언');
    return updateMessage();
  }

  return replyEphemeral(i, '알 수 없는 요청입니다.');
}

// -------------------
// 3) 선택 메뉴 핸들러 (roomId/uid 기반, 대기자/참가자 공통)
// -------------------
if (interaction.isStringSelectMenu()) {
  const i = interaction;
  await safeAck(i); // ✅ 항상 먼저 ACK

  // 1) customId 파싱: 신규 "kind:roomId:userId" → 레거시 "kind_userId" 순
  let kind, roomId, ownerId;
  if (i.customId.includes(':')) {
    [kind, roomId, ownerId] = i.customId.split(':'); // e.g. "lane:1234567890:99887766"
  } else {
    const [legacyKind, legacyOwner] = i.customId.split('_');
    kind = legacyKind;
    ownerId = legacyOwner;

    const messages = await i.channel.messages.fetch({ limit: 30 });
    const recruitMsg = messages.find(m => m.author.id === i.client.user.id && roomState.has(m.id));
    if (!recruitMsg) return replyEphemeral(i, '⚠️ 내전 방을 찾을 수 없습니다.');
    roomId = recruitMsg.id;
  }

  // 2) 본인 전용 보호
  if (ownerId !== i.user.id) {
    return replyEphemeral(i, '❌ 이 메뉴는 당신 전용입니다.');
  }

  // 3) 방 상태 로드
  const state = roomState.get(roomId);
  if (!state) {
    return replyEphemeral(i, '⚠️ 세션이 만료되었어요. 새로 모집을 열어주세요.');
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
  } else if (kind === 'tierband') {
    state.tierBand ??= {};
    state.tierBand[uid] = vals[0];
  } else {
    return replyEphemeral(i, '알 수 없는 선택 항목입니다.');
  }

  // 5) (옵션) 자동 참여/대기 로직
  const mainLane = state.lanes[uid]?.main;
  const subLanes = state.lanes[uid]?.sub ?? [];
  const tierVal  = state.tiers[uid];

  state.wait ??= new Set();
  state.last ??= new Set();
  state.members ??= state.members || [];

  if (mainLane && subLanes.length > 0 && tierVal &&
      !state.members.includes(uid) && !state.wait.has(uid)) {

    if (state.members.length >= 40) {
      return replyEphemeral(i, '❌ 인원 40명 초과, 더 이상 참여할 수 없습니다.');
    }

    if (state.members.length % 10 === 0 && state.members.length !== 0) {
      state.wait.add(uid);
      console.log(`⚠️ ${ (await i.guild.members.fetch(uid)).displayName } → 대기열로 이동 (10명 단위 분리)`);
    } else {
      state.members.push(uid);
      console.log(`✅ ${i.user.tag} → 참여자 명단 추가`);
      // PATCH: 상세 참여 로그
      await logJoinDetail(i.guild, state, uid, '✅ 설정완료/명단반영');
    }

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
  persistNow(state);

  // 7) 원본 모집 메시지 갱신 (자동 재생성 포함)
  try {
    const res = await updateOrRecreateRecruit(i, roomId, state);
    roomId = res.roomId;
  } catch (e) {
    console.error('모집 메시지 갱신 실패:', e);
  }

  // 8) 개인 피드백 (에페메랄)
  await replyEphemeral(i, '✅ 설정이 저장되었습니다.');
}

}); // ← interactionCreate 닫기

// ✅ 자동 내전 포스트 등록 (매일 오후 1시 00분, KST)
const cron = require("node-cron");
const moment = require("moment-timezone");

cron.schedule(
  "00 13 * * *", // 매일 13:00 (한국시간)
  async () => {
    try {
      const channel = await client.channels.fetch("1435841830175506442"); // 포럼 채널 ID
      if (!channel) {
        console.error("⚠️ 내전포스트 채널을 찾을 수 없습니다.");
        return;
      }

      const roleId = "1412018162723061771"; // @내전알림 역할
      const now = moment().tz("Asia/Seoul");

      // ✅ 요일 배열 (moment().day()는 0=일요일, 6=토요일)
      const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
      const weekday = weekdays[now.day()];

      // ✅ 제목 포맷: ❤ 11-06 (목) 21시:00분 협곡내전 ❤
      const date = now.format("MM-DD");
      const title = `❤ ${date} (${weekday}) 21시:00분 협곡내전 ❤`;

      // ✅ 포럼 채널용 thread 생성 방식
      await channel.threads.create({
        name: title,
        message: {
          content: `
<@&${roleId}>  
[𝙡𝙤𝙡𝙫𝙚𝙡𝙮] 협곡내전 모집 안내입니다 💫  

🕐 **내전 시작시간** : 21시00분  
📋 **참여 양식 예시:**  
닉네임#태그 / 주라인 / 부라인 / 14~15 시즌 최고티어 / 팀장 희망 여부  

✅ 순번 없이 작성

✅ 본인 티어 숫자까지 표기

✅ 내전 시작 10분 전까지 디스코드 입장

✅ 내전 시작 시간 2시간 전까지만 경고 없이 참여 취소 가능
   예시 : 9시 시작 내전은 7시까지만 가능 (7시 1분부터 경고 처리)

✅인원에 따른 진행방식 ‘내전규칙’ 채널 참고.
      내전 진행자가 없거나, 팀장 희망자가 모자라면 10명씩 나눠서 진행할 수 있습니다.

✅내전 인게임 전체 채팅 및 감정표현 관련 [내전규칙 9번] 참고해주세요.

✅내전 이름 뺄 때 규칙 디스코드 [내전규칙] 채널 참고해주세요.

✅ 위 규칙들이 제대로 이루어지지 않았을 때에는 경고. 충분히 숙지하고 참여해주시길 바랍니다.


ex) 람머스기여어 #KR1 / 정글 / 미드 / M204 / 팀장 희망  

👥 최소 10인 ~ 최대 40인 모집  

_자동 등록 시각: ${now.format("YYYY-MM-DD HH:mm")}_  
          `.trim(),
        },
      });

      console.log(`✅ ${now.format("YYYY-MM-DD HH:mm")} - 내전 포스트 자동 등록 완료`);
    } catch (err) {
      console.error("⚠️ 내전 포스트 자동 등록 중 오류:", err);
    }
  },
  { scheduled: true, timezone: "Asia/Seoul" }
);


// 로그인
client.login(token);
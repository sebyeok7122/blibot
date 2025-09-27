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

// ✅ fetch 추가
const fetch = require('node-fetch');

// ✅ 태그라인 → 플랫폼 라우팅 매핑 (third-party-code는 플랫폼 도메인 사용)
const TAGLINE_TO_PLATFORM = {
  KR1: 'kr',     JP1: 'jp1',   NA1: 'na1',  EUW1: 'euw1', EUN1: 'eun1',
  TR1: 'tr1',    RU: 'ru',     OC1: 'oc1',  BR1: 'br1',   LA1: 'la1', LA2: 'la2',
  PBE1: 'pbe1'
};

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

// ✅ accounts.json 불러오기/저장
async function loadAccounts() {
  return await readJSONSafe(accountPath, {});
}
async function saveAccounts(accounts) {
  await writeJSONSafe(accountPath, accounts);
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
    .setName('내전시간변경')
    .setDescription('현재 내전 시간을 수정합니다 (운영진/관리자/도우미 전용)')
    .addStringOption(o =>
      o.setName('시간')
        .setDescription('내전 시작 시간을 수정할 새로운 시간')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('딥롤방연결')
    .setDescription('내전 matchId에 딥롤 방 코드(roomCode) 연결')
    .addStringOption(o => o.setName('matchid').setDescription('내전 matchId').setRequired(true))
    .addStringOption(o => o.setName('roomcode').setDescription('딥롤 방 코드').setRequired(true)),

  // ✅ 추가
  new SlashCommandBuilder()
    .setName('막판자삭제')
    .setDescription('막판 명단에서 특정 유저를 삭제합니다 (운영진/도우미만 가능)')
    .addUserOption(o => o.setName('유저').setDescription('삭제할 유저').setRequired(true)),

  // ✅ 추가
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

  const laneMap = { top: '탑', jungle: '정글', mid: '미드', adc: '원딜', support: '서폿' };
  const tierMap = { 
    I: '아이언', B: '브론즈', S: '실버', G: '골드',
    P: '플래티넘', E: '에메랄드', D: '다이아',
    M: '마스터', GM: '그마', C: '챌린저', T1415: '14~15최고티어'
  };

  let membersText = (members || []).slice(0, 40).map((m, i) => {
    const userId = typeof m === "string" ? m : m.id;
    const laneInfo = lanes?.[userId] || { main: null, sub: [] };
    const mainLane = laneInfo.main ? laneMap[laneInfo.main] : '없음';
    const subLane  = laneInfo.sub?.length ? laneInfo.sub.map(v => laneMap[v]).join(', ') : '없음';
    const tier     = tierMap[tiers?.[userId]] || '없음';
    const timeText = joinedAt?.[userId] ? formatKST(joinedAt[userId]) : '';

    return `${i + 1}. <@${userId}> (주: ${mainLane} / 부: ${subLane} / 티어: ${tier}) ${timeText}`;
  }).join('\n') || "(없음)";

  const waitText = (wait && wait.size) 
    ? [...wait].map((id, idx) => `${members.length + idx + 1}. <@${id}>`).join('\n') 
    : '(없음)';

  if ((members || []).length > 40) {
    membersText += `\n\n⚠️ 참여자 수가 40명을 초과하여 **더이상 참여하실 수 없습니다.**\n새 시트를 이용해 주세요.`;
  }

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

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const { commandName, options, user } = interaction;
    const userId = user.id;

    // ✅ 막판자삭제
    if (commandName === '막판자삭제') {
      const allowedRoles = ['689438958140260361', '1415895023102197830'];
      if (!interaction.member.roles.cache.some(r => allowedRoles.includes(r.id))) {
        return interaction.reply({ content: '⚠️ 권한이 없습니다.', ephemeral: true });
      }

      const target = options.getUser('유저');
      if (!target) return interaction.reply({ content: '❌ 유저를 지정해주세요.', ephemeral: true });

      const messages = await interaction.channel.messages.fetch({ limit: 30 });
      const recruitMsg = messages.find(m => m.author.id === interaction.client.user.id && roomState.has(m.id));
      if (!recruitMsg) return interaction.reply({ content: '⚠️ 내전 방을 찾을 수 없습니다.', ephemeral: true });

      const state = roomState.get(recruitMsg.id);
      if (state.last.has(target.id)) {
        state.last.delete(target.id);
        saveRooms();
        backupRooms(state);
        await recruitMsg.edit({ embeds: [renderEmbed(state, state.startTime, state.isAram)] });

        console.log(`🗑️ 막판자삭제: ${target.tag} (${target.id})`); // ✅ 로그 추가
        return interaction.reply(`✅ <@${target.id}> 님을 막판 명단에서 삭제했습니다.`);
      } else {
        return interaction.reply({ content: '⚠️ 해당 유저는 막판 명단에 없습니다.', ephemeral: true });
      }
    }

    // ✅ 참여자삭제
    if (commandName === '참여자삭제') {
      const allowedRoles = ['689438958140260361', '1415895023102197830'];
      if (!interaction.member.roles.cache.some(r => allowedRoles.includes(r.id))) {
        return interaction.reply({ content: '⚠️ 권한이 없습니다.', ephemeral: true });
      }

      const target = options.getUser('유저');
      if (!target) return interaction.reply({ content: '❌ 유저를 지정해주세요.', ephemeral: true });

      const messages = await interaction.channel.messages.fetch({ limit: 30 });
      const recruitMsg = messages.find(m => m.author.id === interaction.client.user.id && roomState.has(m.id));
      if (!recruitMsg) return interaction.reply({ content: '⚠️ 내전 방을 찾을 수 없습니다.', ephemeral: true });

      const state = roomState.get(recruitMsg.id);

      let removed = false;
      if (state.members.includes(target.id)) {
        state.members = state.members.filter(m => m !== target.id);
        removed = true;
      } else if (state.wait.has(target.id)) {
        state.wait.delete(target.id);
        removed = true;
      }

      if (removed) {
        saveRooms();
        backupRooms(state);
        await recruitMsg.edit({ embeds: [renderEmbed(state, state.startTime, state.isAram)] });

        console.log(`🗑️ 참여자삭제: ${target.tag} (${target.id})`); // ✅ 로그 추가
        return interaction.reply(`✅ <@${target.id}> 님을 참여자/대기자 명단에서 삭제했습니다.`);
      } else {
        return interaction.reply({ content: '⚠️ 해당 유저는 참여자/대기자 명단에 없습니다.', ephemeral: true });
      }
    }
  }
  // -------------------
  // 2) 버튼 핸들러
  // -------------------
  if (interaction.isButton()) {
    const { customId, user, message } = interaction;
    const key = message.id;
    if (!roomState.has(key)) {
      roomState.set(key, { members: [], lanes: {}, tiers: {}, last: new Set(), wait: new Set(), joinedAt: {} });
    }
    const state = roomState.get(key);

    const updateMessage = () =>
      interaction.update({ embeds: [renderEmbed(state, state.startTime, state.isAram)], components: message.components });

    // ✅ 내전참여
    if (customId === 'join_game') {
      await interaction.deferReply({ ephemeral: true });

      const mainLaneSelect = new StringSelectMenuBuilder()
        .setCustomId(`lane_${user.id}`)
        .setPlaceholder('주라인 선택')
        .addOptions(
          { label: '탑', value: 'top' },
          { label: '정글', value: 'jungle' },
          { label: '미드', value: 'mid' },
          { label: '원딜', value: 'adc' },
          { label: '서폿', value: 'support' },
        );

      const subLaneSelect = new StringSelectMenuBuilder()
        .setCustomId(`sublane_${user.id}`)
        .setPlaceholder('부라인 선택 (여러 개 가능)')
        .setMinValues(1)
        .setMaxValues(5)
        .addOptions(
          { label: '없음', value: 'none' },
          { label: '탑', value: 'top' },
          { label: '정글', value: 'jungle' },
          { label: '미드', value: 'mid' },
          { label: '원딜', value: 'adc' },
          { label: '서폿', value: 'support' },
        );

      const tierSelect = new StringSelectMenuBuilder()
        .setCustomId(`tier_${user.id}`)
        .setPlaceholder('14~15최고티어')
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
          { label: '14~15최고티어', value: 'T1415' },
        );

      const confirmButton = new ButtonBuilder()
        .setCustomId(`confirm_join_${user.id}`)
        .setLabel('✅ 확인')
        .setStyle(ButtonStyle.Success);

      await interaction.editReply({
        content: '🌸 내전에 참여하시려면 **주 라인 · 부 라인 · 티어**를 꼭 선택해 주세요!',
        components: [
          new ActionRowBuilder().addComponents(mainLaneSelect),
          new ActionRowBuilder().addComponents(subLaneSelect),
          new ActionRowBuilder().addComponents(tierSelect),
          new ActionRowBuilder().addComponents(confirmButton),
        ],
        ephemeral: true,
      });

      console.log(`✅ join_game 버튼 클릭: ${user.tag} (${user.id})`); // ✅ 로그
      return;
    }

    // ❎ 내전취소
    if (customId === 'leave_game') {
      state.members = state.members.filter(m => m !== user.id);
      state.wait.delete(user.id);
      state.last.delete(user.id);

      saveRooms();
      backupRooms(state);

      console.log(`❎ leave_game 버튼 클릭: ${user.tag} (${user.id})`); // ✅ 로그
      return updateMessage();
    }

    // ⛔ 내전막판
    if (customId === 'last_call') {
      if (state.members.includes(user.id)) {
        state.last.add(user.id);
        state.members = state.members.filter(m => m !== user.id);
      }
      saveRooms();
      backupRooms(state);

      console.log(`⛔ last_call 버튼 클릭: ${user.tag} (${user.id})`); // ✅ 로그
      return updateMessage();
    }
  }

  // -------------------
  // 3) 선택 메뉴 핸들러
  // -------------------
  if (interaction.isStringSelectMenu()) {
    const { customId, values, user } = interaction;
    const [type, ownerId] = customId.split('_');
    if (ownerId !== user.id) {
      return interaction.reply({ content: '❌ 이 메뉴는 당신 전용입니다.', ephemeral: true });
    }

    const messages = await interaction.channel.messages.fetch({ limit: 30 });
    const recruitMsg = messages.find(m => m.author.id === interaction.client.user.id && roomState.has(m.id));
    if (!recruitMsg) {
      return interaction.reply({ content: '⚠️ 내전 방을 찾을 수 없습니다.', ephemeral: true });
    }

    const state = roomState.get(recruitMsg.id);
    state.lanes[user.id] = state.lanes[user.id] || { main: null, sub: [] };

    if (type === 'lane') state.lanes[user.id].main = values[0];
    else if (type === 'sublane') state.lanes[user.id].sub = values[0] === 'none' ? [] : values;
    else if (type === 'tier') state.tiers[user.id] = values[0];

    saveRooms();
    backupRooms(state);

    console.log(`🎛️ 선택메뉴 갱신: ${user.tag} (${user.id}) → ${type}: ${values}`); // ✅ 로그
    await interaction.deferUpdate();
  }
});

// 로그인
client.login(token);
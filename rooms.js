// rooms.js (강화본)
const fs = require('fs');
const path = require('path');

const DATA_DIR   = process.env.ROOMS_DIR || '/data';   // 영속 볼륨 권장
const ROOMS_PATH = path.join(DATA_DIR, 'rooms.json');

let roomState = new Map();

// --- Set 전용 직렬화/복원 ---
const replacer = (_, v) => (v instanceof Set ? { __set: true, v: [...v] } : v);
const reviver  = (_, v) => (v && v.__set ? new Set(v.v) : v);

function ensureDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
}

// 🔧 저장 직전: state → 안전한 평문 구조로 정규화(모든 ID/키 문자열화)
function normalizeStateForSave(state = {}) {
  const toStr = (x) => (x == null ? '' : String(x));

  const lanes = Object.fromEntries(
    Object.entries(state.lanes || {}).map(([k, v]) => [toStr(k), v])
  );
  const tiers = Object.fromEntries(
    Object.entries(state.tiers || {}).map(([k, v]) => [toStr(k), toStr(v)])
  );
  const joinedAt = Object.fromEntries(
    Object.entries(state.joinedAt || {}).map(([k, v]) => [toStr(k), v])
  );
  const tierBand = Object.fromEntries(
    Object.entries(state.tierBand || {}).map(([k, v]) => [toStr(k), toStr(v)])
  );

  return {
    members: (state.members || []).map(toStr),
    lanes,
    tiers,
    last: new Set([...(state.last || [])].map(toStr)),   // Set은 replacer가 처리
    wait: new Set([...(state.wait || [])].map(toStr)),
    joinedAt,
    startTime: state.startTime,
    isAram: !!state.isAram,
    channelId: toStr(state.channelId),
    tierBand
  };
}

// 🔧 로드 직후: 타입/키 보정(문자열 강제)
function normalizeStateAfterLoad(state = {}) {
  const toStr = (x) => (x == null ? '' : String(x));
  const fixObjKeys = (obj = {}) =>
    Object.fromEntries(Object.entries(obj).map(([k, v]) => [toStr(k), v]));

  return {
    members: (state.members || []).map(toStr),
    lanes: fixObjKeys(state.lanes),
    tiers: Object.fromEntries(
      Object.entries(state.tiers || {}).map(([k, v]) => [toStr(k), toStr(v)])
    ),
    last: state.last instanceof Set ? new Set([...state.last].map(toStr))
         : new Set((state.last || []).map(toStr)),
    wait: state.wait instanceof Set ? new Set([...state.wait].map(toStr))
         : new Set((state.wait || []).map(toStr)),
    joinedAt: Object.fromEntries(
      Object.entries(state.joinedAt || {}).map(([k, v]) => [toStr(k), v])
    ),
    startTime: state.startTime,
    isAram: !!state.isAram,
    channelId: toStr(state.channelId),
    tierBand: Object.fromEntries(
      Object.entries(state.tierBand || {}).map(([k, v]) => [toStr(k), toStr(v)])
    ),
  };
}

function saveRooms() {
  try {
    ensureDir();
    // Map -> 배열, 키/내부 ID 모두 문자열화
    const plain = [...roomState].map(([k, v]) => [String(k), normalizeStateForSave(v)]);
    const json = JSON.stringify(plain, replacer, 2);

    // 원자적 저장
    fs.writeFileSync(ROOMS_PATH + '.tmp', json);
    fs.renameSync(ROOMS_PATH + '.tmp', ROOMS_PATH);
  } catch (e) {
    console.error('rooms 저장 실패:', e);
  }
}

function loadRooms() {
  try {
    ensureDir();
    if (!fs.existsSync(ROOMS_PATH)) {
      console.warn('⚠️ rooms.json이 없음. 새 상태로 시작합니다.');
      roomState = new Map();
      return;
    }
    const raw = fs.readFileSync(ROOMS_PATH, 'utf8');
    const parsed = JSON.parse(raw, reviver); // Set 복원

    // ✅ `{}` 등 비정상 포맷도 안전 처리
    const arr = Array.isArray(parsed) ? parsed : [];

    // 키 문자열화 + state 구조 보정
    roomState = new Map(arr.map(([k, v]) => [String(k), normalizeStateAfterLoad(v)]));

    console.log(`✅ roomState 복원 완료: ${roomState.size}개 (경로: ${ROOMS_PATH})`);
  } catch (e) {
    console.error('rooms 복원 실패:', e);
    roomState = new Map();
  }
}

module.exports = { roomState, saveRooms, loadRooms, ROOMS_PATH };

const fs = require('fs');
const path = require('path');

// rooms.json 데이터를 백업하는 함수
async function backupRooms(data) {
  try {
    const filePath = path.join(__dirname, 'backups', `rooms_${Date.now()}.json`);
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
    console.log('✅ rooms.json 백업 완료:', filePath);
  } catch (err) {
    console.error('❌ rooms.json 백업 실패:', err);
  }
}

module.exports = backupRooms;
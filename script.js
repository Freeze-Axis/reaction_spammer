const API_BASE = 'https://discord.com/api/v10';
let isRunning = false;

// ローカルストレージキー
const STORAGE_PREFIX = 'reactionSpammer_';
const STORAGE_KEYS = {
  token: 'token',
  guildId: 'guildId',
  emoji: 'emoji',
  useExternalEmojis: 'useExternalEmojis',
  messageLimit: 'messageLimit',
  reverseOrder: 'reverseOrder',
  interval: 'interval',
  channels: 'channels'
};

// Nitro 用に固定しておく絵文字リスト（ユーザー入力不要）
// `flash_1` ～ `flash_20` の ID で定義。Discord API には "name:id" の形式で渡す。
// Nitro が有効なときはこの配列の全てを各メッセージに順番に付与する。
const NITRO_EMOJIS = [
  'flash_1:1479134992129982616',
  'flash_2:1479134994902417611',
  'flash_3:1479134997997944973',
  'flash_4:1479135000275456207',
  'flash_5:1479135003765112982',
  'flash_6:1479135005535113427',
  'flash_7:1479135008672186510',
  'flash_8:1479135011213938954',
  'flash_9:1479135012992323646',
  'flash_10:1479135015311769693',
  'flash_11:1479135017132228629',
  'flash_12:1479135020332617738',
  'flash_13:1479135022895206571',
  'flash_14:1479135025092890658',
  'flash_15:1479135027420729354',
  'flash_16:1479135030013067347',
  'flash_17:1479135032164745286',
  'flash_18:1479135035046236282',
  'flash_19:1479135037277343784',
  'flash_20:1479135039269900369'
];

// Nitroオフ時に使用する固定絵文字セット（画像の順）
const DEFAULT_EMOJIS = [
  '🪞', // 鏡
  '🫃', // 妊夫（男性）
  '👈🏿', // 左矢印
  '🫵', // 指を指す
  '😂', // 爆笑
];

// ページ読み込み時に保存済み値を復元
function loadSavedData() {
  document.getElementById('token').value = localStorage.getItem(STORAGE_PREFIX + STORAGE_KEYS.token) || '';
  document.getElementById('guildId').value = localStorage.getItem(STORAGE_PREFIX + STORAGE_KEYS.guildId) || '';
  
  const messageLimit = localStorage.getItem(STORAGE_PREFIX + STORAGE_KEYS.messageLimit);
  if (messageLimit) document.getElementById('messageLimit').value = messageLimit;
  
  const reverseOrder = localStorage.getItem(STORAGE_PREFIX + STORAGE_KEYS.reverseOrder);
  if (reverseOrder === 'true') document.getElementById('reverseOrder').checked = true;
  
  const useExternalEmojis = localStorage.getItem(STORAGE_PREFIX + STORAGE_KEYS.useExternalEmojis);
  if (useExternalEmojis === 'true') document.getElementById('useExternalEmojis').checked = true;
  
  const interval = localStorage.getItem(STORAGE_PREFIX + STORAGE_KEYS.interval);
  if (interval) document.getElementById('interval').value = interval;
}

// 入力値を保存
function saveInputData() {
  localStorage.setItem(STORAGE_PREFIX + STORAGE_KEYS.token, document.getElementById('token').value);
  localStorage.setItem(STORAGE_PREFIX + STORAGE_KEYS.guildId, document.getElementById('guildId').value);
  localStorage.setItem(STORAGE_PREFIX + STORAGE_KEYS.useExternalEmojis, document.getElementById('useExternalEmojis').checked);
  localStorage.setItem(STORAGE_PREFIX + STORAGE_KEYS.messageLimit, document.getElementById('messageLimit').value);
  localStorage.setItem(STORAGE_PREFIX + STORAGE_KEYS.reverseOrder, document.getElementById('reverseOrder').checked);
  localStorage.setItem(STORAGE_PREFIX + STORAGE_KEYS.interval, document.getElementById('interval').value);
}

// 入力フィールドの変更を監視
function updateEmojiInputState() {
  // emoji inputがないので何もしない
}

// 選択中のチャンネルを保存（テキスト・ボイス問わずチェックされたもの）
function saveSelectedChannels() {
  const selected = Array.from(
    document.querySelectorAll('#channelListContainer input[type="checkbox"]:checked')
  ).map(el => el.value);
  
  localStorage.setItem(STORAGE_PREFIX + STORAGE_KEYS.channels, JSON.stringify(selected));
}

// 保存済みチャンネルを復元
function restoreSelectedChannels() {
  const savedChannels = localStorage.getItem(STORAGE_PREFIX + STORAGE_KEYS.channels);
  if (!savedChannels) return;
  
  const channelIds = JSON.parse(savedChannels);
  channelIds.forEach(id => {
    const checkbox = document.querySelector(`#channelListContainer input[value="${id}"]`);
    if (checkbox) {
      checkbox.checked = true;
      const label = checkbox.closest('label');
      if (label) {
        label.classList.add('checked');
      }
    }
  });
}

// ログ出力（level: 'info', 'error', 'warning', 'success'）
function log(message, level = 'info') {
  const logEl = document.getElementById('log');
  const now = new Date();
  const timestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  // URLを検出してリンク化
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const formattedMessage = message.replace(urlRegex, '<a href="$1" target="_blank" class="log-link">$1</a>');
  
  const logLine = document.createElement('div');
  logLine.className = `log-line log-${level}`;
  logLine.innerHTML = `<span class="log-timestamp">[${timestamp}]</span>&nbsp;&nbsp;<span class="log-message">${formattedMessage}</span>`;
  logEl.appendChild(logLine);
  logEl.scrollTop = logEl.scrollHeight;
}

// ユーザーのNitro状態を確認
async function checkNitroStatus(token) {
  try {
    const response = await fetch(`${API_BASE}/users/@me`, {
      headers: { Authorization: token }
    });
    
    if (!response.ok) {
      throw new Error('ユーザー情報取得失敗');
    }
    
    const user = await response.json();
    // premium_type: 0 = なし, 1 = Nitro Classic, 2 = Nitro
    return user.premium_type > 0;
  } catch (error) {
    log(`Nitro確認エラー: ${error.message}`);
    return false;
  }
}

// TOKEN表示/隠すトグル
document.getElementById('toggleTokenBtn').addEventListener('click', function() {
  const t = document.getElementById('token');
  const icon = document.getElementById('tokenMaskIcon');
  if (t.type === 'password') {
    t.type = 'text';
    icon.innerHTML = '<svg id="icon-eye-off" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.06 10.06 0 0 1 12 20c-6 0-10-8-10-8a18.4 18.4 0 0 1 5.06-5.94"/><path d="M1 1l22 22"/><path d="M9.53 9.53A3 3 0 0 0 12 15a3 3 0 0 0 2.47-5.47"/><path d="M12 4c6 0 10 8 10 8a18.4 18.4 0 0 1-5.06 5.94"/></svg>';
  } else {
    t.type = 'password';
    icon.innerHTML = '<svg id="icon-eye" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/></svg>';
  }
});

document.getElementById('token').addEventListener('input', saveInputData);
document.getElementById('guildId').addEventListener('input', saveInputData);
document.getElementById('useExternalEmojis').addEventListener('change', () => {
  saveInputData();
  updateEmojiInputState();
});
document.getElementById('messageLimit').addEventListener('input', saveInputData);
document.getElementById('reverseOrder').addEventListener('change', saveInputData);
document.getElementById('interval').addEventListener('input', saveInputData);

// ページロード時にも状態を反映
window.addEventListener('DOMContentLoaded', () => {
  loadSavedData();
  updateEmojiInputState();
});

// チャンネルリスト取得
document.getElementById('fetchChannelsBtn').addEventListener('click', async () => {
  const token = document.getElementById('token').value.trim();
  const guildId = document.getElementById('guildId').value.trim();
  
  if (!token || !guildId) {
    alert('トークンとサーバーIDを入力してください');
    return;
  }
  
  try {
    log('チャンネル一覧取得中...', 'info');
    const response = await fetch(`${API_BASE}/guilds/${guildId}/channels`, {
      headers: { Authorization: token }
    });
    
    if (!response.ok) {
      throw new Error(`エラー: ${response.status} ${response.statusText}`);
    }
    
    const channels = await response.json();
    // 表示対象チャンネル（テキスト・ボイス・アナウンス）
    const displayChannels = channels.filter(ch => ch.type === 0 || ch.type === 2 || ch.type === 5);
    
    if (displayChannels.length === 0) {
      log('表示するチャンネルが見つかりません', 'warning');
      document.getElementById('channelListContainer').style.display = 'none';
      return;
    }
    
    // チャンネルリストを表示（Discord 左バー順）
    const container = document.getElementById('channelListContainer');
    container.innerHTML = '';

    
    // カテゴリ情報を取得
    const categoryMap = {};
    channels.forEach(ch => {
      if (ch.type === 4) {
        categoryMap[ch.id] = { name: ch.name, position: ch.position };
      }
    });
    
    // カテゴリごとにチャンネルをグループ化
    const categorized = {};
    displayChannels.forEach(ch => {
      const catId = ch.parent_id || 'uncategorized';
      if (!categorized[catId]) {
        categorized[catId] = [];
      }
      categorized[catId].push(ch);
    });
    
    // カテゴリをpositionでソート
    const categoryOrder = Object.keys(categorized).sort((a, b) => {
      const posA = a === 'uncategorized' ? -1 : (categoryMap[a]?.position ?? 999);
      const posB = b === 'uncategorized' ? -1 : (categoryMap[b]?.position ?? 999);
      return posA - posB;
    });
    
    // カテゴリごとに表示
    categoryOrder.forEach(catId => {
      // カテゴリ名表示
      let categoryName = 'その他';
      if (catId !== 'uncategorized') {
        categoryName = categoryMap[catId]?.name || 'その他';
      }
      const catDiv = document.createElement('div');
      catDiv.className = 'channel-category';
      catDiv.textContent = categoryName;
      container.appendChild(catDiv);
      
      // カテゴリ内のチャンネルをタイプ別に分ける（テキスト優先）
      const textChannelsInCat = categorized[catId].filter(ch => ch.type === 0 || ch.type === 5).sort((a, b) => a.position - b.position);
      const voiceChannelsInCat = categorized[catId].filter(ch => ch.type === 2).sort((a, b) => a.position - b.position);
      
      // テキスト/アナウンスチャンネルを先に表示
      textChannelsInCat.forEach(ch => {
        const item = document.createElement('div');
        item.className = 'channel-item custom-checkbox-item';
        item.innerHTML = `
          <label>
            <input type="checkbox" value="${ch.id}" data-channel="${ch.name}">
            <span>#${ch.name}</span>
          </label>
        `;
        container.appendChild(item);
      });
      
      // ボイスチャンネルを後に表示（チェックボックス付き）
      voiceChannelsInCat.forEach(ch => {
        const item = document.createElement('div');
        item.className = 'voice-channel-item custom-checkbox-item';
        item.innerHTML = `
          <label>
            <input type="checkbox" value="${ch.id}" data-channel="${ch.name}">
            <span class="voice-channel-icon">🔊</span><span>${ch.name}</span>
          </label>
        `;
        container.appendChild(item);
      });
    });
    
    // テキストチャンネルのチェックボックス変更時に保存
    document.querySelectorAll('#channelListContainer input[type="checkbox"]').forEach(checkbox => {
      // 初期状態を設定
      const label = checkbox.closest('label');
      if (checkbox.checked && label) {
        label.classList.add('checked');
      }
      
      // changeイベント時に保存とクラス更新
      checkbox.addEventListener('change', function() {
        const label = this.closest('label');
        if (this.checked && label) {
          label.classList.add('checked');
        } else if (label) {
          label.classList.remove('checked');
        }
        saveSelectedChannels();
      });
    });
    
    container.style.display = 'block';
    log(`${displayChannels.length}個のチャンネルを取得しました`, 'success');
    document.getElementById('submitBtn').disabled = false;
    
    // 保存済みチャンネルを復元
    restoreSelectedChannels();
    
  } catch (error) {
    log(`エラー: ${error.message}`, 'error');
    document.getElementById('channelListContainer').style.display = 'none';
  }
});

// メインのリアクション実行
document.getElementById('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const token = document.getElementById('token').value.trim();
  const guildId = document.getElementById('guildId').value.trim();
  const emoji = document.getElementById('emoji')?.value?.trim();
  const useExternalEmojis = document.getElementById('useExternalEmojis').checked;
  const reverseOrder = document.getElementById('reverseOrder').checked;
  const messageLimit = parseInt(document.getElementById('messageLimit').value);
  const interval = parseInt(document.getElementById('interval').value) || 0;
  
  // Nitro絵文字を使う場合、Nitro有無を確認
  if (useExternalEmojis) {
    const hasNitro = await checkNitroStatus(token);
    if (!hasNitro) {
      log('エラー: Nitro絵文字を使用するにはDiscord Nitroが必要です', 'error');
      log('Nitroを購入するか、設定を変更してください', 'error');
      document.getElementById('submitBtn').disabled = false;
      document.getElementById('stopBtn').disabled = true;
      return;
    }
  }
  
  const selectedChannels = Array.from(
    document.querySelectorAll('#channelListContainer input[type="checkbox"]:checked')
  ).map(el => ({
    id: el.value,
    name: el.dataset.channel
  }));
  
  if (selectedChannels.length === 0) {
    alert('チャンネルを選択してください');
    return;
  }
  
  const allSelectedChannels = selectedChannels;
  
  // Nitro オフ時は固定絵文字セットを使用するため入力不要
  
  isRunning = true;
  document.getElementById('submitBtn').disabled = true;
  document.getElementById('stopBtn').disabled = false;
  
  const emojiList = useExternalEmojis
    ? NITRO_EMOJIS
    : DEFAULT_EMOJIS;
  log(`リアクション開始: ${useExternalEmojis ? 'Nitro絵文字' : 'デフォルト絵文字'} (${emojiList.length}種) を使用, チャンネル=${allSelectedChannels.length}個, 間隔=${interval}ms`, 'info');
  
  for (const channel of allSelectedChannels) {
    if (!isRunning) break;
    
    try {
      log(`チャンネル #${channel.name} を処理中...`, 'info');
      
      // メッセージ取得
      const messagesUrl = `${API_BASE}/channels/${channel.id}/messages?limit=${messageLimit}`;
      const messagesResp = await fetch(messagesUrl, {
        headers: { Authorization: token }
      });
      
      if (!messagesResp.ok) {
        log(`#${channel.name}: メッセージ取得失敗 (${messagesResp.status})`, 'error');
        continue;
      }
      
      let messages = await messagesResp.json();
      
      if (reverseOrder) {
        messages = messages.reverse();
      }
      
      for (const msg of messages) {
        if (!isRunning) break;
        
        try {
          // 1メッセージに対して全絵文字を順に付与
          for (const emojiParam of emojiList) {
            if (!isRunning) break;
            const reactionUrl = `${API_BASE}/channels/${channel.id}/messages/${msg.id}/reactions/${emojiParam}/@me`;

            const reactionResp = await fetch(reactionUrl, {
              method: 'PUT',
              headers: { Authorization: token }
            });

            if (reactionResp.ok) {
              log(`[#${channel.name}] ${emojiParam} を ${msg.id} に追加`, 'success');
            } else if (reactionResp.status === 429) {
              log(`レート制限: ${reactionResp.headers.get('retry-after')}秒待機中...`, 'warning');
              const retryAfter = parseFloat(reactionResp.headers.get('retry-after')) * 1000;
              await new Promise(resolve => setTimeout(resolve, retryAfter + 100));
            } else if (reactionResp.status === 400) {
              // 400エラーの詳細を確認（不明な絵文字など）
              const errorData = await reactionResp.json();
              if (errorData.code === 10014 && useExternalEmojis) {
                log(`[#${channel.name}] Nitro絵文字が見つかりません`, 'warning');
                log(`Nitro絵文字が置いてあるサーバーに参加してください。`, 'warning');
                log(`https://discord.gg/cyvqWKSKn5`, 'warning');
                isRunning = false;
                break;
              } else {
                log(`[#${channel.name}] ${emojiParam} リアクション失敗 (400: ${errorData.message})`, 'error');
              }
            } else {
              log(`[#${channel.name}] ${emojiParam} リアクション失敗 (${reactionResp.status})`, 'error');
            }

            await new Promise(resolve => setTimeout(resolve, interval));
          }
        } catch (error) {
          log(`  エラー (メッセージ処理): ${error.message}`);
        }
      }
      
      log(`チャンネル #${channel.name} 完了`, 'success');
      
    } catch (error) {
      log(`エラー (#${channel.name}): ${error.message}`, 'error');
    }
  }
  
  isRunning = false;
  document.getElementById('submitBtn').disabled = false;
  document.getElementById('stopBtn').disabled = true;
  log('リアクション処理完了', 'info');
});

// 停止ボタン
document.getElementById('stopBtn').addEventListener('click', () => {
  isRunning = false;
  log('処理を停止しました', 'warning');
  document.getElementById('submitBtn').disabled = false;
  document.getElementById('stopBtn').disabled = true;
});
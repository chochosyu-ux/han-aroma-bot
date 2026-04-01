export default async function handler(req, res) {
  // LINE Webhook 測試時會發送 POST 請求
  if (req.method !== 'POST') {
    return res.status(200).json({ message: '涵香療癒所 Webhook 正常運作中！' });
  }
  
  // 從 Vercel 環境變數讀取金鑰
  const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const DATABASE_ID = process.env.NOTION_DATABASE_ID;

  try {
    const events = req.body.events;
    
    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userMessage = event.message.text;

        // 當客戶輸入特定關鍵字
        if (userMessage.includes('活動') || userMessage.includes('預約')) {
          const notionEvents = await getFutureEventsFromNotion(NOTION_TOKEN, DATABASE_ID);
          
          if (notionEvents.length > 0) {
            const flexMessage = createCarouselFlexMessage(notionEvents);
            await replyMessage(LINE_TOKEN, event.replyToken, [flexMessage]);
          } else {
            await replyMessage(LINE_TOKEN, event.replyToken, [{ type: 'text', text: '目前近期尚未安排新活動喔！歡迎許願～' }]);
          }
        }
      }
      
      // 預留給未來點擊「我要預約」按鈕的動作
      if (event.type === 'postback') {
        const data = event.postback.data;
        await replyMessage(LINE_TOKEN, event.replyToken, [{ type: 'text', text: `系統測試：已收到預約指令 [${data}]` }]);
      }
    }
    
    // 必須回傳 200 給 LINE，告訴它我們成功收到了
    return res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Webhook Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

// 呼叫 Notion API 撈取未來行程
async function getFutureEventsFromNotion(token, dbId) {
  // 取得台灣時間的今天日期 (格式 YYYY-MM-DD)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });

  const payload = {
    filter: {
      property: "活動日期",
      date: { on_or_after: today }
    },
    sorts: [{ property: "活動日期", direction: "ascending" }]
  };

  const response = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  return data.results ? data.results.slice(0, 10) : [];
}

// 製作溫暖水彩風 Flex Message
function createCarouselFlexMessage(notionEvents) {
  const bubbles = notionEvents.map(event => {
    // 防彈升級版：加上了 ?.[0] 防止陣列找不到而當機，並同時支援「文字」與「單選標籤」格式
    const title = event.properties['活動名稱']?.title?.[0]?.plain_text || '未命名活動';
    const date = event.properties['活動日期']?.date?.start || '日期未定';
    const time = event.properties['時段']?.rich_text?.[0]?.plain_text || event.properties['時段']?.select?.name || '';
    const location = event.properties['地點']?.rich_text?.[0]?.plain_text || event.properties['地點']?.select?.name || '地點確認中';
    
    return {
      "type": "bubble",
      "size": "micro",
      "hero": {
        "type": "image",
        "url": "https://images.unsplash.com/photo-1608222351212-18fe0ec7b13b?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80", 
        "size": "full",
        "aspectRatio": "20:13",
        "aspectMode": "cover"
      },
      "body": {
        "type": "box",
        "layout": "vertical",
        "contents": [
          { "type": "text", "text": title, "weight": "bold", "size": "md", "color": "#8b5a2b", "wrap": true },
          { "type": "text", "text": `📅 ${date} ${time}`, "size": "xs", "color": "#a08c75", "margin": "md" },
          { "type": "text", "text": `📍 ${location}`, "size": "xs", "color": "#a08c75", "margin": "sm" }
        ],
        "backgroundColor": "#fdfaf6"
      },
      "footer": {
        "type": "box",
        "layout": "vertical",
        "spacing": "sm",
        "contents": [
          {
            "type": "button",
            "style": "primary",
            "height": "sm",
            "color": "#d4a373",
            "action": {
              "type": "postback",
              "label": "我要預約",
              "data": `action=book&eventId=${event.id}&title=${title}`
            }
          }
        ],
        "backgroundColor": "#fdfaf6"
      }
    };
  });

  return {
    "type": "flex",
    "altText": "涵香療癒所：近期活動開放預約囉！",
    "contents": {
      "type": "carousel",
      "contents": bubbles
    }
  };
}

// 發送 LINE 回覆 (升級版：加入監聽結果)
async function replyMessage(token, replyToken, messages) {
  const response = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ replyToken, messages })
  });
  
  // 讓系統把 LINE 的回覆印在 Vercel 監視器上
  const result = await response.json();
  console.log('📢 LINE 官方審查結果：', result);
}

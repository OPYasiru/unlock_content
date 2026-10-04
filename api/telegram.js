export default async function handler(req, res) {
    // 1. Cron Job එක ක්‍රියාත්මක වීම (Auto Delete)
    if (req.method === 'GET' && req.query.cron === 'true') {
        const queue = await kvGet("delete_queue") || [];
        const now = Date.now();
        const newQueue = [];
        for (let item of queue) {
            if (now > item.deleteAt) {
                try {
                    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({chat_id: item.chatId, message_id: item.userMsgId})});
                    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({chat_id: item.chatId, message_id: item.warnMsgId})});
                } catch(e) {}
            } else {
                newQueue.push(item);
            }
        }
        await kvSet("delete_queue", newQueue);
        return res.status(200).send("Cron Executed");
    }

    if (req.method !== 'POST') return res.status(200).send('Bot is running');

    const BOT_TOKEN = "8715294684:AAFdq0e3SFZBeKj9i9o1s2D8nDN410csq5U";
    const MAIN_CHANNEL_ID = "-1003920624467";
    const DB_CHANNEL_ID = "-100XXXXXXXXX"; // 🔴 ඔයාගේ FileStore DB චැනල් ID එක මෙතනට දාන්න (උදා: -100123456789)
    const ADMIN_USER_ID = 5411921025;
    const BASE_URL = "https://unlockcontent.vercel.app";
    const DEFAULT_BANNER = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80";

    const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    // Helper Functions
    async function sendMsg(chatId, text) {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML' }) });
    }
    async function kvSet(key, value) {
        if (KV_URL) await fetch(KV_URL, { method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(["SET", key, value]) });
    }
    async function kvGet(key) {
        if (!KV_URL) return null;
        try { const resp = await fetch(KV_URL, { method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(["GET", key]) }); const data = await resp.json(); return data.result; } catch (e) { return null; }
    }
    function encodeId(id) { return Buffer.from(`HL_${id}`).toString('base64').replace(/=/g, ''); }
    function decodeId(token) { try { const str = Buffer.from(token, 'base64').toString('utf8'); if (str.startsWith('HL_')) return parseInt(str.split('_')[1]); } catch(e) {} return null; }

    try {
        const body = req.body;
        if (!body || !body.message) return res.status(200).json({ ok: true });

        const msg = body.message;
        const chatId = msg.chat.id;
        const textContent = msg.text || msg.caption || "";

        // ==========================================
        // 1. USER SECTION: අදාළ File එක යූසර්ට යැවීම
        // ==========================================
        if (textContent.startsWith('/start ') && chatId !== ADMIN_USER_ID) {
            const token = textContent.replace('/start ', '').trim();
            const dbMsgId = decodeId(token);

            if (!dbMsgId) {
                await sendMsg(chatId, "❌ ලින්ක් එක කල් ඉකුත් වී හෝ වැරදියි!");
                return res.status(200).json({ ok: true });
            }

            const fileCaption = await kvGet("file_caption") || "<b>HotLanka</b>";
            const deleteTime = await kvGet("delete_time") || 15; // Default 15 mins

            // DB චැනල් එකෙන් යූසර්ට File එක Copy කිරීම
            const sendFileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/copyMessage`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ chat_id: chatId, from_chat_id: DB_CHANNEL_ID, message_id: dbMsgId, caption: fileCaption, parse_mode: 'HTML' })
            }).then(r => r.json());

            if (sendFileRes.ok) {
                const userMsgId = sendFileRes.result.message_id;
                // Auto Delete Warning එක යැවීම
                const warnRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ chat_id: chatId, text: `⏳ <i>ආරක්ෂක හේතූන් මත මෙම ෆයිල් එක විනාඩි ${deleteTime} කින් ස්වයංක්‍රීයව මැකී යනු ඇත...</i>`, parse_mode: 'HTML' })
                }).then(r => r.json());

                // Database එකේ Delete Queue එකට දැමීම
                if (warnRes.ok) {
                    const warnMsgId = warnRes.result.message_id;
                    const deleteAt = Date.now() + (deleteTime * 60 * 1000);
                    const queue = await kvGet("delete_queue") || [];
                    queue.push({ chatId, userMsgId, warnMsgId, deleteAt });
                    await kvSet("delete_queue", queue);
                }
            }
            return res.status(200).json({ ok: true });
        }

        // ==========================================
        // 2. ADMIN SECTION: පෝස්ට් හැදීම සහ සෙටින්ග්ස්
        // ==========================================
        if (chatId !== ADMIN_USER_ID) return res.status(200).json({ ok: true });

        // (A) Admin විසින් Video එකක් යැවූ විට (Post එක හැදීම)
        if (msg.video || msg.document || msg.photo) {
            // DB චැනල් එකට File එක Copy කිරීම
            const copyRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/copyMessage`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ chat_id: DB_CHANNEL_ID, from_chat_id: chatId, message_id: msg.message_id })
            }).then(r => r.json());

            if (!copyRes.ok) return sendMsg(chatId, `❌ DB චැනල් එකට Save කරන්න බැරි වුණා. DB_CHANNEL_ID එක හරිද බලන්න. (Error: ${copyRes.description})`);

            const dbMsgId = copyRes.result.message_id;
            const token = encodeId(dbMsgId);
            const targetLink = `${BASE_URL}/?t=${token}`;

            // Thumbnail ID එක ගැනීම
            let thumbId = null;
            if (msg.video && msg.video.thumbnail) thumbId = msg.video.thumbnail.file_id;
            else if (msg.document && msg.document.thumbnail) thumbId = msg.document.thumbnail.file_id;
            else if (msg.photo) thumbId = msg.photo[msg.photo.length - 1].file_id;

            let finalCaption = await kvGet("default_caption") || "<blockquote>🔥 Hot Lanka New Update! ❞</blockquote>\n<blockquote>⏳ Link will expire soon, download now! ❞</blockquote>";
            const inlineKeyboard = { inline_keyboard: [ [{ text: "👁 Watch", url: targetLink }, { text: "⬇️ Download", url: targetLink }] ] };

            let postRes;
            if (thumbId) {
                try {
                    const getFileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${thumbId}`).then(r => r.json());
                    if (getFileRes.ok && getFileRes.result.file_path) {
                        const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${getFileRes.result.file_path}`;
                        const imageRes = await fetch(fileUrl);
                        const imageBlob = await imageRes.blob();
                        const formData = new FormData();
                        formData.append('chat_id', MAIN_CHANNEL_ID);
                        formData.append('photo', imageBlob, 'thumb.jpg');
                        formData.append('caption', finalCaption);
                        formData.append('parse_mode', 'HTML');
                        formData.append('reply_markup', JSON.stringify(inlineKeyboard));
                        postRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, { method: 'POST', body: formData });
                    }
                } catch(e) {}
            }

            if (!postRes || !postRes.ok) {
                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: MAIN_CHANNEL_ID, photo: DEFAULT_BANNER, caption: finalCaption, parse_mode: 'HTML', reply_markup: inlineKeyboard }) });
            }

            await sendMsg(chatId, `✅ <b>Post එක සාර්ථකයි!</b>\nමේක තමයි ලින්ක් එක: <code>${targetLink}</code>`);
            return res.status(200).json({ ok: true });
        }

        // (B) Admin Commands
        if (textContent.startsWith('/settext ')) {
            const newText = textContent.replace('/settext ', '').trim();
            await kvSet("default_caption", newText);
            await sendMsg(chatId, `✅ Default Post Text එක වෙනස් කළා.`);
        } else if (textContent.startsWith('/setcaption ')) {
            const newCap = textContent.replace('/setcaption ', '').trim();
            await kvSet("file_caption", newCap);
            await sendMsg(chatId, `✅ යූසර්ට යවන File එකේ Caption එක <b>${newCap}</b> ලෙස වෙනස් කළා.`);
        } else if (textContent.startsWith('/settime ')) {
            const time = parseInt(textContent.replace('/settime ', '').trim());
            if(time > 0) { await kvSet("delete_time", time); await sendMsg(chatId, `✅ Auto-delete කාලය විනාඩි ${time} කට සෙට් කළා.`); }
        } else if (textContent === '/settings') {
            const cap = await kvGet("file_caption") || "HotLanka";
            const time = await kvGet("delete_time") || 15;
            await sendMsg(chatId, `⚙️ <b>Current Settings:</b>\n\n📌 <b>File Caption:</b> ${cap}\n⏳ <b>Auto-Delete Time:</b> ${time} mins\n\n<i>To change, use /setcaption [text] or /settime [minutes]</i>`);
        } else if (textContent === '/start') {
            await sendMsg(chatId, "<b>Hot Lanka Admin Panel!</b>\n\nVideo එකක් Post කරන්න නිකම්ම යවන්න. \n\nCommands:\n/settext - Post text එක\n/setcaption - File caption එක\n/settime - Auto delete කාලය (විනාඩි)\n/settings - Settings බලන්න");
        }

    } catch (err) { console.error("Handler error:", err); }
    return res.status(200).json({ ok: true });
}

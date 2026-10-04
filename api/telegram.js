export default async function handler(req, res) {
    // ==========================================
    // --- ඔයාගේ විස්තර (Tokens & IDs) ---
    // ==========================================
    const POST_BOT = "8715294684:AAFdq0e3SFZBeKj9i9o1s2D8nDN410csq5U"; // @HotLanka_Bot
    const FILE_BOT = "8803517060:AAHZyUXMhNca90PBcn-iDxhEhITKPU9aFwE"; // @FileStoreSl_bot
    
    const ADMIN_USER_ID = 5411921025;
    const MAIN_CHANNEL_ID = "-1003920624467"; 
    const DB_CHANNEL_ID = "-1004365559436"; 
    
    const FORCE_SUB_CHANNEL_ID = "-1003920624467"; 
    const FORCE_SUB_CHANNEL_LINK = "https://t.me/+0J7qKfh5UcEzNTRl"; 

    const PROTECT_CONTENT = true; 
    const FILE_AUTO_DELETE = 15; 
    const BASE_URL = "https://unlockcontent.vercel.app";
    const CUSTOM_BANNER = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80";

    const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    // Cron Job (Auto Delete) හැමවිටම File Bot ගෙන් ක්‍රියාත්මක වේ
    if (req.method === 'GET' && req.query.cron === 'true') {
        const queue = await kvGet("delete_queue") || [];
        const now = Date.now();
        const newQueue = [];
        for (let item of queue) {
            if (now > item.deleteAt) {
                try {
                    await fetch(`https://api.telegram.org/bot${FILE_BOT}/deleteMessage`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({chat_id: item.chatId, message_id: item.userMsgId})});
                    await fetch(`https://api.telegram.org/bot${FILE_BOT}/deleteMessage`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({chat_id: item.chatId, message_id: item.warnMsgId})});
                } catch(e) {}
            } else {
                newQueue.push(item);
            }
        }
        await kvSet("delete_queue", newQueue);
        return res.status(200).send("Cron Executed");
    }

    if (req.method !== 'POST') return res.status(200).send('Dual Bots Running');

    // කුමන බොට් ද කියා හඳුනාගැනීම (URL එක හරහා)
    const isPostBot = req.query.bot === 'post';
    const BOT_TOKEN = isPostBot ? POST_BOT : FILE_BOT;

    async function sendMsg(chatId, text, replyMarkup = null) {
        let body = { chat_id: chatId, text: text, parse_mode: 'HTML' };
        if (replyMarkup) body.reply_markup = replyMarkup;
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    }
    async function kvSet(key, value) {
        if (KV_URL) await fetch(KV_URL, { method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(["SET", key, value]) });
    }
    async function kvGet(key) {
        if (!KV_URL) return null;
        try { const resp = await fetch(KV_URL, { method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(["GET", key]) }); return (await resp.json()).result; } catch (e) { return null; }
    }
    function encodeId(id) { return Buffer.from(`HL_${id}`).toString('base64').replace(/=/g, ''); }
    function decodeId(token) { try { const str = Buffer.from(token, 'base64').toString('utf8'); if (str.startsWith('HL_')) return parseInt(str.split('_')[1]); } catch(e) {} return null; }
    
    function formatText(text, user) {
        return text.replace(/{first}/g, user.first_name || '').replace(/{username}/g, user.username ? '@'+user.username : '').replace(/{id}/g, user.id);
    }

    async function isUserSubscribed(userId) {
        if (!FORCE_SUB_CHANNEL_ID) return true;
        try {
            const res = await fetch(`https://api.telegram.org/bot${FILE_BOT}/getChatMember?chat_id=${FORCE_SUB_CHANNEL_ID}&user_id=${userId}`).then(r => r.json());
            if (res.ok && ['member', 'administrator', 'creator'].includes(res.result.status)) return true;
            return false;
        } catch (e) { return true; }
    }

    try {
        const body = req.body;
        if (!body || !body.message) return res.status(200).json({ ok: true });
        const msg = body.message;
        const chatId = msg.chat.id;
        const user = msg.from;
        const textContent = msg.text || msg.caption || "";

        // File Bot වෙත එන Users ව Save කරගැනීම
        if (!isPostBot && chatId !== ADMIN_USER_ID) {
            let users = await kvGet("bot_users") || [];
            if (!users.includes(chatId)) { users.push(chatId); await kvSet("bot_users", users); }
        }

        // ==========================================
        // 1. FILE BOT (User Section)
        // ==========================================
        if (!isPostBot && textContent.startsWith('/start ') && chatId !== ADMIN_USER_ID) {
            const token = textContent.replace('/start ', '').trim();
            const dbMsgId = decodeId(token);
            if (!dbMsgId) { await sendMsg(chatId, "❌ <b>ලින්ක් එක කල් ඉකුත් වී හෝ වැරදියි!</b>"); return res.status(200).json({ ok: true }); }

            const isSubbed = await isUserSubscribed(chatId);
            if (!isSubbed) {
                let fsText = await kvGet("forcesub_text") || "👋 ආයුබෝවන් {first},\n\nමෙම ෆයිල් එක ලබා ගැනීමට ප්‍රථමයෙන් අපගේ ප්‍රධාන චැනල් එක හා සම්බන්ධ වී සිටිය යුතුය.";
                const fsMarkup = { inline_keyboard: [ [{ text: "📢 Join Channel", url: FORCE_SUB_CHANNEL_LINK }], [{ text: "🔄 Try Again", url: `https://t.me/${user.username}?start=${token}` }] ]};
                await sendMsg(chatId, formatText(fsText, user), fsMarkup);
                return res.status(200).json({ ok: true });
            }

            const fileCaption = await kvGet("file_caption") || "<b>HotLanka Exclusive</b>";
            const sendFileRes = await fetch(`https://api.telegram.org/bot${FILE_BOT}/copyMessage`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ chat_id: chatId, from_chat_id: DB_CHANNEL_ID, message_id: dbMsgId, caption: fileCaption, parse_mode: 'HTML', protect_content: PROTECT_CONTENT })
            }).then(r => r.json());

            if (sendFileRes.ok) {
                const warnRes = await fetch(`https://api.telegram.org/bot${FILE_BOT}/sendMessage`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ chat_id: chatId, text: `⚠️ <b>අවවාදයි!</b>\n\n<i>ආරක්ෂක හේතූන් මත මෙම ෆයිල් එක විනාඩි ${FILE_AUTO_DELETE} කින් ස්වයංක්‍රීයව මැකී යනු ඇත. කරුණාකර ඊට පෙර Download කරගන්න.</i>`, parse_mode: 'HTML' })
                }).then(r => r.json());
                if (warnRes.ok) {
                    const queue = await kvGet("delete_queue") || [];
                    queue.push({ chatId, userMsgId: sendFileRes.result.message_id, warnMsgId: warnRes.result.message_id, deleteAt: Date.now() + (FILE_AUTO_DELETE * 60 * 1000) });
                    await kvSet("delete_queue", queue);
                }
            }
            return res.status(200).json({ ok: true });
        }

        // ==========================================
        // 2. ADMIN SECTION
        // ==========================================
        if (chatId === ADMIN_USER_ID) {
            // (A) පෝස්ට් හැදීම (Post Bot හරහා පමණි)
            if (isPostBot && (msg.video || msg.document || msg.photo)) {
                const copyRes = await fetch(`https://api.telegram.org/bot${POST_BOT}/copyMessage`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ chat_id: DB_CHANNEL_ID, from_chat_id: chatId, message_id: msg.message_id })
                }).then(r => r.json());

                if (!copyRes.ok) return sendMsg(chatId, `❌ DB එකට Save කරන්න බැරි වුණා: ${copyRes.description}`);
                const token = encodeId(copyRes.result.message_id);
                const targetLink = `${BASE_URL}/?t=${token}`;

                let thumbId = null;
                if (msg.video) thumbId = (msg.video.thumbnail && msg.video.thumbnail.file_id) || (msg.video.thumb && msg.video.thumb.file_id);
                else if (msg.document) thumbId = (msg.document.thumbnail && msg.document.thumbnail.file_id) || (msg.document.thumb && msg.document.thumb.file_id);
                else if (msg.photo) thumbId = msg.photo[msg.photo.length - 1].file_id;

                let finalCaption = await kvGet("default_caption") || "<blockquote>🔥 Hot Lanka New Update! ❞</blockquote>\n<blockquote>⏳ Link will expire soon, download now! ❞</blockquote>";
                const inlineKeyboard = { inline_keyboard: [ [{ text: "👁 Watch", url: targetLink }, { text: "⬇️ Download", url: targetLink }] ] }; // බටන් දෙක වෙන් කළා

                let postRes;
                if (thumbId) {
                    postRes = await fetch(`https://api.telegram.org/bot${POST_BOT}/sendPhoto`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chat_id: MAIN_CHANNEL_ID, photo: thumbId, caption: finalCaption, parse_mode: 'HTML', reply_markup: inlineKeyboard })
                    }).then(r => r.json());
                }
                if (!postRes || !postRes.ok) {
                    await fetch(`https://api.telegram.org/bot${POST_BOT}/sendPhoto`, { 
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, 
                        body: JSON.stringify({ chat_id: MAIN_CHANNEL_ID, photo: CUSTOM_BANNER, caption: finalCaption, parse_mode: 'HTML', reply_markup: inlineKeyboard }) 
                    });
                }
                return sendMsg(chatId, `✅ <b>Post එක සාර්ථකයි!</b>\n🔗 Link: <code>${targetLink}</code>`);
            }

            // (B) Admin Commands (Settings & Stats)
            if (textContent.startsWith('/settext ')) { await kvSet("default_caption", textContent.replace('/settext ', '').trim()); await sendMsg(chatId, `✅ Post Text එක වෙනස් කළා.`); }
            else if (textContent.startsWith('/setcaption ')) { await kvSet("file_caption", textContent.replace('/setcaption ', '').trim()); await sendMsg(chatId, `✅ File Caption එක වෙනස් කළා.`); }
            else if (textContent.startsWith('/setforcesub ')) { await kvSet("forcesub_text", textContent.replace('/setforcesub ', '').trim()); await sendMsg(chatId, `✅ Force Sub Text එක වෙනස් කළා.`); }
            else if (textContent === '/users' || textContent === '/stats') {
                const users = await kvGet("bot_users") || [];
                await sendMsg(chatId, `📊 <b>Bot Statistics:</b>\n👥 Total Users: <b>${users.length}</b>`);
            }
            else if (textContent.startsWith('/broadcast ')) {
                const bMsg = textContent.replace('/broadcast ', '').trim();
                const users = await kvGet("bot_users") || [];
                await sendMsg(chatId, `🚀 <b>Broadcast ආරම්භ කළා!</b> Users ${users.length} කට යවනවා...`);
                let count = 0;
                for (let uId of users) {
                    try { await fetch(`https://api.telegram.org/bot${FILE_BOT}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: uId, text: bMsg, parse_mode: 'HTML' }) }); count++; } catch(e) {}
                }
                await sendMsg(chatId, `✅ Broadcast එක සම්පූර්ණයි! ${count} කට ගියා.`);
            }
            else if (textContent === '/start') {
                if (isPostBot) await sendMsg(chatId, "<b>👑 Hot Lanka POST Bot</b>\n\nVideo එකක් Post කරන්න මෙතැනට යවන්න.");
                else await sendMsg(chatId, "<b>⚙️ FileStore Settings Panel</b>\n\n<b>Commands:</b>\n<code>/settext</code> [text] - Post text එක\n<code>/setcaption</code> [text] - File caption එක\n<code>/setforcesub</code> [text] - Force sub msg එක\n<code>/users</code> - සෙනග ගාණ බලන්න\n<code>/broadcast</code> [text] - මැසේජ් යවන්න");
            }
        }
    } catch (err) {}
    return res.status(200).json({ ok: true });
}

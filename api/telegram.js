export default async function handler(req, res) {
    // ==========================================
    // --- CONFIG VARIABLES (මෙතන වෙනස් කරන්න) ---
    // ==========================================
    const BOT_TOKEN = "8803517060:AAHZyUXMhNca90PBcn-iDxhEhITKPU9aFwE"; 
    const ADMIN_USER_ID = 5411921025;
    
    const MAIN_CHANNEL_ID = "-1003920624467"; // පෝස්ට් වැටෙන ප්‍රධාන චැනල් එක
    const DB_CHANNEL_ID = "-1004365559436"; // 🔴 ඔයාගේ රහසිගත Database චැනල් එක
    
    // FORCE SUB සැකසුම් (එපා නම් "" ලෙස තියන්න)
    const FORCE_SUB_CHANNEL_ID = "-1003920624467"; // උදා: "-100123456789"
    const FORCE_SUB_CHANNEL_LINK = "https://t.me/+0J7qKfh5UcEzNTRl"; // Force sub වෙන්න ඕන චැනල් එකේ ලින්ක් එක

    // වෙනත් සැකසුම්
    const PROTECT_CONTENT = true; // ෆයිල් එක වෙන අයට Forward කරන එක නවත්වන්න (True/False)
    const FILE_AUTO_DELETE = 15; // විනාඩි කීයකින් මැකෙන්න ඕනෙද
    const BASE_URL = "https://unlockcontent.vercel.app";
    const CUSTOM_BANNER = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80";

    const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    // ==========================================
    // --- Auto Delete (Cron Job) ක්‍රියාත්මක වීම ---
    // ==========================================
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

    if (req.method !== 'POST') return res.status(200).send('Super Bot is running');

    // ==========================================
    // --- HELPER FUNCTIONS ---
    // ==========================================
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
        try { const resp = await fetch(KV_URL, { method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(["GET", key]) }); const data = await resp.json(); return data.result; } catch (e) { return null; }
    }
    function encodeId(id) { return Buffer.from(`HL_${id}`).toString('base64').replace(/=/g, ''); }
    function decodeId(token) { try { const str = Buffer.from(token, 'base64').toString('utf8'); if (str.startsWith('HL_')) return parseInt(str.split('_')[1]); } catch(e) {} return null; }
    
    // Custom Fillings Formatting (e.g. {first}, {username})
    function formatText(text, user) {
        return text.replace(/{first}/g, user.first_name || '')
                   .replace(/{last}/g, user.last_name || '')
                   .replace(/{username}/g, user.username ? '@'+user.username : '')
                   .replace(/{id}/g, user.id);
    }

    // Check Force Sub
    async function isUserSubscribed(userId) {
        if (!FORCE_SUB_CHANNEL_ID) return true;
        try {
            const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${FORCE_SUB_CHANNEL_ID}&user_id=${userId}`).then(r => r.json());
            if (res.ok && ['member', 'administrator', 'creator'].includes(res.result.status)) return true;
            return false;
        } catch (e) { return true; } // අර්බුදයකදී ඉඩ දෙනවා
    }

    try {
        const body = req.body;
        if (!body || !body.message) return res.status(200).json({ ok: true });

        const msg = body.message;
        const chatId = msg.chat.id;
        const user = msg.from;
        const textContent = msg.text || msg.caption || "";

        // Save User for Broadcast/Stats
        if (chatId !== ADMIN_USER_ID) {
            let users = await kvGet("bot_users") || [];
            if (!users.includes(chatId)) {
                users.push(chatId);
                await kvSet("bot_users", users);
            }
        }

        // ==========================================
        // --- USER SECTION: ෆයිල් ලබා දීම ---
        // ==========================================
        if (textContent.startsWith('/start ') && chatId !== ADMIN_USER_ID) {
            const token = textContent.replace('/start ', '').trim();
            const dbMsgId = decodeId(token);

            if (!dbMsgId) {
                await sendMsg(chatId, "❌ <b>ලින්ක් එක කල් ඉකුත් වී හෝ වැරදියි!</b>");
                return res.status(200).json({ ok: true });
            }

            // Check Force Sub
            const isSubbed = await isUserSubscribed(chatId);
            if (!isSubbed) {
                let fsText = await kvGet("forcesub_text") || "👋 ආයුබෝවන් {first},\n\nමෙම ෆයිල් එක ලබා ගැනීමට ප්‍රථමයෙන් අපගේ ප්‍රධාන චැනල් එක හා සම්බන්ධ වී සිටිය යුතුය.";
                fsText = formatText(fsText, user);
                const fsMarkup = { inline_keyboard: [ 
                    [{ text: "📢 Join Channel", url: FORCE_SUB_CHANNEL_LINK }], 
                    [{ text: "🔄 Try Again", url: `https://t.me/${user.username}?start=${token}` }] // Bot link update internally
                ]};
                await sendMsg(chatId, fsText, fsMarkup);
                return res.status(200).json({ ok: true });
            }

            const fileCaption = await kvGet("file_caption") || "<b>HotLanka Exclusive</b>";
            
            // DB චැනල් එකෙන් යූසර්ට File එක Copy කිරීම (With Protect Content)
            const sendFileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/copyMessage`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ 
                    chat_id: chatId, 
                    from_chat_id: DB_CHANNEL_ID, 
                    message_id: dbMsgId, 
                    caption: fileCaption, 
                    parse_mode: 'HTML',
                    protect_content: PROTECT_CONTENT 
                })
            }).then(r => r.json());

            if (sendFileRes.ok) {
                const userMsgId = sendFileRes.result.message_id;
                // Auto Delete Warning එක යැවීම
                const warnRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ chat_id: chatId, text: `⚠️ <b>අවවාදයි!</b>\n\n<i>ආරක්ෂක හේතූන් මත මෙම ෆයිල් එක විනාඩි ${FILE_AUTO_DELETE} කින් ස්වයංක්‍රීයව මැකී යනු ඇත. කරුණාකර ඊට පෙර Download කරගන්න.</i>`, parse_mode: 'HTML' })
                }).then(r => r.json());

                // Database එකේ Delete Queue එකට දැමීම
                if (warnRes.ok) {
                    const warnMsgId = warnRes.result.message_id;
                    const deleteAt = Date.now() + (FILE_AUTO_DELETE * 60 * 1000);
                    const queue = await kvGet("delete_queue") || [];
                    queue.push({ chatId, userMsgId, warnMsgId, deleteAt });
                    await kvSet("delete_queue", queue);
                }
            }
            return res.status(200).json({ ok: true });
        }

        // ==========================================
        // --- ADMIN SECTION: විශේෂාංග සහ විධාන ---
        // ==========================================
        if (chatId !== ADMIN_USER_ID) return res.status(200).json({ ok: true });

        // (A) Admin විසින් Video එකක් යැවූ විට (Post එක හැදීම)
        if (msg.video || msg.document || msg.photo) {
            const copyRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/copyMessage`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ chat_id: DB_CHANNEL_ID, from_chat_id: chatId, message_id: msg.message_id })
            }).then(r => r.json());

            if (!copyRes.ok) return sendMsg(chatId, `❌ DB චැනල් එකට Save කරන්න බැරි වුණා. Error: ${copyRes.description}`);

            const dbMsgId = copyRes.result.message_id;
            const token = encodeId(dbMsgId);
            const targetLink = `${BASE_URL}/?t=${token}`;

            let thumbId = null;
            if (msg.video) thumbId = (msg.video.thumbnail && msg.video.thumbnail.file_id) || (msg.video.thumb && msg.video.thumb.file_id);
            else if (msg.document) thumbId = (msg.document.thumbnail && msg.document.thumbnail.file_id) || (msg.document.thumb && msg.document.thumb.file_id);
            else if (msg.photo) thumbId = msg.photo[msg.photo.length - 1].file_id;

            let finalCaption = await kvGet("default_caption") || "<blockquote>🔥 Hot Lanka New Update! ❞</blockquote>\n<blockquote>⏳ Link will expire soon, download now! ❞</blockquote>";
            const inlineKeyboard = { inline_keyboard: [ [{ text: "👁 Watch / Download", url: targetLink }] ] };

            let postRes;
            if (thumbId) {
                postRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: MAIN_CHANNEL_ID, photo: thumbId, caption: finalCaption, parse_mode: 'HTML', reply_markup: inlineKeyboard })
                }).then(r => r.json());
            }

            if (!postRes || !postRes.ok) {
                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, { 
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ chat_id: MAIN_CHANNEL_ID, photo: CUSTOM_BANNER, caption: finalCaption, parse_mode: 'HTML', reply_markup: inlineKeyboard }) 
                });
            }

            await sendMsg(chatId, `✅ <b>Post එක සාර්ථකයි!</b>\n🔗 Link: <code>${targetLink}</code>`);
            return res.status(200).json({ ok: true });
        }

        // (B) Admin Commands (Open-Source Bot වගේ)
        if (textContent.startsWith('/settext ')) {
            await kvSet("default_caption", textContent.replace('/settext ', '').trim());
            await sendMsg(chatId, `✅ Default Post Text එක වෙනස් කළා.`);
        } else if (textContent.startsWith('/setcaption ')) {
            await kvSet("file_caption", textContent.replace('/setcaption ', '').trim());
            await sendMsg(chatId, `✅ යූසර්ට යවන File එකේ Caption එක වෙනස් කළා.`);
        } else if (textContent.startsWith('/setforcesub ')) {
            await kvSet("forcesub_text", textContent.replace('/setforcesub ', '').trim());
            await sendMsg(chatId, `✅ Force Sub Text එක වෙනස් කළා. (Fillings වැඩ කරයි)`);
        } else if (textContent === '/users' || textContent === '/stats') {
            const users = await kvGet("bot_users") || [];
            await sendMsg(chatId, `📊 <b>Bot Statistics:</b>\n\n👥 Total Users in Database: <b>${users.length}</b>`);
        } else if (textContent.startsWith('/broadcast ')) {
            const bMsg = textContent.replace('/broadcast ', '').trim();
            const users = await kvGet("bot_users") || [];
            await sendMsg(chatId, `🚀 <b>Broadcast ආරම්භ කළා!</b> Users ${users.length} කට මැසේජ් එක යවනවා...`);
            let count = 0;
            for (let uId of users) {
                try { await sendMsg(uId, bMsg); count++; } catch(e) {}
            }
            await sendMsg(chatId, `✅ Broadcast එක සම්පූර්ණයි! යූසර්ස්ලා ${count} කට ගියා.`);
        } else if (textContent === '/id') {
            await sendMsg(chatId, `👤 Your Telegram ID: <code>${chatId}</code>\n💬 Chat ID: <code>${msg.chat.id}</code>`);
        } else if (textContent === '/start') {
            await sendMsg(chatId, "<b>👑 Hot Lanka Admin Panel!</b>\n\nVideo එකක් Post කරන්න නිකම්ම යවන්න. \n\n<b>Commands:</b>\n<code>/settext</code> [text] - Post text එක\n<code>/setcaption</code> [text] - File caption එක\n<code>/setforcesub</code> [text] - Force sub message එක\n<code>/users</code> හෝ <code>/stats</code> - සෙනග ගාණ බලන්න\n<code>/broadcast</code> [text] - හැමෝටම මැසේජ් යවන්න\n<code>/id</code> - ID එක ගන්න");
        }

    } catch (err) { console.error("Handler error:", err); }
    return res.status(200).json({ ok: true });
}

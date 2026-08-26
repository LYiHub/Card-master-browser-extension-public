// ==UserScript==
// @name         哔哩哔哩(B站|Bilibili)收藏夹Fix (cerenkov修改版)
// @namespace    http://tampermonkey.net/
// @version      1.4.5
// @description  修复 哔哩哔哩(www.bilibili.com) 失效的视频收藏、和被up主隐藏的视频。（可查看av号、简介、标题、封面、数据等）
// @note         1.4.5 版本更新：
// @note         取消在 xbeibeix 搜索视频信息的步骤，仅保留对应函数
// @author       cerenkov
// @license      GPL-3.0
// @match        *://space.bilibili.com/*/favlist*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/1.11.0/jquery.min.js
// @resource iconError https://cdn.jsdelivr.net/gh/crnkv/bilibili-favorites-fix-cerenkov-mod/media/error.png
// @resource iconSuccess https://cdn.jsdelivr.net/gh/crnkv/bilibili-favorites-fix-cerenkov-mod/media/success.png
// @resource iconInfo https://cdn.jsdelivr.net/gh/crnkv/bilibili-favorites-fix-cerenkov-mod/media/info.png
// @connect      api.bilibili.com
// @connect      biliplus.com
// @connect      jijidown.com
// @connect      xbeibeix.com
// @grant        unsafeWindow
// @grant        GM.xmlHttpRequest
// @grant        GM_notification
// @grant        GM_setClipboard
// @grant        GM_getResourceURL
// @grant        GM_openInTab
// @grant        GM_listValues
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_setValues
// @grant        GM_getValues
// @grant        GM_deleteValues
// @downloadURL https://update.greasyfork.org/scripts/489224/%E5%93%94%E5%93%A9%E5%93%94%E5%93%A9%28B%E7%AB%99%7CBilibili%29%E6%94%B6%E8%97%8F%E5%A4%B9Fix%20%28cerenkov%E4%BF%AE%E6%94%B9%E7%89%88%29.user.js
// @updateURL https://update.greasyfork.org/scripts/489224/%E5%93%94%E5%93%A9%E5%93%94%E5%93%A9%28B%E7%AB%99%7CBilibili%29%E6%94%B6%E8%97%8F%E5%A4%B9Fix%20%28cerenkov%E4%BF%AE%E6%94%B9%E7%89%88%29.meta.js
// ==/UserScript==

/*jshint esversion: 8 */
(function() {
    'use strict';

    // 改成true可以启用调试模式
    // 注意：如果代码被修改，脚本的自动更新会停止，需要在Tampermonkey编辑器中将脚本重置到出厂，才能恢复自动更新（重置之前请记得先导出缓存备份）
    const isDebug = false;

    // 从监测到网页节点变动，到执行脚本修复之间的延迟（秒），延迟太短可能会导致收藏夹翻页的网页渲染未完成而脚本已经开始干预，造成意外后果
    const delay = 2.0;

    // 失效收藏的标题文字颜色(默认为灰色)。
    const invalTitleColor = "#999";
    // 被恢复的隐藏视频的背景颜色
    const recoveredItemColor = "#fa2";
    // 从分P视频的第一P获取到标题时加以后缀标注
    const titleGuessSuffix = " （视频投稿上传时的标题）";

    // 全局变量，用于保存是否B站新网页界面，脚本自动检测
    let isNewUI;
    // 全局变量，用于保存窗口宽度是否超过1760，脚本自动检测
    let isWideScreen;
    // 全局变量，用于保存B新/旧界面各自的视频根节点，脚本自动检测
    let $rootItem;
    // 全局变量，用于保存由B站API端口查询得到的本应展示的视频总数（当中包含被隐藏的视频，即被up主设为“仅自己可见”的视频）
    let NTotalItems = undefined;

    // 缓存已经查询过并且有结果的视频标题和封面（包括查到的和查不到的，不包括查询过程中请求过快、网络错误和解析错误的）
    let cache = {
        clear: function() {
            GM_deleteValues(GM_listValues());
        },
        delete: function(avid, key) {
            if (key == undefined) {
                GM_deleteValue(avid);  // cache.delete(avid) 删除一条avid缓存对象
            } else {
                let c = GM_getValue(avid, {});
                delete c[key];
                if (Object.keys(c).length == 0) {
                    this.delete(avid);  // 如果所删除的key是avid缓存对象唯一的key属性，那么将整条avid缓存对象删除
                } else {
                    GM_setValue(avid, c);  // cache.delete(avid, key) 删除avid缓存对象的对应key属性
                }
            }
        },
        set: function(avid, key, value) {
            if (key == undefined) {
                value = avid;
                if (typeof value !== "object") throw "格式不正确";
                GM_setValues(value);  // cache.set(value) 把 value 对象内的所有avid项都覆盖保存到所有缓存
            } else if (value == undefined) {  // 注意永远不要故意传入value=undefined，应该要用delete方法
                value = key;
                if (typeof value !== "object") throw "格式不正确";
                if (Object.keys(value).length == 0) {
                    this.delete(avid);  // cache.set(avid, {}) 删除对应avid缓存对象
                } else {
                    GM_setValue(avid, value);  // cache.set(avid, value) 把 value 对象覆盖保存到对应avid缓存对象
                }
            } else {
                if (key == "title")
                    value = $("<div/>").html(value).text();  // decode HTML entities
                let c = GM_getValue(avid, {});
                c[key] = value;
                GM_setValue(avid, c);  // cache.set(avid, key, value) 把 value 值覆盖保存到对应avid缓存的对应key属性
            }
        },
        get: function(avid, key, defaultValue) {
            if (defaultValue == undefined) {  // 注意永远不要故意传入defaultValue=undefined
                switch (key) {
                    case "archive":
                        defaultValue = undefined; break;
                    case "title":
                    case "pic":
                    case "ff":
                    case "author":
                        defaultValue = ""; break;
                    case "parts":
                        defaultValue = []; break;
                    case "tid":
                    case "thumb_up":
                    case "coin":
                    case "reply":
                        defaultValue = 0; break;
                    default:
                        // do nothing
                };
            }
            if (avid == undefined) {
                return GM_getValues(GM_listValues());  // cache.get() 返回所有缓存
            } else if (key == undefined) {
                return GM_getValue(avid, undefined);  // cache.get(avid) 返回一条avid缓存对象（未命中时返回 undefined ）
            } else {
                let v = GM_getValue(avid, {})[key];  // cache.get(avid, key) 返回对应avid缓存的对应key属性（未命中时返回 switch-case 指定的 defaultValue ）
                return v == undefined ? defaultValue : v;  // cache.get(avid, key, defaultValue) 返回对应avid缓存的对应key属性（未命中时返回 defaultValue ）
            }
        },
        update: function(avid, key, newValue) {
            let oldValue = this.get(avid, key);
            if (!newValue || newValue === oldValue) return oldValue;
            let isBetter = false;
            switch (key) {
                case "archive":
                    isBetter = (oldValue == undefined && newValue !== undefined) || (oldValue == "nohit" && (newValue == "bp" || newValue == "jj")) || (oldValue == "jj" && newValue == "bp");
                    break;
                case "title":
                    newValue = $("<div/>").html(newValue).text().trim();  // decode HTML entities
                    if (newValue == "" || newValue == "已失效视频" || newValue == avid) break;
                    isBetter = (oldValue == "" || oldValue == "已失效视频") || (oldValue.includes(titleGuessSuffix) && !newValue.includes(titleGuessSuffix));
                    break;
                case "pic":
                    if (/bfs\/archive\/be27fd62c99036dce67efface486fb0a88ffed06/i.test(newValue)) break;
                    if (newValue.includes("@")) newValue = newValue.match(/([^@]*)@/)[1];
                    isBetter = (oldValue == "" && newValue !== "") || (!/bfs\/archive/i.test(oldValue) && /bfs\/archive/i.test(newValue));
                    break;
                case "ff":
                    isBetter = oldValue == "" && newValue !== "";
                    break;
                case "author":
                    isBetter = oldValue == "" && newValue !== "" && newValue !== "账号已注销";
                case "parts":
                    isBetter = oldValue.length < 2 && newValue.length > 1;
                    break;
                case "tid":
                    isBetter = (!oldValue) && (!!newValue);
                    break;
                case "thumb_up":
                case "coin":
                case "reply":
                    isBetter = (!!newValue) && newValue > oldValue;
                    break;
                default:
                    // do nothing
            }
            if (isBetter) {
                this.set(avid, key, newValue);
                return newValue;
            } else {
                return oldValue;
            }
        },
        export: function() {
            return JSON.stringify(this.get());
        },
        import: function(str) {
            let incremental = str[0] == "+";
            if (incremental) str = str.slice(1);
            let json = JSON.parse(str);
            if (typeof json !== "object") {
                throw "JSON格式不正确";
            } else {
                for (let avid in json) {
                    if (typeof json[avid] !== "object")
                        throw "JSON格式不正确";
                    if (json[avid].success == true) {
                        json[avid].archive = "bp";
                    }
                    delete json[avid].success;
                }
            }
            if (incremental) {
                for (let avid in json) {
                    this.set(avid, json[avid]);
                }
            } else {
                this.clear();
                this.set(json);
            }
        }
    };

    const categoriesArray = [["全部分区", 0], ["动画", 1], ["音乐", 3], ["游戏", 4], ["娱乐", 5], ["电视剧", 11], ["番剧", 13], ["单机游戏", 17], ["Mugen", 19], ["宅舞", 20], ["日常", 21], ["鬼畜调教", 22], ["电影", 23], ["MAD·AMV", 24], ["MMD·3D", 25], ["音MAD", 26], ["综合", 27], ["原创音乐", 28], ["音乐现场", 29], ["VOCALOID·UTAU", 30], ["翻唱", 31], ["完结动画", 32], ["连载动画", 33], ["完结剧集", 34], ["知识", 36], ["人文·历史", 37], ["演讲·公开课", 39], ["短片·手书", 47], ["资讯", 51], ["演奏", 59], ["网络游戏", 65], ["综艺", 71], ["动物综合", 75], ["美食制作", 76], ["其他国家", 83], ["小剧场", 85], ["特摄", 86], ["数码", 95], ["星海", 96], ["机械", 98], ["鬼畜", 119], ["GMV", 121], ["野生技术协会", 122], ["社科·法律·心理", 124], ["人力VOCALOID", 126], ["教程演示", 127], ["舞蹈", 129], ["音乐综合", 130], ["Korea相关", 131], ["音游", 136], ["明星综合", 137], ["搞笑", 138], ["欧美电影", 145], ["日本电影", 146], ["华语电影", 147], ["官方延伸", 152], ["国产动画", 153], ["舞蹈综合", 154], ["时尚", 155], ["舞蹈教程", 156], ["美妆护肤", 157], ["穿搭", 158], ["时尚潮流", 159], ["生活", 160], ["手工", 161], ["绘画", 162], ["运动", 163], ["健身", 164], ["广告", 165], ["国创", 167], ["国产原创相关", 168], ["布袋戏", 169], ["资讯", 170], ["电子竞技", 171], ["手机游戏", 172], ["桌游棋牌", 173], ["其他", 174], ["汽车生活", 176], ["纪录片", 177], ["科学·探索·自然", 178], ["军事", 179], ["社会·美食·旅行", 180], ["影视", 181], ["影视杂谈", 182], ["影视剪辑", 183], ["预告·资讯", 184], ["国产剧", 185], ["海外剧", 187], ["科技", 188], ["电脑装机", 189], ["摄影摄像", 190], ["影音智能", 191], ["风尚标", 192], ["MV", 193], ["电音", 194], ["动态漫·广播剧", 195], ["街舞", 198], ["明星舞蹈", 199], ["国风舞蹈", 200], ["科学科普", 201], ["资讯", 202], ["热点", 203], ["环球", 204], ["社会", 205], ["综合", 206], ["财经商业", 207], ["校园学习", 208], ["职业职场", 209], ["手办·模玩", 210], ["美食", 211], ["美食侦探", 212], ["美食测评", 213], ["田园美食", 214], ["美食记录", 215], ["鬼畜剧场", 216], ["动物圈", 217], ["喵星人", 218], ["汪星人", 219], ["动物二创", 220], ["野生动物", 221], ["小宠异宠", 222], ["汽车", 223], ["汽车文化", 224], ["汽车极客", 225], ["智能出行", 226], ["购车攻略", 227], ["人文历史", 228], ["设计·创意", 229], ["软件应用", 230], ["计算机技术", 231], ["科工机械", 232], ["极客DIY", 233], ["运动", 234], ["篮球", 235], ["竞技体育", 236], ["运动文化", 237], ["运动综合", 238], ["家居房产", 239], ["摩托车", 240], ["娱乐杂谈", 241], ["粉丝创作", 242], ["乐评盘点", 243], ["音乐教学", 244], ["赛车", 245], ["改装玩车", 246], ["新能源车", 247], ["房车", 248], ["足球", 249], ["出行", 250], ["三农", 251], ["仿妆cos", 252], ["动漫杂谈", 253], ["亲子", 254], ["手势·网红舞", 255], ["短片", 256], ["配音", 257], ["汽车知识科普", 258], ["版权内容", -24]];
    const categoriesDictReversed = Object.fromEntries(categoriesArray);
    const categoriesDict = Object.fromEntries(categoriesArray.map(x => x.reverse()));

    var XOR_CODE = 23442827791579n;
    var MASK_CODE = 2251799813685247n;
    var BASE = 58n;
    var CHAR_TABLE = "FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf";

    function bv2av(bvid) {
        const bvidArr = Array.from(bvid);
        [bvidArr[3], bvidArr[9]] = [bvidArr[9], bvidArr[3]];
        [bvidArr[4], bvidArr[7]] = [bvidArr[7], bvidArr[4]];
        bvidArr.splice(0, 3);
        const tmp = bvidArr.reduce((pre, bvidChar) => pre * BASE + BigInt(CHAR_TABLE.indexOf(bvidChar)), 0n);
        return Number((tmp & MASK_CODE) ^ XOR_CODE);
    }

    async function fetchJSON(url) {
        if (isDebug) console.log(`[bilibili-fav-fix] fetchJSON for ${url}`);
        let res = await GM.xmlHttpRequest({
            method: 'GET',
            url: url,
            responseType: "json"
        }).catch(e => {
            console.error(e);  // e里含有网络请求对象，res里不含
        });
        if (isDebug) console.log(res);
        if (!res) {
            tipError(`收藏夹修复错误：${url} 网站无法访问，可能需要检查网络连接并手动刷新重试`);
            return null;
        } else if (res.status == 502 || res.status == 503) {  // jijidown 和 biliplus 的常见错误，应该是请求过于频繁
            console.error(`[bilibili-fav-fix] network connection with status code ${res.status}: ${url}`);
            if (url.includes("biliplus")) {  // 让返回值可以被优雅地解读为请求过快并处理
                return {code: -503};
            } else if (url.includes("jijidown")) {
                return {code: 0};
            }
        } else if (res.status !== 200) {
            console.error(`[bilibili-fav-fix] network connection with status code ${res.status}: ${url}`);
            // tipError(`收藏夹修复错误：${url} 网站无法访问（错误代码${res.status}），可能需要检查网络连接并手动刷新重试`);
            return null;
        } else if (res.response == undefined) {
            console.error(`[bilibili-fav-fix] website not responding in a valid JSON format: ${url}`);
            tipError(`收藏夹修复错误：${url} 网站返回的数据格式不正确`);
            return null;
        } else {
            return res.response;
        }
    }

    async function fetchHTMLDoc(url) {
        if (isDebug) console.log(`[bilibili-fav-fix] fetchHTML for ${url}`);
        let res = await GM.xmlHttpRequest({
            method: 'GET',
            url: url,
            redirect: "manual",
            cookiePartition: {
                topLevelSite: 'https://xbeibeix.com'
            }
        }).catch(e => {
            console.error(e);  // e里含有网络请求对象，res里不含
        });
        if (isDebug) console.log(res);
        if (!res) {
            tipError(`收藏夹修复错误：${url} 网站无法访问，可能需要检查网络连接并手动刷新重试`);
            return null;
        } else if (res.status == 403) {
            if (isDebug) console.log(`[bilibili-fav-fix] network connection with status code ${res.status}: ${url}`);
            return "verifyHuman";
        } else if ((res.status == 301 || res.status == 302) && res.responseHeaders.match(/\nlocation:\/\r?\n/i)) {
            if (isDebug) console.log(`[bilibili-fav-fix] network connection redirected to homepage: ${url}`);
            return "redirected";
        } else if (res.status !== 200) {
            console.error(`[bilibili-fav-fix] network connection with status code ${res.status}: ${url}`);
            // tipError(`收藏夹修复错误：${url} 网站无法访问（错误代码${res.status}），可能需要检查网络连接并手动刷新重试`);
            return null;
        } else {
            try {
                let doc = new DOMParser().parseFromString(res.responseText, 'text/html');
                if (isDebug) console.log(doc);
                return doc;
            } catch (e) {
                console.error(`[bilibili-fav-fix] website not responding in a valid HTML format: ${url}`);
                tipError(`收藏夹修复错误：${url} 网站返回的数据格式不正确`);
                return null;
            }
        }
    }


    // 脚本主入口
    // 函数调用逻辑：
    // * handleFavorites 调用 startBilibiliApiQuery startBiliplusQuery 和 queryCached （如果命中缓存）
    // * startBiliplusQuery 调用 queryHit （如果查询有结果）和 startJijidownQuery （如果查询无结果）
    // * startJijidownQuery 调用 queryHit （如果查询有结果）和 queryFailed （如果查询无结果）
    // * 已弃用：原 startXbeibeixQuery 调用 queryHit （如果查询有结果）和 queryFailed （如果查询无结果）
    // * queryHit 条件性调用 refineBiliplusQuery （如果有 refine 需求）
    // * queryFailed 调用 queryCached
    // * queryCached 条件性调用 refineBiliplusQuery （如果有 refine 需求）
    // * startBilibiliApiQuery 设定是否需要 refine 的条件，且条件性调用 recoverHiddenItems
    // * 最终负责执行的是 setTitleLink setTitleText setCoverPic setTooltip replaceTooltip replaceAuthorText 等等
    function handleFavorites() {
        if (isDebug) console.log(`[bilibili-fav-fix] isNewUI: ${isNewUI}`);

        // 失效收藏节点集
        let $allItems = getAllItems().toArray().map(item => $(item));
        let $targetItems = [];
        if (isNewUI) {
            $targetItems = $allItems.filter($item => $item.find(".bili-video-card__title a").first().text() == "已失效视频");
        } else if ($("ul.fav-video-list.content").length > 0) {
            $targetItems = $allItems.filter($item => $item.hasClass("disabled"));
        } else {
            console.error('[bilibili-fav-fix] B站网页样式无法识别');
        }

        if ($targetItems.length > 0 || NTotalItems == undefined || $allItems.length < NTotalItems) {
            if ($targetItems.length > 0)
                console.log(`[bilibili-fav-fix] ${$targetItems.length}个失效收藏待修复...`);
            if (NTotalItems == undefined) {
                if (isDebug) console.log(`[bilibili-fav-fix] 潜在可能有被隐藏的收藏待修复...`);
            } else if ($allItems.length < NTotalItems) {
                console.log(`[bilibili-fav-fix] ${NTotalItems - $allItems.length}个被隐藏的收藏待修复...`);
            }

            // 预处理 $allItems $targetItems 移除多余元素和样式 添加功能菜单
            $allItems.forEach(function($item) {
                setupItem($item);
            });
            $targetItems.forEach(function($item) {
                if (isDebug) console.log(`[bilibili-fav-fix] item needed to fix: ${$item.attr("bvid")} ( ${$item.attr("avid")} )`);
                // 移除无效的备用封面（有一版B站UI用过这种设计）
                $item.find("source").remove();
                // 移除旧UI的禁用样式
                if (!isNewUI) {
                    $item.removeClass("disabled");
                    getCoverElem($item).removeClass("disabled")
                    getTitleElem($item).removeClass("disabled");
                }
                // 添加功能菜单
                addCopyAVIDButton($item);
                addCopyBVIDButton($item);
                addCopyInfoButton($item);
                addOpenPicButton($item);
                addSaveLoadCacheButton($item);
                // addDeleteThisButton($item);
            });

            startBilibiliApiQuery($targetItems, $allItems);

            // 分离已缓存条目和待查询条目
            let $queryItems = {};
            $targetItems.forEach(function($item) {
                const avid = $item.attr("avid");
                let c = cache.get(avid);
                if (c && c.archive !== undefined) {  // c.archive 无论是 bp jj 还是 nohit ，都表明biliplus或jijidown的查询结果都已保存在cache中
                    queryCached($item, avid, c);
                } else {  // 完全没查询过，或者只保存了biliAPI的查询结果，未查清、缓存biliplus或jijidown的查询结果
                    $queryItems[avid] = $item;
                }
            });

            if (Object.keys($queryItems).length > 0)
                startBiliplusQuery($queryItems);
        }
    }

    async function startBiliplusQuery($queryItems) {
        let avids = Object.keys($queryItems);
        if (isDebug) console.log(`[bilibili-fav-fix] startBiliplusQuery for ${avids.length} items: ${avids.join(', ')}`);
        for (let $item of Object.values($queryItems)) {
            setTitleText($item, "正在查询 biliplus ...");
        }
        const json = await fetchJSON(`https://www.biliplus.com/api/aidinfo?aid=${avids.join(',')}`);
        if (!json) {  // 由于网络请求遇到故障中断、网站暂时下线等，重试也无益，姑且尝试jijidown，不代表biliplus上真的没数据
            startJijidownQuery($queryItems, false);
        } else if (json.code == -503) {  // 请求过快，手动点击重试
            if (isDebug) console.log(`[bilibili-fav-fix] biliplus 请求过快 for ${avids.length} items: ${avids.join(', ')}`);
            for (let $item of Object.values($queryItems)) {
                setTitleRetry($item, {items: $queryItems}, function(event) {
                    event.preventDefault();
                    let $queryIts = event.data.items;  // 取出成局部变量，以便.off()时销毁event.data，函数结束后亦销毁局部变量
                    for (let $it of Object.values($queryIts)) {
                        getTitleElem($it).off("click");
                    }
                    startBiliplusQuery($queryIts);
                });
            }
        } else if (json.code !== 0) {  // json.code == -404 全无记录 -403 访问权限不足（up主隐藏）
            if (isDebug) console.log(`[bilibili-fav-fix] biliplus no results for ${avids.length} items: ${avids.join(', ')}`);
            startJijidownQuery($queryItems);
        } else {  // 至少部分avid有记录
            if (isDebug) console.log(`[bilibili-fav-fix] biliplus has ${Object.keys(json.data).length} hits`);
            for (let avid in json.data) {
                if (isDebug) console.log(`[bilibili-fav-fix] biliplus retrieved info for ${avid}`);
                let info = json.data[avid];
                let $item = $queryItems[avid];
                let pic = cache.update(avid, "pic", info.pic);
                queryHit($item, avid, info.title, pic, info.author, "bp");
                if (!/bfs\/archive/i.test(pic)) {  // 极大概率是失效的旧图片链接
                    if (isDebug) console.log(`[bilibili-fav-fix] query for better pic for ${avid}`);
                    startJijidownQuery(Object.fromEntries([[avid, $item]]), false, true);
                }
                delete $queryItems[avid];
            }
            if (Object.keys($queryItems).length > 0)
                startJijidownQuery($queryItems);
        }
    }


    function startJijidownQuery($queryItems, isDecisive = true, isForPic = false, silent = true) {
        if (isDebug) console.log(`[bilibili-fav-fix] startJijidownQuery for ${Object.keys($queryItems).length} items`);
        for (let [avid, $item] of Object.entries($queryItems)) {  // 并发网络请求 for 循环
            if (isDebug) console.log(`[bilibili-fav-fix] startJijidownQuery for ${avid}`);
            if (!isForPic) {
                setTitleText($item, "正在查询 jijidown ...");
            } else if (!silent) {
                setTitleText($item, "正从 jijidown 查询封面图 ...");  // 若仅查找封面图则意味着标题已找到，默认不改动显示标题，除非需要重置已修改的标题
            }
            fetchJSON(`https://www.jijidown.com/api/v1/video/get_info?id=${avid}`)
                .then(json => {
                    if (!json) {  // 由于网络请求遇到故障中断、网站暂时下线等，重试也无益
                        // startXbeibeixQuery($item, avid, false, isForPic, silent);
                        if (!isForPic) {
                            queryFailed($item, avid);
                        } else {
                            if (!silent) setTitleText($item, cache.get(avid, "title"), true);
                        }
                    } else if (json.code == 0 || json.upid == undefined) {  // 大概率是请求过快
                        if (isDebug) console.log(`[bilibili-fav-fix] jijidown 请求过快 ${avid}`);
                        setTitleRetry($item, {item: $item}, function(event) {
                            event.preventDefault();
                            let $it = event.data.item;  // 取出成局部变量，以便.off()时销毁event.data，函数结束后亦销毁局部变量
                            $(this).off("click");
                            startJijidownQuery(Object.fromEntries([[$it.attr("avid"), $it]]), isDecisive, isForPic, false);
                        });
                    } else if (json.upid == -1 || json.upid == 0 || json.title == "视频去哪了呢？" || json.title == "该视频或许已经被删除了" || (json.title == avid && json.img == "")) {
                        if (isDebug) console.log(`[bilibili-fav-fix] jijidown failed for ${avid}`);
                        // startXbeibeixQuery($item, avid, isDecisive, isForPic, silent);
                        if (isDecisive) cache.update(avid, "archive", "nohit");
                        if (!isForPic) {
                            queryFailed($item, avid);
                        } else {
                            if (!silent) setTitleText($item, cache.get(avid, "title"), true);
                        }
                    } else {
                        if (isDebug) console.log(`[bilibili-fav-fix] jijidown retrieved info for ${avid}`);
                        let pic = cache.update(avid, "pic", json.img);
                        if (!isForPic) {
                            queryHit($item, avid, json.title, pic, json.up.author, isDecisive ? "jj" : undefined);
                        } else {
                            if (!silent) setTitleText($item, cache.get(avid, "title"), true);
                            setCoverPic($item, pic, cache.get(avid, "ff"));
                            if (/bfs\/archive/i.test(pic))
                                if (isDebug) console.log(`[bilibili-fav-fix] jijidown got better pic for ${avid}`);
                        }
                        if (!/bfs\/archive/i.test(pic)) {  // 极大概率是失效的旧图片链接
                            // if (isDebug) console.log(`[bilibili-fav-fix] query for better pic for ${avid}`);
                            // startXbeibeixQuery($item, avid, false, true);
                            if (isDebug) console.log(`[bilibili-fav-fix] jijidown failed for valid pic for ${avid}`);
                            // 终止封面图查询
                        }
                    }
                });
        }
    }


    async function startXbeibeixQuery($item, avid, isDecisive = true, isForPic = false, silent = true) {
        if (isDebug) console.log(`[bilibili-fav-fix] startXbeibeixQuery for ${avid}`);
        if (!isForPic) {
            setTitleText($item, "正在查询 xbeibeix ...");
        } else if (!silent) {
            setTitleText($item, "正从 xbeibeix 查询封面图 ...");  // 若仅查找封面图则意味着标题已找到，默认不改动显示标题，除非需要重置已修改的标题
        }
        const doc = await fetchHTMLDoc(`https://xbeibeix.com/video/${$item.attr("bvid")}`);
        if (!doc) {
            if (!isForPic) {
                queryFailed($item, avid);
            } else {
                if (!silent) setTitleText($item, cache.get(avid, "title"), true);
            }
        } else if (doc == "redirected") {
            if (isDebug) console.log(`[bilibili-fav-fix] xbeibeix failed for ${avid}`);
            if (isDecisive) cache.update(avid, "archive", "nohit");
            if (!isForPic) {
                queryFailed($item, avid);
            } else {
                if (!silent) setTitleText($item, cache.get(avid, "title"), true);
            }
        } else if (doc == "verifyHuman" || doc.querySelector('meta[name="robots"]')) {
            if (isDebug) console.log(`[bilibili-fav-fix] xbeibeix need to verify human for ${$item.attr("bvid")} ( ${avid} )`);
            getTitleElem($item).addClass("verifyHuman");
            setTitleText($item, "请点击验证真实人类，而后关闭该标签页");
            getTitleElem($item).on("click", {item: $item}, function(event) {
                event.preventDefault();
                let $it = event.data.item;
                if ($(this).hasClass("verifyHuman")) {
                    const tab = GM_openInTab(`https://xbeibeix.com/video/${$it.attr("bvid")}`, {active: true, insert: true, setParent: true});
                    tab.onclose = function() {
                        if (isDebug) console.log(`[bilibili-fav-fix] human verification completed for ${$it.attr("bvid")} ( ${avid} )`);
                        let $titleElems = $(".verifyHuman");
                        $titleElems.removeClass("verifyHuman");
                        $titleElems.trigger("click");
                    };
                } else {
                    $(this).off("click");
                    startXbeibeixQuery($it, avid, isDecisive, isForPic, false);
                }
            });
        } else {
            if (isDebug) console.log(`[bilibili-fav-fix] xbeibeix retrieved info for ${avid}`);
            let title = doc.querySelector(".fw-bold").textContent;
            let pic = cache.update(avid, "pic", doc.querySelector("img.img-thumbnail").getAttribute("src"));
            let author = doc.querySelector("input").getAttribute("value");
            if (!isForPic) {
                queryHit($item, avid, title, pic, author, isDecisive ? "bb" : undefined);
            } else {
                if (!silent) setTitleText($item, cache.get(avid, "title"), true);
                setCoverPic($item, pic, cache.get(avid, "ff"));
                if (/bfs\/archive/i.test(pic))
                    if (isDebug) console.log(`[bilibili-fav-fix] xbeibeix got better pic for ${avid}`);
            }
            if (!/bfs\/archive/i.test(pic)) {  // 极大概率是失效的旧图片链接
                if (isDebug) console.log(`[bilibili-fav-fix] xbeibeix failed for valid pic for ${avid}`);
                // 终止封面图查询
            }
        }
    }


    function queryHit($item, avid, title, pic, author, archive) {
        if (isDebug) console.log(`[bilibili-fav-fix] queryHit for ${avid}`);
        // 检查refine需求
        if (archive == "bp") {
            if ($item.attr("_refineParts") == "needRefine") {
                $item.attr("_refineParts", "");
                refineBiliplusQuery($item, avid);
            } else {
                $item.attr("_refineParts", "canRefine");
            }
        }
        // 仅在hit函数时才更新archive，failed或cached时在调用函数前更新
        cache.update(avid, "archive", archive);  // 取值bp jj 或undefined
        // 设置超链接
        if (archive == "bp") {
            setTitleLink($item, `https://www.biliplus.com/video/av${avid}/`);
        } else if (archive == "jj") {
            setTitleLink($item, `https://www.jijidown.com/api/v1/video/get_info?id=${avid}`);
        } else if (archive == "bb") {
            setTitleLink($item, `https://xbeibeix.com/video/${$item.attr("bvid")}`);
        }  // 明明是queryHit 但却archive==undefined以至于没有coverLink的情况存在，就是biliplus网络故障中断，暂由jijidown得到hit的时候
        // 设置标题
        cache.update(avid, "title", title);
        setTitleText($item, title, true);
        getTitleElem($item).attr("_handover", "true");
        replaceTooltip($item, /\n标题：.*\n/, `\n标题：${title}\n`);  // 总是替换标题，不管浮块是否生成

        // 设置封面图
        pic = cache.update(avid, "pic", pic);
        setCoverPic($item, pic, cache.get(avid, "ff"));

        // 设置up主名称
        if ($item.attr("_author") == "needAuthor") {  // 仅当biliAPI获取不到up名称时替换up名称
            cache.update(avid, "author", author);
            replaceTooltip($item, /\nUP主：.* （https:\/\/space\.bilibili\.com/, `\nUP主：${author} （https://space.bilibili.com`);
            replaceAuthorText($item, author);
        } else {
            $item.attr("_author", author);  // 默认不进入缓存，因为不知道biliAPI是否返回“账号已注销”
        }
    }


    function queryFailed($item, avid) {
        if (isDebug) console.log(`[bilibili-fav-fix] queryFailed for ${avid}`);
        let c = cache.get(avid) || {};
        queryCached($item, avid, c);
    }


    function queryCached($item, avid, c) {
        if (isDebug) console.log(`[bilibili-fav-fix] queryCached for ${avid}`);
        // 检查refine需求
        if (c.archive == "bp") {
            if ($item.attr("_refineParts") == "needRefine") {
                $item.attr("_refineParts", "");
                refineBiliplusQuery($item, avid);
            } else {
                $item.attr("_refineParts", "canRefine");
            }
        }
        // 设置超链接
        if (c.archive == "bp") {
            setTitleLink($item, `https://www.biliplus.com/video/av${avid}/`);
        } else if (c.archive == "jj") {
            setTitleLink($item, `https://www.jijidown.com/api/v1/video/get_info?id=${avid}`);
        } else if (c.archive == "bb") {
            setTitleLink($item, `https://xbeibeix.com/video/${$item.attr("bvid")}`);
        }
        // 设置标题
        if (c.title) {  // 有缓存title则先显示，可能会被biliAPI之后修改
            setTitleText($item, c.title, true);  // 仅当成功恢复时修改样式
        } else if (getTitleElem($item).attr("_noguesses") == "true") {  // 没有缓存，biliAPI也没有
            setTitleText($item, `查不到标题（${avid}）【鼠标悬停查看简介】`);
        } else {  // 没有缓存，但biliAPI之后可能有
            setTitleText($item, `正在查询 bilibili API ...`);
        }
        getTitleElem($item).attr("_handover", "true");

        // 设置封面图
        setCoverPic($item, c.pic, c.ff);
    }


    async function refineBiliplusQuery($item, avid, retry = 0) {
        if (isDebug) console.log(`[bilibili-fav-fix] refineBiliplusQuery for ${avid}`);
        const json = await fetchJSON(`https://www.biliplus.com/api/view?id=${avid}`);
        if (!json) {  // 网络连接故障中断或JSON格式错误
            return;
        } else if (json.code == -503) {  // 请求过快
            if (retry < 2) {  // 仅自动重试两次，但由于needRefine始终存在，以后还会有重试的机会
                if (isDebug) console.log(`[bilibili-fav-fix] refineBiliplusQuery 请求过快，10秒后重试`);
                setTimeout(refineBiliplusQuery, 10000, $item, avid, retry + 1);
            }
            return;
        } else if (json.code == -404) {  // 查询无结果
            return;
        } else if (json.code == -403) {  // 访问权限不足（up主隐藏）
            return;
        }
        if (json.list && json.list.length > 1) {
            if (isDebug) console.log(`[bilibili-fav-fix] refined biliplus got ${json.list.length} parts for ${avid}`);
            let parts = json.list.map(x => x.part);
            parts = cache.update(avid, "parts", parts);
            let partsStr = parts.map(part => `* ${part}\n`).join('');
            replaceTooltip($item, "\n播放数：", `\n子P标题：\n${partsStr}播放数：`);
        }
        if (Number(json.tid)) {
            let tid = cache.update(avid, "tid", Number(json.tid));
            replaceTooltip($item, /\n分区：.*\n/, `\n分区：${categoriesDict[tid]}\n`);
        }
        if (Number(json.coins)) {
            let coin = cache.update(avid, "coin", Number(json.coins));
            let content = getCoverElem($item).attr("title");
            if (content && content.includes("\n投币数：")) {
                replaceTooltip($item, /\n投币数：.*\n/, `\n投币数：${coin}\n`);
            } else {
                replaceTooltip($item, "\n失效原因：", `\n投币数：${coin}\n失效原因：`)
            }
        }
        if (Number(json.review)) {
            let reply = cache.update(avid, "reply", Number(json.review));
            let content = getCoverElem($item).attr("title");
            if (content && content.includes("\n回复数：")) {
                replaceTooltip($item, /\n回复数：.*\n/, `\n回复数：${reply}\n`);
            } else {
                replaceTooltip($item, "\n失效原因：", `\n回复数：${reply}\n失效原因：`)
            }
        }
        // 将first_frame更新成备用的封面图，但其实没多大用。如果biliplus和jijidown都返回无效的pic那么基本找不到ff，如果有ff那么基本上pic都是有效的
        if (json.v2_app_api && json.v2_app_api.first_frame) {
            let ff = json.v2_app_api.first_frame;
            if (isDebug) console.log(`[bilibili-fav-fix] refined biliplus got first_frame pic for ${avid}: ${ff}`);
            ff = cache.update(avid, "ff", ff);
            const $imgElem = getImgElem($item);
            if ($imgElem.attr("alt") == "图片链接失效") {  // pic已经被替换进img元素，且执行替换时无ff
                $imgElem.attr("alt", " ");
                $(`<img src="${ff}" alt="图片链接失效"/>`).insertAfter($imgElem);
            } else if ($imgElem.attr("alt") == " ") {  // pic已经被替换进img元素，且执行替换时有ff
                $imgElem.next().attr("src", ff);
            } else {  // pic未被替换进img元素
                // do nothing
            }
        }
    }


    async function startBilibiliApiQuery($targetItems, $allItems) {
        if (isDebug) console.log(`[bilibili-fav-fix] startBilibiliApiQuery for ${$targetItems.length} targetItems, ${$allItems.length} allItems and ${NTotalItems} totalItems`);
        let apiType;
        if (isNewUI) {
            apiType = $("div.favlist-info-detail .status").text().trim();
        } else {
            apiType = $("div.favInfo-details > div:nth-child(3) > span:nth-child(3)").text().trim();
        }
        if (apiType == "公开") {
            apiType = "public";
        } else if (apiType == "私密") {
            apiType = "private";
        } else {
            apiType = "public";  // 例如旧UI等未能一一适配的情况，先从 public 开始尝试
        }

        let fid = window.location.href.match(/fid=(\d+)/i);
        let mid = window.location.href.match(/bilibili\.com\/(\d+)\/favlist/i)[1];
        if (fid) {
            fid = fid[1];
        } else if (isNewUI) {
            fid = $("div.fav-sidebar-item:has(.vui_sidebar-item--active)").first().attr("id");
        } else {
            fid = $("li.fav-item.cur").first().attr("fid");
        }
        if (!fid) {
            let json = await fetchJSON(`https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${mid}`);
            if (!json) return;
            fid = json.data.list[0].id;
        }

        let pn;
        if (isNewUI) {
            pn = $("div.vui_pagenation--btns .vui_button.vui_button--active").text().trim();
        } else {
            pn = $("ul.be-pager li.be-pager-item.be-pager-item-active").text().trim();
        }
        if (!pn) pn = 1;

        let url = getBilibiliApiUrl(fid, pn, apiType, 1);

        let origFid = fid;
        let mixedSearch = !url.includes("&keyword=&") && url.includes("&type=1&");  // 在全部收藏夹里搜索
        if (mixedSearch) {
            if (isDebug) console.log(`[bilibili-fav-fix] detected: keyword search in all favorites, fetch public fav`);
            let json = await fetchJSON(`https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${mid}`);
            if (!json) return;  // TODO: (!json)时的下位替代
            let publicFavs = json.data.list.filter(fav => fav.attr % 2 == 0);
            if (publicFavs.length == 0) return;  // TODO: (publicFavs.length == 0)时的下位替代
            fid = publicFavs[0].id;  // 随便取一个公开收藏夹的fid
            apiType = "public";
            url = getBilibiliApiUrl(fid, pn, apiType, 1);
        }

        let json = await fetchJSON(url);
        if (!json) return;

        if (json.code !== 0) {  // -403 访问权限不足
            if (apiType == "public") {
                console.warn(`[bilibili-fav-fix] bilibili public API failed, now use private API`);
                mixedSearch = false;  // 退回
                fid = origFid;
                apiType = "private";
                url = getBilibiliApiUrl(fid, pn, apiType, 1);
                json = await fetchJSON(url);
                if (!json) return;
            }
            if (json.code !== 0) {
                console.warn(`[bilibili-fav-fix] bilibili private API failed`);
                $targetItems.forEach(function($item) {
                    getTitleElem($item).attr("_noguesses", "true");  // biliAPI 未能成功获取任何信息
                });
                return;
            }
        }

        // 旧的对公开收藏夹的非鉴权API只接受最多数值20的ps参数，与B站新UI渲染时的一页40个视频不相符，需要分成两个part的网络请求来查询
        if (isNewUI && apiType == "public") {
            let json2 = await fetchJSON(getBilibiliApiUrl(fid, pn, apiType, 2));
            if (!json2) return;
            if (json2.data?.medias) {
                // .medias可以undefined，但如果json2有，那么json也有
                for (let i = 0; i < json2.data.medias.length; i++) {
                    json.data.medias[i+20] = json2.data.medias[i];
                }
                // 如果窗口宽度超过1760，B站新UI渲染还会变成6乘6，有时需要分成三个part的网络请求
                // fetchPart=1,2 for pn%5=1,5; fetchPart=1,2,3 for pn%5=2,3,4
                if (isWideScreen && (pn % 5 !== 0) && (pn % 5 !== 1)) {
                    let json3 = await fetchJSON(getBilibiliApiUrl(fid, pn, apiType, 3));
                    if (!json3) return;
                    if (json3.data?.medias) {
                        for (let i = 0; i < json3.data.medias.length; i++) {
                            json.data.medias[i+40] = json3.data.medias[i];
                        }
                    }
                }
            }
            if (isWideScreen) {
                let start = (pn % 5) == 1 ? 0 : (5 - (pn - 1) % 5) * 4;
                json.data.medias = json.data.medias.slice(start, start+36);
            }
        }

        let medias = json?.data?.medias || [];  // .medias可以undefined

        if (mixedSearch) {
            if (isDebug) console.log(`[bilibili-fav-fix] also fetch private fav for complement`);
            // 使用privateAPI得到B站搜索原本展示的视频列表（包含私密收藏夹内容），以此为base，将publicAPI（不含私密收藏夹内容但包含up主隐藏视频）的丰富信息更新、替换上去
            let json = await fetchJSON(getBilibiliApiUrl(fid, pn, "private", 1));
            if (!json) return;
            let baseMedias = json.data.medias;
            let i = -1;
            for (let media of medias) {
                let match = baseMedias.map(m => m.id).indexOf(media.id);
                if (match == -1) {
                    // 在publicAPI medias里面 而不在privateAPI baseMedia（实际展示）里面
                    if (media.rights?.autoplay == 0) {  // up主隐藏视频
                        i = i+1;
                        baseMedias.splice(i, 0, media);
                        if (isDebug) console.log(`[bilibili-fav-fix] ${i} ${media.title} inserted`);
                    } else {  // 并非隐藏，仅仅是不出现在这一页的privateAPI搜索结果中而已
                        if (isDebug) console.log(`[bilibili-fav-fix] ${media.title} ignored (not hidden, just not on this page)`);
                    }
                } else {
                    i = match;
                    baseMedias.splice(i, 1, media);
                    if (isDebug) console.log(`[bilibili-fav-fix] ${i} ${media.title} replaced`);
                }
            }
            medias = baseMedias;
        }

        NTotalItems = medias.length;
        if (isDebug) console.log(`[bilibili-fav-fix] ${NTotalItems} items in total, ${$allItems.length} items visible`);

        if (apiType == "public" && $allItems.length < NTotalItems)
            recoverHiddenItems($allItems, medias, $targetItems);

        // showDetails($targetItems, medias)
        $targetItems.forEach(function($item) {
            const bvid = $item.attr("bvid");
            const avid = $item.attr("avid");
            if (isDebug) console.log(`[bilibili-fav-fix] showDetails: ${bvid} (${avid})`);

            let media = medias.filter(m => m.bvid == bvid);
            if (media.length > 0) {
                media = media[0];
                if (isDebug) console.log(media);
            } else {
                console.error(`[bilibili-fav-fix] ${bvid} not found in Bilibili API JSON (wrong params?): ${getBilibiliApiUrl(fid, pn, apiType, 1)}`);
                return;
            }

            // 设置标题
            if (media.title == "" || media.title == "已失效视频")
                if (media.page == 1 && media.pages && media.pages.length == 1 && media.pages[0].title !== "" && media.pages[0].title !== "已失效视频")
                    media.title = media.pages[0].title + titleGuessSuffix;  // 从分P 的第一P 的 title 推测
            media.title = cache.update(avid, "title", media.title);  // 潜在的第一P标题会可能进入缓存

            if (getTitleElem($item).attr("_handover") == "true") {  // 在biliplus和jijidown未有结果(handover)之前，title留作交互提示使用而不做改动
                if (media.title) {
                    setTitleText($item, media.title, true);
                } else {
                    setTitleText($item, `查不到标题（${avid}）【鼠标悬停查看简介】`);
                }
            }
            if (!media.title) getTitleElem($item).attr("_noguesses", "true");  // 如果biliAPI先得到信息，那么将其失败记录在案

            // 判断分P信息是否完整
            let parts = [];
            if (media.page > 1 && media.pages && media.pages.length > 1)
                parts = media.pages.map(page => page.title).filter(p => p !== "" && p !== "已失效视频");  // 从分P 信息的 title key 读取
            parts = cache.update(avid, "parts", parts);
            if (media.page == 0 || (media.page > 1 && parts.length < 2)) {
                if ($item.attr("_refineParts") == "canRefine") {
                    refineBiliplusQuery($item, avid);
                } else {
                    $item.attr("_refineParts", "needRefine");
                }
            }

            // 设置up主名称
            if (media.upper.name == "" || media.upper.name == "账号已注销") {
                media.upper.name = cache.update(avid, "author", $item.attr("_author"));  // 如果_author有内容就会进入缓存并返回
                if (media.upper.name) {
                    replaceAuthorText($item, media.upper.name);
                } else {
                    $item.attr("_author", "needAuthor");
                }
            }  // 不采用拿到name就update的做法，因为不像title和parts、从公开改成私密就马上看不见、急需缓存救急，所以只处理没有name的情况

            media.tid = cache.update(avid, "tid", media.tid);
            media.cnt_info.thumb_up = cache.update(avid, "thumb_up", media.cnt_info.thumb_up);
            media.cnt_info.coin = cache.update(avid, "coin", media.cnt_info.coin);
            media.cnt_info.reply = cache.update(avid, "reply", media.cnt_info.reply);

            let tips = $item.attr("_tips") ? $item.attr("_tips") : "（提示：尽量将收藏夹设为公开，这样能恢复更多的视频标题和分P。可以等脚本将信息自动缓存到本地后，再改回去私密收藏夹也不迟，此时依然能看到缓存好的视频修复标题）";
            setTooltip($item, media, parts, tips);

            if (!isNewUI)
                addOpenUpSpaceButton($item, media.upper.mid);
        });
    }


    function recoverHiddenItems($allItems, medias, $targetItems) {
        if (isDebug) console.log(`[bilibili-fav-fix] recovering ${NTotalItems - $allItems.length} hidden items`);
        let allBvids = $allItems.map($item => $item.attr("bvid"));

        let $queryItems = {};
        for (let i = 0; i < NTotalItems; i++) {
            let media = medias[i];
            if (allBvids.includes(media.bvid)) continue;

            if (isDebug) console.log(`[bilibili-fav-fix] recover hidden item: ${media.bvid} (${media.id})`);
            let duration = new Date(media.duration * 1000).toISOString().slice(11, 19);
            if (duration.slice(0, 2) == "00") duration = duration.slice(3);
            let favdate = new Date(media.fav_time * 1000).toLocaleDateString().replaceAll('/', '-');
            let pubdate = new Date(media.pubtime * 1000).toLocaleDateString().replaceAll('/', '-');

            // 构造新$item
            let $item;
            if (isNewUI) {
                $item = $(
`<div class="items__item bili-fav-fix-recovered-item">
  <div class="bili-video-card">
    <div class="bili-video-card__wrap">
      <div class="bili-video-card__cover">
        <a class="bili-cover-card" href="javascript:void(0);" target="_self"><div class="bili-cover-card__thumbnail"><img src="${media.cover}"></div><div class="bili-cover-card__stats"><div class="bili-cover-card__stat"><i class="sic-BDC-playdata_square_line"></i><span>${media.cnt_info.view_text_1}</span></div><div class="bili-cover-card__stat"><i class="sic-BDC-danmu_square_line"></i><span>${media.cnt_info.danmaku}</span></div><div class="bili-cover-card__stat"><span>${duration}</span></div></div></a>
        <div class="bili-card-watch-later"><div class="bili-card-watch-later__btn"><i class="sic-BDC-arrow_play_next_line" style="font-variation-settings:'strk' 1.5"></i></div><span class="bili-card-watch-later__tip">稍后再看</span></div>
        <div class="bili-card-checkbox"><div class="bili-card-checkbox__inner"></div></div>
      </div>
      <div class="bili-video-card__details">
        <div class="bili-video-card__title bili-video-card__title--pr"><a href="https://www.bilibili.com/video/${media.bvid}" target="_blank">${""}</a><div class="bili-card-dropdown"><i class="sic-BDC-more_vertical_fill" style="font-variation-settings:'strk' 1.5"></i></div></div>
        <div class="bili-video-card__subtitle"><a class="bili-video-card__author" href="https://space.bilibili.com/${media.upper.mid}" target="_blank"><div class="bili-video-card__text"><i class="sic-BDC-uploader_name_square_line"></i><span></span></div><div class="bili-video-card__text"><span title="${media.upper.name} · 收藏于${favdate}">${media.upper.name} · 收藏于${favdate}</span></div></a></div>
      </div>
    </div>
  </div>
</div>`);
            } else {
                $item = $(
`<li data-aid="${media.bvid}" class="small-item bili-fav-fix-recovered-item">
  <a href="javascript:void(0);" target="_self" class="cover cover-normal">
    <img src="${media.cover}" alt="${""}" class="cover-img">
    <span class="length">${duration}</span>
    <span class="i-watchlater"></span>
    <div class="meta-mask"><div class="meta-info"><p class="view">播放：${media.cnt_info.view_text_1}</p><p class="favorite">收藏：${media.cnt_info.collect}</p><p class="author">UP主：${media.upper.name}</p><p class="pubdate">投稿：${pubdate}</p></div></div>
    <div class="disabled-cover"><div class="candle"></div><p>视频已失效</p></div>
  </a>
  <a target="_blank" href="https://www.bilibili.com/video/${media.bvid}/" title="${""}" class="title">${""}</a>
  <div class="meta pubdate">收藏于： ${favdate}</div>
  <div class="be-dropdown video-edit">
    <div class="be-dropdown-trigger"><i title="更多操作" class="iconfont icon-ic_more"></i></div>
    <ul class="be-dropdown-menu menu-align-" style="left: 0px; top: 0px; transform-origin: center top 0px; display: none;"><li class="be-dropdown-item be-dropdown-item-delimiter">取消收藏</li><li class="be-dropdown-item">移动到</li><li class="be-dropdown-item">复制到</li></ul>
  </div>
  <div class="video-check-container" style="display: none;"><div class="video-check icon"></div></div>
</li>`);
            }
            setupItem($item);
            setTitleText($item, media.title);  // 防止字符转义，在这里插入media.title
            $item.attr("style", `border: 0; background-color:${recoveredItemColor}; box-shadow: 0 2px 30px ${recoveredItemColor}, 0 -2px 30px ${recoveredItemColor}, -2px 0 30px ${recoveredItemColor}, 2px 0 30px ${recoveredItemColor};`);

            let tips = "（提示：请点击封面从而复制视频信息。这种是被隐藏的视频，即被up主设置为“仅自己可见”的视频，常表现为“收藏夹缺了一格”，不同于被B站删除/退回的失效视频。只有在公开收藏夹中时，脚本才能将其恢复出来）";
            if (media.title !== "已失效视频" && media.title !== "" && media.pages) {
                // 构造浮块即可，无需发起查询、修复信息
                setTooltip($item, media, media.pages.map(page => page.title), tips);
            } else {
                // 如果同时既是被up主隐藏，也是被B站删除/退回的话，需要发起查询、后综合信息构造浮块
                let avid = media.id;
                let c = cache.get(avid);
                if (c && c.archive !== undefined) {
                    queryCached($item, avid, c);
                } else {
                    $queryItems[avid] = $item;
                }
                $item.attr("_tips", tips);
                $targetItems.push($item);
            }

            // 将$item插入到网页
            observer.disconnect();
            if ($allItems.length == 0) {
                $item.appendTo($rootItem);
                $rootItem.show();
                if (isNewUI) {
                    $("div.fav-list-main-empty").hide();
                } else {
                    $("div.search-empty-hint").hide();
                }
            } else {
                if (i == 0) {
                    $item.insertBefore($allItems[0]);
                } else {
                    $item.insertAfter($allItems[i-1]);
                }
            }
            observer.observe($rootItem[0], observerOptions);
            $allItems.splice(i, 0, $item);
        }

        if (Object.keys($queryItems).length > 0)
            startBiliplusQuery($queryItems);
    }


    function setTooltip($item, media, parts, tips = "") {
        if (isDebug) console.log(`[bilibili-fav-fix] setTooltip for ${media.id} ${media.title}`);
        let partsStr = parts.map(part => `* ${part}\n`).join('');
        let category = categoriesDict[media.tid];
        let duration = new Date(media.duration * 1000).toISOString().slice(11, 19);
        if (duration.slice(0, 2) == "00") duration = duration.slice(3);
        let reason = "";
        if (media.attr == 0) {
            reason = "未失效(0)";
        } else if (media.attr == 9) {
            reason = "UP主自己删除(9)";
        } else if (media.attr == 1) {
            reason = "其他原因删除/退回(1)";
        } else if (media.attr !== undefined) {
            reason = `原因编号意义未明(${media.attr})`;
        } else {
            reason = "未知";
        }

        let tooltip =
`【点击封面复制】【点击标题跳转】
AV号：${media.id}
BV号：${media.bvid}
标题：${media.title}
UP主：${media.upper.name ? media.upper.name : "账号已注销"} （https://space.bilibili.com/${media.upper.mid}）
简介：${media.intro}
分区：${category}
时长：${duration}
发布时间：${new Date(media.pubtime * 1000).toLocaleString()}
收藏时间：${new Date(media.fav_time * 1000).toLocaleString()}
${media.page > 1 ? `分P数量：${media.page}\n` : ""}${partsStr ? `子P标题：\n${partsStr}` : ""}播放数：${media.cnt_info.play}
收藏数：${media.cnt_info.collect}
弹幕数：${media.cnt_info.danmaku}
${media.cnt_info.thumb_up !== 0 ? `点赞数：${media.cnt_info.thumb_up}\n` : ""}${media.cnt_info.coin !== 0 ? `投币数：${media.cnt_info.coin}\n` : ""}${media.cnt_info.reply !== 0 ? `回复数：${media.cnt_info.reply}\n` : "" }失效原因：${reason}
${tips}`;

        const $coverElem = getCoverElem($item);
        $coverElem.attr("title", tooltip);
        $coverElem.attr("href", "javascript:void(0);");
        $coverElem.attr("target", "_self");
        $coverElem.on("click", function() {
            GM_setClipboard($(this).attr("title"), "text");
            alert("稿件信息复制成功！");
        });

    }


    function getBilibiliApiUrl(fid, pn, apiType, fetchPart) {
        if (isDebug) console.log(
`[bilibili-fav-fix] getBilibiliApiUrl
[bilibili-fav-fix] fid: ${fid}
[bilibili-fav-fix] apiType: ${apiType}
[bilibili-fav-fix] fetchPart: ${fetchPart}`);

        let order, tid;
        if (isNewUI) {
            order = $("div.fav-list-header-filter__left div.radio-filter__item--active").first().text().trim();
            tid = $("div.fav-list-header-collapse div.radio-filter__item--active").first().text().trim().replace(/\s+\d+/, "");
        } else {
            order = $("div.fav-filters > div.be-dropdown.filter-item > span").first().text().trim();
            tid = $("div.fav-filters > div:nth-child(2) > span").first().text().trim();  // 能够选择分区的旧UI似乎已经调不出来了，试过各种老UA都不行
        }
        order = Object.fromEntries([["最近收藏", "mtime"], ["最多播放", "view"], ["最新投稿", "pubtime"], ["最近投稿", "pubtime"]])[order];
        if (order === undefined) order = "mtime";    // 执行收藏夹搜索时无从得知排序，只能手动指定成“最近收藏”，不保证结果正确
        tid = categoriesDictReversed[tid];
        if (tid === undefined) tid = 0;    // 一些被下线和撤除的分区，无从得知其名称和tid，只能手动指定成“全部分区”，返回的结果很大概率不包含目标视频的数据
        if (isDebug) console.log(
`[bilibili-fav-fix] pn: ${pn}
[bilibili-fav-fix] order: ${order}
[bilibili-fav-fix] tid: ${tid}`);

        let searchType = 0;
        let keyword = "";
        if (isNewUI) {
            if ($("div.fav-list-header-filter__desc").length > 0) {
                searchType = $("div.fav-list-header-filter__right button").first().text().trim();
                searchType = Object.fromEntries([["当前", 0], ["全部", 1]])[searchType];
                keyword = encodeURIComponent($("div.fav-list-header-filter__right input").first().val());
            }
        } else {
            if ($("div.search-results-num").length > 0) {
                searchType = $("div.search-types > div.be-dropdown > div").first().text().trim();
                searchType = Object.fromEntries([["当前", 0], ["全部", 1]])[searchType];
                keyword = encodeURIComponent($("input.search-fav-input").first().val());
            }
        }
        if (searchType == undefined) searchType = 0;
        if (isDebug) console.log(
`[bilibili-fav-fix] searchType: ${searchType}
[bilibili-fav-fix] keyword: ${keyword}`);


        let ps;
        if (apiType == "public") {
            ps = 20;
            if (isNewUI) {
                if (!isWideScreen) {
                    pn = (pn-1)*2 + fetchPart;
                } else {
                    // 1-20, 21-40, 41-60, 61-80, 81-100, 101-120, 121-140, 141-160, 161-180
                    // 1-36, 37-72, 73-108, 109-144, 145-180
                    // fetchPart=1,2 for pn=1,5; fetchPart=1,2,3 for pn=2,3,4
                    pn = Math.floor((pn-1)*9/5) + fetchPart;
                }
            }
            return `https://api.bilibili.com/medialist/gateway/base/spaceDetail?media_id=${fid}&pn=${pn}&ps=${ps}&keyword=${keyword}&order=${order}&type=${searchType}&tid=${tid}&jsonp=jsonp`;
        } else if (apiType == "private") {
            ps = isNewUI ? (isWideScreen ? 36 : 40) : 20;
            return `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${fid}&pn=${pn}&ps=${ps}&keyword=${keyword}&order=${order}&type=${searchType}&tid=${tid}&platform=web`;
        }
    }


    function getAllItems() {
        if (isNewUI) {
            return $("div.fav-list-main div.items > div");
        } else {
            return $("ul.fav-video-list.content li.small-item");
        }
    }

    function setupItem($item) {
        let bvid;
        if (isNewUI) {
            bvid = getTitleElem($item).attr("href").match(/bilibili\.com\/video\/(\w+)/i)[1];
        } else {
            bvid = $item.attr("data-aid");
        }
        $item.attr("bvid", bvid);
        $item.attr("avid", bv2av(bvid));
    }

    function getCoverElem($item) {
        return $item.find("a").eq(0);
    }

    function getTitleElem($item) {
        return $item.find("a").eq(1);
    }

    function getImgElem($item) {
        return getCoverElem($item).find("img").first();
    }

    function getSubtitleElem($item) {
        if (isNewUI) {
            return $item.find("div.bili-video-card__subtitle");
        } else {
            return $item.find("div.meta.pubdate");
        }
    }

    function setTitleLink($item, url, target = "_blank") {
        const $titleElem = getTitleElem($item);
        if (url) {
            $titleElem.attr("href", url);
            $titleElem.attr("target", target);
        }
    }

    function setTitleText($item, title, markStrike = false) {
        const $titleElem = getTitleElem($item);
        $titleElem.text(title);
        $titleElem.attr("title", title);
        if (markStrike) {
            // 增加 删除线 + 置(灰)
            $titleElem.css("text-decoration", "line-through");
            $titleElem.css("color", invalTitleColor);
            // 收藏时间 + UP主（新UI） 增加 删除线
            getSubtitleElem($item).css("text-decoration", "line-through");
        } else {
            $titleElem.css("text-decoration", "");
            $titleElem.css("color", "");
            getSubtitleElem($item).css("text-decoration", "");
        }
    }

    function setTitleRetry($item, data, handler) {
        setTitleText($item, "请求过快，请点击手动加载");
        getTitleElem($item).on("click", data, handler);
    }

    function setCoverPic($item, pic, first_frame) {
        const $imgElem = getImgElem($item);
        if (pic) {
            $imgElem.attr("src", pic);
            if (first_frame) {
                $imgElem.attr("alt", " ");  // 使得当pic链接失效时img元素自动隐藏，展示后一个img元素
                $(`<img src="${first_frame}" alt="图片链接失效"/>`).insertAfter($imgElem);
            } else {
                $imgElem.attr("alt", "图片链接失效");
            }
        } else if (first_frame) {
            $imgElem.attr("src", first_frame);
            $imgElem.attr("alt", "图片链接失效");
        }
    }

    function replaceTooltip($item, from, to) {
        const $coverElem = getCoverElem($item);
        let tooltip = $coverElem.attr("title");
        if (tooltip) {
            tooltip = tooltip.replace(from, to);
            $coverElem.attr("title", tooltip);
        }
    }

    function replaceAuthorText($item, author) {
        let $authorElem;
        if (isNewUI) {
            $authorElem = $item.find(".bili-video-card__text").eq(1).find("span");
        } else {
            $authorElem = $item.find(".author");
        }
        let authorLine = $authorElem.text().replace("账号已注销", author);
        $authorElem.text(authorLine);
        $authorElem.attr("title", authorLine);
    }

    function addCopyAVIDButton($item) {
        const avid = $item.attr("avid");
        addButton($item, "复制AV号", function() {
            GM_setClipboard(avid, "text");
        }, "AV号复制成功");
    }

    function addCopyBVIDButton($item) {
        const bvid = $item.attr("bvid");
        addButton($item, "复制BV号", function() {
            GM_setClipboard(bvid, "text");
        }, "BV号复制成功");
    }

    function addCopyInfoButton($item) {
        const avid = $item.attr("avid");
        addButton($item, "复制稿件信息", function() {
            GM_setClipboard(getCoverElem(getAllItems().filter(`[avid="${avid}"]`)).attr("title"), "text");
        }, "信息复制成功");
    }

    function addOpenUpSpaceButton($item, mid) {
        addButton($item, "跳转UP主空间", function() {
            GM_openInTab(`https://space.bilibili.com/${mid}`, {active: true, insert: true, setParent: true});
        });
    }

    function addOpenPicButton($item) {
        const avid = $item.attr("avid");
        addButton($item, "查看封面图片", function() {
            let $it = getAllItems().filter(`[avid="${avid}"]`);
            let srcs = $it.find("img").map((i, item) => $(item).attr("src"));
            srcs.each(function(i, src) {
                GM_openInTab(src, {active: true, insert: true, setParent: true});
            });
        });
    }

    function addDeleteThisButton($item) {
        const avid = $item.attr("avid");
        addButton($item, "删除本条缓存", function() {
            cache.delete(avid);
        }, "缓存删除成功");
    }

    function addSaveLoadCacheButton($item) {
        addButton($item, "导出/导入缓存", function () {
            if (unsafeWindow.confirm("【导出】\n点击确定，即可将查询到的标题/封面/子P标题等的本地缓存导出至剪贴板；\n点击取消，可将之前导出的字符串用粘贴导入本地缓存。")) {
                GM_setClipboard(cache.export(), "text");
                alert("缓存导出至剪贴板成功！");
            } else {
                let input = unsafeWindow.prompt("【导入】\n将导出的字符串粘贴输入，会覆盖性导入到浏览器本地缓存。\n注意：1.错误格式的字符串可能会导入成功但脚本运行出错；\n2.如果输入内容是“ {} ”，整个本地缓存就会被空数据覆盖，即清空；\n3.如果不想覆盖本地缓存，可在前面加一个加号“ + ”前缀，实现增量导入（以视频为单位），如“ +{\"10086\": {......}, \"114514\": {......}} ”；\n4.用增量导入可以针对性地覆盖或清除特定视频缓存数据，如“ +{\"10086\": {}} ”便使得 avid 10086 的视频本地缓存被空数据覆盖，而不影响其他。");
                if (input) {
                    try {
                        cache.import(input);
                        alert("缓存导入成功！");
                    } catch (e) {
                        tipError("缓存导入失败！");
                    }
                }
            }
        });
    }

    function addButton($item, name, handler, successMsg) {
        let handler2 = handler;
        if (isNewUI) {
            if (successMsg)
                handler2 = function() {
                    handler(this);
                    $(this).text(successMsg);
                    setTimeout(function($menuItem) { $menuItem.text(name); }, 2000, $(this));
                };
            const $dropdownTrigger = $item.find(".bili-card-dropdown").first();
            $dropdownTrigger.on("mouseenter", {handler: handler2}, function(event) {
                setTimeout(function(handler) {
                    // 延时获取dropdownMenu元素，因为B站新UI动态生成该元素
                    const $dropdownMenu = $(".bili-card-dropdown-popper.visible").first();
                    if (! $dropdownMenu.find(".bili-fav-fix-menu-item").text().includes(name) ) {
                        const $menuItem = $(`<div class="bili-card-dropdown-popper__item bili-fav-fix-menu-item">${name}</div>`);
                        $menuItem.on("click", handler);
                        $dropdownMenu.append($menuItem);
                    }
                }, 500, event.data.handler);
            });
        } else {
            if (successMsg)
                handler2 = function() {
                    handler(this);
                    alert(successMsg);
                };
            const $dropdownMenu = $item.find(".be-dropdown-menu").first();
            if (! ($dropdownMenu.find(".bili-fav-fix-menu-item").text().includes(name)) ) {
                const $lastChild = $dropdownMenu.children().last();
                if (!$lastChild.hasClass('bili-fav-fix-menu-item'))  // 未添加过扩展
                    $lastChild.addClass("be-dropdown-item-delimiter");
                const $menuItem = $(`<li class="be-dropdown-item bili-fav-fix-menu-item">${name}</li>`);
                $menuItem.on("click", handler2);
                $dropdownMenu.append($menuItem);
            }
        }
    }

    function tipInfo(text) {
        tip(text, "iconInfo");
    }

    function tipError(text) {
        tip(text, "iconError");
    }

    function tipSuccess(text) {
        tip(text, "iconSuccess");
    }

    function tip(text, iconName) {
        GM_notification({
            text: text,
            image: GM_getResourceURL(iconName)
        });
    }


    // 用mutation observer监测根节点的变动，适当延时后执行主脚本
    const observerOptions = { attributes: false, childList: true, subtree: false };
    const observer = new MutationObserver(mutationList => {
        if (isDebug) console.log(`[bilibili-fav-fix] 检测到根节点变化，开始执行修复`);
        if (isDebug) console.log(mutationList);
        observer.disconnect();
        $(".bili-fav-fix-menu-item").off("click");
        if (isNewUI) {
            $(".bili-cover-card").off("click");
        } else {
            $(".cover").off("click");
        }
        $rootItem.children(".bili-fav-fix-recovered-item").remove();
        NTotalItems = undefined;
        setTimeout(function() {
            observer.observe($rootItem[0], observerOptions);
            handleFavorites();
        }, delay * 1000);
    });

    // 初始化全局变量，及首次激活observer
    const intervalID = setInterval(function() {
        if ($("div.fav-list-main div.items").length > 0) {
            if (isDebug) console.log(`[bilibili-fav-fix] 检测到B站新UI加载完成`);
            isNewUI = true;
            $rootItem = $("div.fav-list-main div.items");
        } else if ($("ul.fav-video-list.content").length > 0) {
            if (isDebug) console.log(`[bilibili-fav-fix] 检测到B站旧UI加载完成`);
            isNewUI = false;
            $rootItem = $("ul.fav-video-list.content");
        } else {
            return;
        }
        isWideScreen = window.innerWidth > 1760;
        clearInterval(intervalID);
        setTimeout(function() {
            observer.observe($rootItem[0], observerOptions);
            handleFavorites();
        }, 3000);
    }, 1000);
})();
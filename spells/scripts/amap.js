/***********************************************
 应用名称：墨鱼自用高德地图去广告脚本（已还原、可读版）
 原作者   ：@ddgksf2013（注释保留）
 更新时间  ：2025-08-30（原注）
 说明      ：清理高德地图接口响应中的广告/通知/推送字段
***********************************************/

const version = "V1.0.34";

(function main() {
  try {
    if (typeof $response === "undefined" || !$response || !$response.body) {
      // 没有响应体，直接结束
      $done({});
      return;
    }

    let obj;
    try {
      obj = JSON.parse($response.body);
    } catch (e) {
      // 不是 JSON，直接返回原始 body
      $done({ body: $response.body });
      return;
    }

    const url = $request && $request.url ? $request.url : "";

    // 将单个广告项置为不可见（display_time = 0），并把 end_time 设为很大的数（远未来）
    function neutralizeAdItem(adItem) {
      try {
        if (!adItem) return;
        if (adItem.set && typeof adItem.set === "object") {
          adItem.set.display_time = 0;
        }
        if (Array.isArray(adItem.creative) && adItem.creative[0]) {
          // 0x8585fb80 = 2249920000 (一个很大的时间戳示例)
          adItem.creative[0].end_time = 0x8585fb80;
        }
        // 有些格式可能是直接在 creative[0] 的字段中包含 start/end/display
        if (Array.isArray(adItem) && adItem.length) {
          adItem.forEach((a) => neutralizeAdItem(a));
        }
      } catch (e) {
        /* 忽略异常 */
      }
    }

    // 通用清理：根据关键字段名进行清空/删除
    function genericCleanup(root) {
      if (!root || typeof root !== "object") return;

      const keywordsEmptyArrays = [
        "ad",
        "ads",
        "advert",
        "cardList",
        "noticeList",
        "msgs",
        "messages",
        "pull3",
        "banners",
        "recommend",
        "recommend_list",
        "taskList",
      ];

      const keywordsRemoveKeys = [
        "scene",
        "sceneId",
        "aiNative",
        "ai_",
        "his_input_tip",
      ];

      // 1) 针对显式字段的处理
      for (const k of keywordsEmptyArrays) {
        if (root[k]) {
          // 对于 ad 特殊处理：遍历每一项并 neutralize
          if (k === "ad" || k === "ads" || k === "advert") {
            if (Array.isArray(root[k])) {
              root[k].forEach((item) => neutralizeAdItem(item));
              // 也可以直接清空数组以彻底去掉
              root[k] = [];
            } else if (typeof root[k] === "object") {
              neutralizeAdItem(root[k]);
              root[k] = {};
            } else {
              root[k] = Array.isArray(root[k])
                ? []
                : typeof root[k] === "object"
                  ? {}
                  : "";
            }
          } else {
            // 其余字段直接置空数组或对象
            if (Array.isArray(root[k])) root[k] = [];
            else if (typeof root[k] === "object") root[k] = {};
            else root[k] = "";
          }
        }
      }

      // 2) 删除或置空敏感字段
      for (const k of keywordsRemoveKeys) {
        if (root.hasOwnProperty(k)) {
          delete root[k];
        }
      }

      // 3) 针对 pull3.msgs、pull3.* 等嵌套字段做保护性清理
      if (root.pull3 && typeof root.pull3 === "object") {
        if (Array.isArray(root.pull3.msgs)) root.pull3.msgs = [];
        // 如果 pull3 下还有其他数组字段，也可以遍历清理
        Object.keys(root.pull3).forEach((pk) => {
          if (Array.isArray(root.pull3[pk])) root.pull3[pk] = [];
          else if (typeof root.pull3[pk] === "object") root.pull3[pk] = {};
        });
      }

      // 4) 针对 msgs/noticeList 等常见字段
      if (Array.isArray(root.msgs)) root.msgs = [];
      if (Array.isArray(root.noticeList)) root.noticeList = [];

      // 5) 递归到子对象进一步清理（防止深层嵌套广告）
      for (const key in root) {
        if (!root.hasOwnProperty(key)) continue;
        const val = root[key];
        if (typeof val === "object" && val !== null) {
          genericCleanup(val);
        } else {
          // 如果字段名中含有某些关键字，也把值清空
          const lk = key.toLowerCase();
          if (
            lk.includes("ad") ||
            lk.includes("advert") ||
            lk.includes("notice") ||
            lk.includes("msg") ||
            lk.includes("recommend") ||
            lk.includes("banner") ||
            lk.includes("ai")
          ) {
            // 对于 id/name 等敏感键不盲目删除，优先清空可能导致逻辑错误的数组/对象
            if (Array.isArray(val)) root[key] = [];
            else root[key] = typeof val === "string" ? "" : null;
          }
        }
      }
    }

    // 根据 URL 做一些特殊分支（参考原脚本有很多 URL 分支，在这里做通用化处理）
    // 你可以根据需要把下面的关键字替换为实际接口路径以更精确地控制处理逻辑
    const urlContains = (s) => url && url.indexOf(s) !== -1;

    // 特殊处理一：如果返回体内有 data.ad（原脚本针对广告数组做了显示时间和结束时间调整）
    if (obj.data && (obj.data.ad || obj.data.ads)) {
      const adField = obj.data.ad || obj.data.ads;
      if (Array.isArray(adField)) {
        adField.forEach((item) => neutralizeAdItem(item));
      } else if (typeof adField === "object") {
        neutralizeAdItem(adField);
      }
      // 为保险起见，清空 ads 列表
      obj.data.ad = [];
      obj.data.ads = [];
    }

    // 根据不同接口的可能字段作进一步处理（模拟原脚本大量判断的用意）
    // - 首页/卡片列表类：清 cardList 并保留比较重要的类型（如需要可调整）
    if (obj.data && Array.isArray(obj.data.cardList)) {
      // 如果想保留特定类型（示例保留 MyOrderCard / FrequentLocation），否则直接清空：
      obj.data.cardList = obj.data.cardList.filter((item) => {
        try {
          const dt = item && (item.dataType || item.type || item.cardType);
          return dt === "MyOrderCard" || dt === "FrequentLocation";
        } catch (e) {
          return false;
        }
      });
    }

    // - pull3 / msgs / noticeList 等
    if (obj.pull3 && Array.isArray(obj.pull3.msgs)) obj.pull3.msgs = [];
    if (Array.isArray(obj.msgs)) obj.msgs = [];
    if (obj.data && Array.isArray(obj.data.cardList)) obj.data.cardList = [];

    if (obj.noticeList && Array.isArray(obj.noticeList)) obj.noticeList = [];

    // - 针对一些会在原脚本里出现的路径做额外清理（例如 ws/message/notice/list）
    if (urlContains("ws/message/notice/list")) {
      if (obj.noticeList) obj.noticeList = [];
    }

    // - 针对包含关键词（ai/aiNative/his_input_tip/ai_ 等）的键，把它们处理为禁用状态
    if (obj.data && typeof obj.data === "object") {
      Object.keys(obj.data).forEach((k) => {
        const lk = k.toLowerCase();
        if (lk.includes("ai") || lk.includes("his_input_tip")) {
          obj.data[k] = { status: 0, version: "", value: "" };
        }
      });
    }

    // 通用深层清理（递归）
    genericCleanup(obj);

    // 最终返回修改后的 body
    $done({ body: JSON.stringify(obj) });
  } catch (err) {
    // 任何异常时，保险返回原始响应体，避免破坏业务
    try {
      $done({ body: $response.body });
    } catch (e) {
      $done({});
    }
  }
})();

// 
let config = {
  global_direct: $argument.global_direct,
  global_proxy: $argument.global_proxy,
  silence: true,  // 是否静默运行，默认false
  cellular: "RULE",  // 蜂窝数据下的模式，RULE代表规则模式，PROXY代表全局代理，DIRECT代表全局直连
  wifi: "RULE",  // wifi下默认的模式
  all_direct: [$argument.wifi_direct],  // 指定全局直连的wifi名字
  all_proxy: [$argument.wifi_proxy],  // 指定全局代理的wifi名字
  whitelist: ["REJECT"],  // 指定白名单策略
};

// get current decisions
let groups = Object.keys($surge.selectGroupDetails().groups);
let ssid = $network.wifi.ssid;

manager()
  .catch((err) => {
    $notification.post(`SSID 自动策略`, `出错`, err);
    console.log(`ERROR: ` + err);
  })
  .finally(() => {
    $done();
  });

async function manager() {
  // get current outbound mode
  const previousMode = $persistentStore.read("surge_auto_policy_mode") || "RULE";
  console.log(`Previous outbound mode: ${previousMode}`);

  // no network connection
  const v4_ip = $network.v4.primaryAddress;
  if (!config.silence && !v4_ip) {
    $notification.post(`SSID 自动策略`, `无网络`, "");
    return;
  }

  const targetMode = ssid ? getSSIDMode(ssid) : config.cellular;

  console.log(`Switch from mode ${previousMode} to ${targetMode}`);

  if (previousMode === "RULE" && targetMode !== "RULE") {
    // save decisions before executing switch
    saveDecisions();
    // execute policy switch
    for (let group of groups) {
      if (config.whitelist.indexOf(group) !== -1) continue;
      const decision = targetMode === "PROXY" ? config.global_proxy : config.global_direct;
      $surge.setSelectGroupPolicy(group, decision);
      console.log(`Switch Policy: ${group} ==> ${decision}`);
    }
  }
  if (previousMode !== "RULE" && targetMode === "RULE") {
    // load decisions
    restoreDecisions();
  }

  $persistentStore.write(targetMode, "surge_auto_policy_mode");
  if (!config.silence) {
    $notification.post(
      `SSID 自动策略`,
      `当前网络：${ssid ? ssid : "蜂窝数据"}`,
      `Surge 已切换至${lookupOutbound(targetMode)}`
    );
  }
}

function saveDecisions() {
  // get current policy groups
  let decisions = $surge.selectGroupDetails().decisions;
  for (let d of Object.keys(decisions)) {
    if (groups.indexOf(d) === -1) delete decisions[d];
  }
  $persistentStore.write(
    JSON.stringify(decisions),
    "surge_auto_policy_decisions"
  );
}

function restoreDecisions() {
  const decisions = JSON.parse(
    $persistentStore.read("surge_auto_policy_decisions")
  );
  for (let group of groups) {
    $surge.setSelectGroupPolicy(group, decisions[group]);
    console.log(`Restore Policy: ${group} ==> ${decisions[group]}`);
  }
}

function getSSIDMode(ssid) {
  const map = {};
  config.all_direct.map((id) => (map[id] = "DIRECT"));
  config.all_proxy.map((id) => (map[id] = "PROXY"));
  const matched = map[ssid];
  return matched ? matched : config.wifi;
}

function lookupOutbound(mode) {
  return {
    RULE: "规则模式",
    PROXY: "全局代理模式",
    DIRECT: "全局直连模式",
  }[mode];
}

const LOGISTICS_SETTINGS_KEY = 'logistics_settings';
const EXCEPTION_TEMPLATES_KEY = 'exception_templates';
const WAYBILL_DATA_KEY = 'waybill_data';

const defaultSettings = {
  carriers: [
    { id: 'sf', name: '顺丰速运', basePrice: 12, pricePerKg: 2, weightLimit: 50, deliveryAreas: ['北京市', '上海市', '广州市', '深圳市', '杭州市', '南京市', '成都市', '武汉市', '西安市', '重庆市'] },
    { id: 'jd', name: '京东物流', basePrice: 10, pricePerKg: 1.5, weightLimit: 80, deliveryAreas: ['北京市', '上海市', '广州市', '深圳市', '杭州市', '南京市', '成都市', '武汉市', '西安市', '重庆市', '苏州市', '天津市'] },
    { id: 'zt', name: '中通快递', basePrice: 8, pricePerKg: 1, weightLimit: 100, deliveryAreas: ['北京市', '上海市', '广州市', '深圳市', '杭州市', '南京市', '成都市', '武汉市', '西安市', '重庆市', '苏州市', '天津市', '东莞市', '佛山市'] },
    { id: 'yt', name: '圆通速递', basePrice: 7, pricePerKg: 0.8, weightLimit: 100, deliveryAreas: ['北京市', '上海市', '广州市', '深圳市', '杭州市', '南京市', '成都市', '武汉市', '西安市', '重庆市', '苏州市', '天津市', '东莞市', '佛山市'] }
  ],
  timeWindows: {
    morning: { start: '08:00', end: '12:00', label: '上午' },
    afternoon: { start: '13:00', end: '18:00', label: '下午' },
    evening: { start: '18:00', end: '21:00', label: '晚间' }
  },
  weightThreshold: 50,
  maxAddressLength: 200,
  minAddressLength: 10
};

const defaultTemplates = [
  { id: 't1', name: '地址不完整', content: '收件地址信息不完整，请补充详细地址（门牌号/楼层/房间号）', type: 'address' },
  { id: 't2', name: '超区件', content: '收件地址超出当前承运商派送范围，建议更换承运商或联系客户自提', type: 'area' },
  { id: 't3', name: '超重件', content: '包裹重量超出承运商限制，建议拆分包裹或选择其他承运商', type: 'weight' },
  { id: 't4', name: '重复运单', content: '检测到重复运单号，请核实是否重复下单', type: 'duplicate' },
  { id: 't5', name: '时效不匹配', content: '配送时效要求与承运商服务能力不匹配，建议调整时效或更换承运商', type: 'time' },
  { id: 't6', name: '路线绕路', content: '当前路线存在绕路情况，建议优化配送顺序或合并同方向订单', type: 'route' }
];

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await chrome.storage.local.get(LOGISTICS_SETTINGS_KEY);
  if (!settings[LOGISTICS_SETTINGS_KEY]) {
    await chrome.storage.local.set({ [LOGISTICS_SETTINGS_KEY]: defaultSettings });
  }

  const templates = await chrome.storage.local.get(EXCEPTION_TEMPLATES_KEY);
  if (!templates[EXCEPTION_TEMPLATES_KEY]) {
    await chrome.storage.local.set({ [EXCEPTION_TEMPLATES_KEY]: defaultTemplates });
  }

  chrome.contextMenus.create({
    id: 'logistics-extract',
    title: '提取运单信息',
    contexts: ['page', 'selection']
  });

  chrome.contextMenus.create({
    id: 'logistics-check',
    title: '检查当前运单异常',
    contexts: ['page', 'selection']
  });

  chrome.contextMenus.create({
    id: 'logistics-sidebar',
    title: '打开物流助手侧边栏',
    contexts: ['page']
  });

  chrome.action.onClicked.addListener(async (tab) => {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'logistics-extract') {
    chrome.tabs.sendMessage(tab.id, { action: 'extractWaybill' });
  } else if (info.menuItemId === 'logistics-check') {
    chrome.tabs.sendMessage(tab.id, { action: 'checkExceptions' });
  } else if (info.menuItemId === 'logistics-sidebar') {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getSettings':
      handleGetSettings(sendResponse);
      return true;
    case 'saveSettings':
      handleSaveSettings(request.data, sendResponse);
      return true;
    case 'getTemplates':
      handleGetTemplates(sendResponse);
      return true;
    case 'saveTemplate':
      handleSaveTemplate(request.data, sendResponse);
      return true;
    case 'deleteTemplate':
      handleDeleteTemplate(request.id, sendResponse);
      return true;
    case 'saveWaybillData':
      handleSaveWaybillData(request.data, sendResponse);
      return true;
    case 'getWaybillData':
      handleGetWaybillData(sendResponse);
      return true;
    case 'clearWaybillData':
      handleClearWaybillData(sendResponse);
      return true;
    case 'checkExceptions':
      handleCheckExceptions(request.data, sendResponse);
      return true;
    case 'estimateCost':
      handleEstimateCost(request.data, sendResponse);
      return true;
    case 'checkRoute':
      handleCheckRoute(request.data, sendResponse);
      return true;
    case 'exportData':
      handleExportData(request.data, sendResponse);
      return true;
    case 'showNotification':
      handleShowNotification(request.data);
      return false;
  }
});

async function handleGetSettings(sendResponse) {
  const result = await chrome.storage.local.get(LOGISTICS_SETTINGS_KEY);
  sendResponse({ success: true, data: result[LOGISTICS_SETTINGS_KEY] || defaultSettings });
}

async function handleSaveSettings(data, sendResponse) {
  await chrome.storage.local.set({ [LOGISTICS_SETTINGS_KEY]: data });
  sendResponse({ success: true });
}

async function handleGetTemplates(sendResponse) {
  const result = await chrome.storage.local.get(EXCEPTION_TEMPLATES_KEY);
  sendResponse({ success: true, data: result[EXCEPTION_TEMPLATES_KEY] || defaultTemplates });
}

async function handleSaveTemplate(template, sendResponse) {
  const result = await chrome.storage.local.get(EXCEPTION_TEMPLATES_KEY);
  const templates = result[EXCEPTION_TEMPLATES_KEY] || [];
  const existingIndex = templates.findIndex(t => t.id === template.id);
  if (existingIndex >= 0) {
    templates[existingIndex] = template;
  } else {
    template.id = 't' + Date.now();
    templates.push(template);
  }
  await chrome.storage.local.set({ [EXCEPTION_TEMPLATES_KEY]: templates });
  sendResponse({ success: true, data: templates });
}

async function handleDeleteTemplate(id, sendResponse) {
  const result = await chrome.storage.local.get(EXCEPTION_TEMPLATES_KEY);
  const templates = result[EXCEPTION_TEMPLATES_KEY] || [];
  const filtered = templates.filter(t => t.id !== id);
  await chrome.storage.local.set({ [EXCEPTION_TEMPLATES_KEY]: filtered });
  sendResponse({ success: true, data: filtered });
}

async function handleSaveWaybillData(data, sendResponse) {
  const result = await chrome.storage.local.get(WAYBILL_DATA_KEY);
  const existing = result[WAYBILL_DATA_KEY] || [];
  const existingMap = new Map(existing.map(w => [w.waybillNumber, w]));
  data.forEach(w => existingMap.set(w.waybillNumber, { ...existingMap.get(w.waybillNumber), ...w, updatedAt: new Date().toISOString() }));
  const merged = Array.from(existingMap.values());
  await chrome.storage.local.set({ [WAYBILL_DATA_KEY]: merged });
  sendResponse({ success: true, data: merged });
}

async function handleGetWaybillData(sendResponse) {
  const result = await chrome.storage.local.get(WAYBILL_DATA_KEY);
  sendResponse({ success: true, data: result[WAYBILL_DATA_KEY] || [] });
}

async function handleClearWaybillData(sendResponse) {
  await chrome.storage.local.remove(WAYBILL_DATA_KEY);
  sendResponse({ success: true });
}

function handleCheckExceptions(data, sendResponse) {
  const { waybills, settings } = data;
  const exceptions = [];

  waybills.forEach(waybill => {
    const waybillExceptions = [];

    if (!waybill.address || waybill.address.length < settings.minAddressLength) {
      waybillExceptions.push({
        type: 'address_incomplete',
        severity: 'high',
        message: '地址信息不完整',
        suggestion: '请补充详细的收件地址'
      });
    } else if (waybill.address.length > settings.maxAddressLength) {
      waybillExceptions.push({
        type: 'address_too_long',
        severity: 'medium',
        message: '地址信息过长',
        suggestion: '请精简地址描述'
      });
    }

    if (waybill.carrier) {
      const carrier = settings.carriers.find(c => c.id === waybill.carrier);
      if (carrier && waybill.address) {
        const province = extractProvince(waybill.address);
        const city = extractCity(waybill.address);
        const inArea = carrier.deliveryAreas.some(area => 
          waybill.address.includes(area) || province === area || city === area
        );
        if (!inArea) {
          waybillExceptions.push({
            type: 'out_of_area',
            severity: 'high',
            message: '地址超出承运商派送范围',
            suggestion: `建议更换承运商，${carrier.name}暂不支持该地区派送`
          });
        }
      }
    }

    if (waybill.weight && waybill.weight > settings.weightThreshold) {
      const carrier = settings.carriers.find(c => c.id === waybill.carrier);
      if (carrier && waybill.weight > carrier.weightLimit) {
        waybillExceptions.push({
          type: 'overweight',
          severity: 'high',
          message: `包裹超重（${waybill.weight}kg）`,
          suggestion: `${carrier.name}限重${carrier.weightLimit}kg，建议拆分或更换承运商`
        });
      } else {
        waybillExceptions.push({
          type: 'weight_warning',
          severity: 'medium',
          message: `包裹重量较大（${waybill.weight}kg）`,
          suggestion: '请注意搬运和运输安全'
        });
      }
    }

    if (waybill.timeRequirement) {
      const isExpress = waybill.timeRequirement.includes('当日') || waybill.timeRequirement.includes('次日') || waybill.timeRequirement.includes('急');
      if (isExpress) {
        waybillExceptions.push({
          type: 'time_critical',
          severity: 'medium',
          message: '时效要求较高',
          suggestion: '建议选择时效快的承运商（如顺丰）'
        });
      }
    }

    const duplicates = waybills.filter(w => w.waybillNumber === waybill.waybillNumber);
    if (duplicates.length > 1) {
      waybillExceptions.push({
        type: 'duplicate',
        severity: 'high',
        message: '检测到重复运单',
        suggestion: `共有${duplicates.length}条相同运单号记录，请核实`
      });
    }

    if (waybillExceptions.length > 0) {
      exceptions.push({
        waybillNumber: waybill.waybillNumber,
        address: waybill.address,
        weight: waybill.weight,
        carrier: waybill.carrier,
        exceptions: waybillExceptions
      });
    }
  });

  sendResponse({ success: true, data: exceptions });
}

function handleEstimateCost(data, sendResponse) {
  const { waybills, settings } = data;
  const estimates = waybills.map(waybill => {
    const carrier = settings.carriers.find(c => c.id === waybill.carrier) || settings.carriers[0];
    const weight = waybill.weight || 1;
    const basePrice = carrier.basePrice;
    const additionalWeight = Math.max(0, weight - 1);
    const additionalCost = additionalWeight * carrier.pricePerKg;
    const totalCost = basePrice + additionalCost;

    const deliveryWindow = estimateDeliveryWindow(waybill.timeRequirement, waybill.address, settings);

    return {
      waybillNumber: waybill.waybillNumber,
      carrier: carrier.name,
      carrierId: carrier.id,
      weight: weight,
      basePrice: basePrice,
      additionalCost: additionalCost,
      totalCost: totalCost,
      deliveryWindow: deliveryWindow,
      notes: []
    };
  });

  sendResponse({ success: true, data: estimates });
}

function handleCheckRoute(data, sendResponse) {
  const { waybills } = data;
  const routeAnalysis = [];

  const groupedByCity = {};
  waybills.forEach(waybill => {
    const city = extractCity(waybill.address) || '未知';
    if (!groupedByCity[city]) {
      groupedByCity[city] = [];
    }
    groupedByCity[city].push(waybill);
  });

  Object.entries(groupedByCity).forEach(([city, cityWaybills]) => {
    if (cityWaybills.length >= 2) {
      const areaGroups = {};
      cityWaybills.forEach(w => {
        const area = extractArea(w.address) || city;
        if (!areaGroups[area]) {
          areaGroups[area] = [];
        }
        areaGroups[area].push(w);
      });

      Object.entries(areaGroups).forEach(([area, areaWaybills]) => {
        if (areaWaybills.length >= 2) {
          routeAnalysis.push({
            type: 'merge_opportunity',
            severity: 'low',
            area: area,
            city: city,
            waybills: areaWaybills.map(w => w.waybillNumber),
            count: areaWaybills.length,
            message: `发现${areaWaybills.length}个同区域订单可合并配送`,
            suggestion: '建议合并派送以降低成本和提高效率'
          });
        }
      });
    }
  });

  const mainCities = Object.keys(groupedByCity).filter(c => c !== '未知');
  if (mainCities.length > 3) {
    routeAnalysis.push({
      type: 'multiple_cities',
      severity: 'medium',
      cities: mainCities,
      count: mainCities.length,
      message: `订单分布在${mainCities.length}个城市`,
      suggestion: '建议按城市分批次处理，优化运输路线'
    });
  }

  sendResponse({ success: true, data: routeAnalysis });
}

function handleExportData(data, sendResponse) {
  const { records, format, filename } = data;
  let content = '';
  let mimeType = '';

  if (format === 'csv') {
    const headers = ['运单号', '地址', '重量(kg)', '承运商', '时效要求', '异常类型', '异常信息', '处理建议', '备注'];
    const rows = records.map(r => [
      r.waybillNumber || '',
      r.address || '',
      r.weight || '',
      r.carrierName || '',
      r.timeRequirement || '',
      r.exceptionTypes ? r.exceptionTypes.join('; ') : '',
      r.messages ? r.messages.join('; ') : '',
      r.suggestions ? r.suggestions.join('; ') : '',
      r.remark || ''
    ]);
    content = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    mimeType = 'text/csv;charset=utf-8';
    content = '\ufeff' + content;
  } else {
    content = JSON.stringify(records, null, 2);
    mimeType = 'application/json';
  }

  const base64Content = btoa(unescape(encodeURIComponent(content)));
  const dataUrl = `data:${mimeType};base64,${base64Content}`;

  chrome.downloads.download({
    url: dataUrl,
    filename: filename || `物流异常清单_${new Date().toISOString().slice(0, 10)}.${format}`,
    saveAs: true
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
    } else {
      sendResponse({ success: true, downloadId });
    }
  });
}

function handleShowNotification(data) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.svg',
    title: data.title || '智慧物流助手',
    message: data.message || ''
  });
}

function extractProvince(address) {
  if (!address) return '';
  const provinceMatch = address.match(/^(北京|上海|天津|重庆|内蒙古|广西|西藏|宁夏|新疆|河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海)/);
  return provinceMatch ? provinceMatch[0] + (provinceMatch[0].length <= 2 ? '市' : '自治区/省') : '';
}

function extractCity(address) {
  if (!address) return '';
  const cityPatterns = [
    /([\u4e00-\u9fa5]{2,10}?)市/,
    /([\u4e00-\u9fa5]{2,10}?)自治州/,
    /([\u4e00-\u9fa5]{2,10}?)地区/,
    /([\u4e00-\u9fa5]{2,10}?)盟/
  ];

  for (const pattern of cityPatterns) {
    const match = address.match(pattern);
    if (match) {
      return match[1] + '市';
    }
  }

  const directCityMatch = address.match(/^(北京|上海|天津|重庆)/);
  if (directCityMatch) {
    return directCityMatch[1] + '市';
  }

  return '';
}

function extractArea(address) {
  if (!address) return '';
  const areaPatterns = [
    /[\u4e00-\u9fa5]{2,10}?市([\u4e00-\u9fa5]{2,10}?)区/,
    /[\u4e00-\u9fa5]{2,10}?市([\u4e00-\u9fa5]{2,10}?)县/,
    /[\u4e00-\u9fa5]{2,10}?市([\u4e00-\u9fa5]{2,10}?)市/
  ];

  for (const pattern of areaPatterns) {
    const match = address.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return '';
}

function estimateDeliveryWindow(timeRequirement, address, settings) {
  const now = new Date();
  const windows = settings.timeWindows;

  if (timeRequirement && timeRequirement.includes('当日')) {
    if (now.getHours() < 12) {
      return windows.afternoon;
    } else {
      return windows.evening;
    }
  }

  if (timeRequirement && timeRequirement.includes('上午')) {
    return windows.morning;
  }

  if (timeRequirement && timeRequirement.includes('下午')) {
    return windows.afternoon;
  }

  if (timeRequirement && timeRequirement.includes('晚上') || timeRequirement?.includes('晚间')) {
    return windows.evening;
  }

  if (now.getHours() < 10) {
    return windows.morning;
  } else if (now.getHours() < 15) {
    return windows.afternoon;
  } else {
    return windows.evening;
  }
}
